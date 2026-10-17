// tests/pagos.test.js
// Pruebas unitarias del microservicio de pagos (RF-13..16, RF-20).
// lib/db se mockea: corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.PASARELA_MODO = "simulada";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pruebasSeguridadComunes } = require("./helpers/seguridad");
const { pruebasTelemetria } = require("./helpers/telemetria");

const mockQuery = jest.fn();
const mockConTransaccion = jest.fn();
const mockMapearErrorDb = jest.fn(() => null);

jest.mock("../src/pagos/lib/db", () => ({
  query: (...args) => mockQuery(...args),
  conTransaccion: (...args) => mockConTransaccion(...args),
  mapearErrorDb: (...args) => mockMapearErrorDb(...args),
}));

const mockEstaRevocado = jest.fn().mockResolvedValue(false);
jest.mock("../src/pagos/lib/tokensRevocados", () => ({
  estaRevocado: (...args) => mockEstaRevocado(...args),
}));

const app = require("../src/pagos/app");

const tokenCliente = (idCliente = 1) =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 4, rol: "cliente", idCliente }, process.env.JWT_SECRET, { expiresIn: "8h" });
const tokenAdmin = () =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 1, rol: "administrador" }, process.env.JWT_SECRET, { expiresIn: "8h" });

beforeEach(() => jest.clearAllMocks());

