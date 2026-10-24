// tests/e2e/seguridad.e2e.test.js
// Suite E2E de seguridad (SEC-01..SEC-08) contra servicios REALES
// (docker compose por defecto; AUTH_URL/CATALOGO_URL/PEDIDOS_URL/
// PAGOS_URL apuntan a Azure). Cada caso es independiente y usa
// correos desechables únicos para no bloquear cuentas reales.
const crypto = require("crypto");
const { credencial } = require("./credenciales");

const AUTH_URL = process.env.AUTH_URL || "http://localhost:3001";
const CATALOGO_URL = process.env.CATALOGO_URL || "http://localhost:3002";
const PEDIDOS_URL = process.env.PEDIDOS_URL || "http://localhost:3003";
const PAGOS_URL = process.env.PAGOS_URL || "http://localhost:3004";
const ORIGEN_PERMITIDO = process.env.CORS_PERMITIDO || "http://localhost:5173";
const ORIGEN_AJENO = "https://sitio-malicioso.example";

const SERVICIOS = { auth: AUTH_URL, catalogo: CATALOGO_URL, pedidos: PEDIDOS_URL, pagos: PAGOS_URL };
// Un endpoint protegido por servicio.
const PROTEGIDOS = {
  auth: `${AUTH_URL}/auth/me`,
  catalogo: `${CATALOGO_URL}/productos/todos`,
  pedidos: `${PEDIDOS_URL}/pedidos`,
  pagos: `${PAGOS_URL}/pagos`,
};

const itHttps = AUTH_URL.startsWith("https") ? it : it.skip;

function correoUnico(prefijo) {
  return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@correo.com`;
}

async function api(method, url, { body, token, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_err) {
    json = null;
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(correo, contrasena) {
  const r = await api("POST", `${AUTH_URL}/auth/login`, { body: { correo, contrasena } });
  if (r.status !== 200) throw new Error(`Login falló para ${correo}: ${r.status}`);
  return r.body;
}

function loginComo(rol) {
  const { correo, contrasena } = credencial(rol);
  return login(correo, contrasena);
}

// JWT HS256 armado a mano: permite firmar con un secreto equivocado.
function jwtFalso(payload, secreto = "secreto-equivocado") {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cuerpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  const firma = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

describe("Seguridad", () => {
  it("SEC-01 el logout revoca el token en catalogo, pedidos y pagos (401)", async () => {
    const sesion = await loginComo("admin");
    const antes = await api("GET", PROTEGIDOS.catalogo, { token: sesion.token });
    expect(antes.status).toBe(200);

    const logout = await api("POST", `${AUTH_URL}/auth/logout`, { token: sesion.token });
    expect(logout.status).toBe(200);

    const resultados = await Promise.all(
      ["auth", "catalogo", "pedidos", "pagos"].map((s) =>
        api("GET", PROTEGIDOS[s], { token: sesion.token })
      )
    );
    for (const r of resultados) {
      expect(r.status).toBe(401);
      expect(r.body.error).toMatch(/Sesión cerrada/);
    }
  });

  it("SEC-02 seis inicios de sesión fallidos del mismo correo: el 6.º responde 429", async () => {
    const correo = correoUnico("sec02");
    const estados = [];
    for (let i = 0; i < 6; i++) {
      const r = await api("POST", `${AUTH_URL}/auth/login`, {
        body: { correo, contrasena: "Incorrecta123" },
      });
      estados.push(r.status);
      if (i === 5) {
        expect(r.body.error).toMatch(/Demasiados intentos/);
        expect(r.headers.get("ratelimit-limit")).toBeTruthy();
      }
    }
    expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(estados[5]).toBe(429);

    // Otro correo desde la misma IP no queda bloqueado.
    const otro = await api("POST", `${AUTH_URL}/auth/login`, {
      body: { correo: correoUnico("sec02b"), contrasena: "Incorrecta123" },
    });
    expect(otro.status).toBe(401);
  });

  it("SEC-03 CORS: un origen ajeno no recibe Access-Control-Allow-Origin y el permitido sí", async () => {
    for (const [nombre, base] of Object.entries(SERVICIOS)) {
      const ajeno = await api("GET", `${base}/health`, { headers: { Origin: ORIGEN_AJENO } });
      expect({ nombre, acao: ajeno.headers.get("access-control-allow-origin") }).toEqual({
        nombre,
        acao: null,
      });
      const permitido = await api("GET", `${base}/health`, {
        headers: { Origin: ORIGEN_PERMITIDO },
      });
      expect({ nombre, acao: permitido.headers.get("access-control-allow-origin") }).toEqual({
        nombre,
        acao: ORIGEN_PERMITIDO,
      });
    }
  });

  it("SEC-04 cabeceras de seguridad presentes y sin X-Powered-By en los 4 servicios", async () => {
    const esHttps = AUTH_URL.startsWith("https");
    for (const [nombre, base] of Object.entries(SERVICIOS)) {
      const { headers } = await api("GET", `${base}/health`);
      const h = (k) => ({ nombre, valor: headers.get(k) });
      expect(h("x-content-type-options")).toEqual({ nombre, valor: "nosniff" });
      expect(
        headers.get("x-frame-options") || headers.get("content-security-policy")
      ).toBeTruthy();
      expect(h("x-powered-by")).toEqual({ nombre, valor: null });
      if (esHttps) expect(headers.get("strict-transport-security")).toBeTruthy();
    }
  });

  itHttps("SEC-05 la URL http:// de cada servicio redirige a https", async () => {
    for (const [nombre, base] of Object.entries(SERVICIOS)) {
      const res = await fetch(`${base.replace(/^https:/, "http:")}/health`, { redirect: "manual" });
      expect({ nombre, redirige: [301, 302, 307, 308].includes(res.status) }).toEqual({
        nombre,
        redirige: true,
      });
      expect(res.headers.get("location")).toMatch(/^https:\/\//);
    }
  });

  it("SEC-06 un login con inyección SQL responde 400/401, nunca 500", async () => {
    const r = await api("POST", `${AUTH_URL}/auth/login`, {
      body: { correo: "' OR '1'='1", contrasena: "x" },
    });
    expect([400, 401]).toContain(r.status);
    expect(r.body.token).toBeUndefined();
  });

  it("SEC-07 un cliente no puede crear productos (403)", async () => {
    const correo = correoUnico("sec07");
    const reg = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Cliente SEC-07", correo, contrasena: "Pass1234" },
    });
    expect(reg.status).toBe(201);
    const sesion = await login(correo, "Pass1234");
    const r = await api("POST", `${CATALOGO_URL}/productos`, {
      token: sesion.token,
      body: { nombre: "Producto no autorizado", precio: 10 },
    });
    expect(r.status).toBe(403);
  });

  it("SEC-08 un JWT falsificado o vencido (secreto equivocado) responde 401 en todos los servicios", async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const base = { idUsuario: 1, rol: "administrador", jti: "forjado-sec08" };
    const tokens = [
      jwtFalso({ ...base, iat: ahora, exp: ahora + 3600 }),
      jwtFalso({ ...base, iat: ahora - 7200, exp: ahora - 3600 }),
    ];
    for (const [nombre, url] of Object.entries(PROTEGIDOS)) {
      for (const token of tokens) {
        const r = await api("GET", url, { token });
        expect({ nombre, status: r.status }).toEqual({ nombre, status: 401 });
      }
    }
  });
});
