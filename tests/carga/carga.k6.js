// tests/carga/carga.k6.js
// Load test against the Azure deployment (Fase 2, E14).
// Scenario: ramp from 0 to 50 virtual users in 1 minute, hold 50 users
// for 5 minutes, ramp down in 30 seconds.
// Critical endpoints:
//   1. GET  /productos     (public catalog, catalogo service)
//   2. GET  /pedidos/mios  (order history of a client, pedidos service, JWT)
// The client logs in ONCE in setup(); the token is shared by every VU so the
// login rate limit and bcrypt are not part of the measured load.
//
// Run through scripts/carga-azure.sh, which sets the URLs and the results dir:
//   K6_CORREO=... K6_CONTRASENA=... npm run test:carga:azure
import http from "k6/http";
import { check, sleep } from "k6";

const AUTH_URL = __ENV.AUTH_URL;
const CATALOGO_URL = __ENV.CATALOGO_URL;
const PEDIDOS_URL = __ENV.PEDIDOS_URL;
const RESULTADOS = __ENV.RESULTADOS_DIR || "test-results/carga";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  // RNF-01: main pages load in at most 3 s -> p95 of every request < 3000 ms.
  // RNF-04: 99 % availability -> less than 1 % failed requests.
  thresholds: {
    http_req_duration: ["p(95)<3000"],
    "http_req_duration{endpoint:catalogo}": ["p(95)<3000"],
    "http_req_duration{endpoint:pedidos}": ["p(95)<3000"],
    http_req_failed: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"],
};

export function setup() {
  if (!AUTH_URL || !CATALOGO_URL || !PEDIDOS_URL) {
    throw new Error("AUTH_URL, CATALOGO_URL and PEDIDOS_URL are required");
  }
  if (!__ENV.K6_CORREO || !__ENV.K6_CONTRASENA) {
    throw new Error("K6_CORREO and K6_CONTRASENA (a client account) are required");
  }
  const res = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify({ correo: __ENV.K6_CORREO, contrasena: __ENV.K6_CONTRASENA }),
    { headers: { "Content-Type": "application/json" }, tags: { endpoint: "login-setup" } }
  );
  if (res.status !== 200 || !res.json("token")) {
    throw new Error(`Login failed in setup: HTTP ${res.status}`);
  }
  return { token: res.json("token") };
}

export default function (data) {
  const catalogo = http.get(`${CATALOGO_URL}/productos`, {
    tags: { endpoint: "catalogo" },
  });
  check(catalogo, {
    "catalogo: 200": (r) => r.status === 200,
    "catalogo: lista de productos": (r) => Array.isArray(r.json()),
  });

  sleep(1);

  const pedidos = http.get(`${PEDIDOS_URL}/pedidos/mios`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: "pedidos" },
  });
  check(pedidos, {
    "pedidos: 200": (r) => r.status === 200,
    "pedidos: lista de pedidos": (r) => Array.isArray(r.json()),
  });

  sleep(1);
}

function metrica(data, nombre, campo) {
  const m = data.metrics[nombre];
  return m && m.values[campo] !== undefined ? m.values[campo] : null;
}

function ms(v) {
  return v === null ? "-" : `${v.toFixed(0)} ms`;
}

export function handleSummary(data) {
  const filas = [
    ["Global", "http_req_duration"],
    ["GET /productos", "http_req_duration{endpoint:catalogo}"],
    ["GET /pedidos/mios", "http_req_duration{endpoint:pedidos}"],
  ].map(([nombre, m]) =>
    `| ${nombre} | ${ms(metrica(data, m, "avg"))} | ${ms(metrica(data, m, "p(95)"))} | ${ms(metrica(data, m, "max"))} |`
  );
  const reqs = metrica(data, "http_reqs", "count");
  const rps = metrica(data, "http_reqs", "rate");
  const errores = metrica(data, "http_req_failed", "rate");
  const vus = metrica(data, "vus_max", "max");
  const umbrales = Object.entries(data.metrics)
    .filter(([, m]) => m.thresholds)
    .flatMap(([nombre, m]) =>
      Object.entries(m.thresholds).map(([regla, r]) => `| ${nombre} | ${regla} | ${r.ok ? "Cumple" : "No cumple"} |`)
    );

  const md = [
    "# Prueba de carga — Panadería El Frutal (Azure)",
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Usuarios virtuales máximos: ${vus}`,
    "",
    "| Endpoint | Promedio | Percentil 95 | Máximo |",
    "|---|---|---|---|",
    ...filas,
    "",
    `Solicitudes: ${reqs} · Throughput: ${rps === null ? "-" : rps.toFixed(2)} req/s · Tasa de error: ${errores === null ? "-" : (errores * 100).toFixed(2)} %`,
    "",
    "| Métrica | Umbral | Resultado |",
    "|---|---|---|",
    ...umbrales,
    "",
  ].join("\n");

  return {
    stdout: `\n${md}\n`,
    [`${RESULTADOS}/resumen.md`]: md,
    [`${RESULTADOS}/resumen.json`]: JSON.stringify(data, null, 2),
  };
}