// idSuscripcion/estado describen el estado FINAL (tras el cobro).
// estadoInicial (por defecto igual a estado) es lo que devuelve la
// primera consulta de obtenerSuscripcionCompleta, que en la ruta
// POST /:id/cobrar ahora ocurre ANTES de procesar el cobro (DEF-04).
function mockSuscripcionCompleta(idSuscripcion, estado, { estadoInicial } = {}) {
  const estadoPrimeraLlamada = estadoInicial !== undefined ? estadoInicial : estado;
  let llamadas = 0;
  mockQuery.mockImplementation((sql) => {
    if (sql.includes('JOIN planes pl')) {
      llamadas += 1;
      const estadoActual = llamadas === 1 ? estadoPrimeraLlamada : estado;
      return Promise.resolve({
        rows: [
          {
            idSuscripcion,
            idCliente: 1,
            idPlan: 1,
            estado: estadoActual,
            planNombre: "Plan diario",
            frecuencia: "diario",
            precio: "450.00",
          },
        ],
      });
    }
    if (sql.includes('FROM suscripcion_producto')) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

describe("Microservicio de pagos", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
  });

  it("GET /planes es público", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ idPlan: 1, nombre: "Plan diario", frecuencia: "diario", precio: "450.00" }],
    });
    const res = await request(app).get("/planes");
    expect(res.statusCode).toBe(200);
    expect(res.body[0].precio).toBe(450);
  });

  describe("POST /suscripciones", () => {
    it("CP-24: crea la suscripción y responde 201 con estado 'activa'", async () => {
      mockConTransaccion.mockImplementation(async (fn) => {
        const clienteFalso = {
          query: jest.fn().mockResolvedValue({ rows: [{ idSuscripcion: 5 }] }),
        };
        return fn(clienteFalso);
      });
      mockSuscripcionCompleta(5, "activa");

      const res = await request(app)
        .post("/suscripciones")
        .set("Authorization", `Bearer ${tokenCliente(1)}`)
        .send({ idPlan: 1, surtido: [{ idProducto: 1, cantidad: 5 }] });

      expect(res.statusCode).toBe(201);
      expect(res.body.estado).toBe("activa");
    });

    it("surtido vacío responde 400", async () => {
      const res = await request(app)
        .post("/suscripciones")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .send({ idPlan: 1, surtido: [] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /suscripciones/:id/cobrar", () => {
    it("CP-25: aprobado avanza fechaCobro", async () => {
      mockSuscripcionCompleta(5, "activa");
      const res = await request(app)
        .post("/suscripciones/5/cobrar")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ simularRespuesta: "aprobado" });
      expect(res.statusCode).toBe(200);
      expect(res.body.resultado).toBe("aprobado");
    });

    it("CP-26: rechazado pausa la suscripción", async () => {
      mockSuscripcionCompleta(5, "pausada", { estadoInicial: "activa" });
      const res = await request(app)
        .post("/suscripciones/5/cobrar")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ simularRespuesta: "rechazado" });
      expect(res.statusCode).toBe(200);
      expect(res.body.resultado).toBe("rechazado");
      expect(res.body.suscripcion.estado).toBe("pausada");
    });

    it("DEF-04: cobrar una suscripción cancelada responde 409 y no llama al procedimiento de cobro", async () => {
      mockSuscripcionCompleta(4, "cancelada");
      const res = await request(app)
        .post("/suscripciones/4/cobrar")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ simularRespuesta: "aprobado" });
      expect(res.statusCode).toBe(409);
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("CALL sp_procesar_cobro_suscripcion"),
        expect.anything()
      );
    });

    it("DEF-04: cobrar una suscripción pausada responde 409", async () => {
      mockSuscripcionCompleta(6, "pausada");
      const res = await request(app)
        .post("/suscripciones/6/cobrar")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ simularRespuesta: "aprobado" });
      expect(res.statusCode).toBe(409);
    });

    it("cliente (no admin) recibe 403", async () => {
      const res = await request(app)
        .post("/suscripciones/5/cobrar")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .send({});
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /suscripciones/:id/cancelar", () => {
    it("CP-27: 72h antes del cobro permite cancelar", async () => {
      const futuro = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      mockQuery.mockImplementation((sql) => {
        if (sql.includes('"fechaCobro", "estado" FROM suscripciones')) {
          return Promise.resolve({ rows: [{ idCliente: 1, fechaCobro: futuro, estado: "activa" }] });
        }
        if (sql.includes('JOIN planes pl')) {
          return Promise.resolve({
            rows: [{ idSuscripcion: 5, estado: "cancelada", precio: "450.00" }],
          });
        }
        if (sql.includes('FROM suscripcion_producto')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/suscripciones/5/cancelar")
        .set("Authorization", `Bearer ${tokenCliente(1)}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe("cancelada");
    });

    it("CP-28: 12h antes del cobro rechaza con 409", async () => {
      const pronto = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      mockQuery.mockImplementation((sql) => {
        if (sql.includes('"fechaCobro", "estado" FROM suscripciones')) {
          return Promise.resolve({ rows: [{ idCliente: 1, fechaCobro: pronto, estado: "activa" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/suscripciones/5/cancelar")
        .set("Authorization", `Bearer ${tokenCliente(1)}`);

      expect(res.statusCode).toBe(409);
    });
  });

  describe("DEF-09: cuerpo JSON malformado", () => {
    it("POST /suscripciones con JSON malformado responde 400 JSON", async () => {
      const res = await request(app)
        .post("/suscripciones")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .set("Content-Type", "application/json")
        .send('{"idPlan":');
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ error: "JSON inválido" });
    });
  });

  describe("GET /pagos", () => {
    it("solo administrador puede listar pagos", async () => {
      const res = await request(app).get("/pagos").set("Authorization", `Bearer ${tokenCliente()}`);
      expect(res.statusCode).toBe(403);
    });

    it("administrador recibe la lista de pagos", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idPago: 1, monto: "450.00", estado: "aprobado" }] });
      const res = await request(app).get("/pagos").set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.statusCode).toBe(200);
      expect(res.body[0].monto).toBe(450);
    });
  });

  pruebasSeguridadComunes({
    nombre: "pagos",
    app,
    request,
    jwt,
    rol: "administrador",
    estaRevocado: mockEstaRevocado,
    peticionProtegida: (r, token) => r.get("/pagos").set("Authorization", `Bearer ${token}`),
  });

  describe("lib/tokensRevocados", () => {
    const { estaRevocado } = jest.requireActual("../src/pagos/lib/tokensRevocados");

    it("devuelve true cuando el jti figura en tokens_revocados", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      await expect(estaRevocado("abc")).resolves.toBe(true);
      expect(mockQuery.mock.calls[0][0]).toMatch(/tokens_revocados/);
      expect(mockQuery.mock.calls[0][1]).toEqual(["abc"]);
    });

    it("devuelve false cuando no figura", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(estaRevocado("abc")).resolves.toBe(false);
    });
  });
});

// Telemetría de Application Insights (SDK sustituido por un doble de prueba).
pruebasTelemetria({
  nombre: "pagos",
  iniciarTelemetria: require("../src/pagos/lib/telemetria").iniciarTelemetria,
});
