// tests/helpers/seguridad.js
// Pruebas de seguridad comunes a los 4 microservicios (DEF-03,
// cabeceras, CORS, manejo de errores). Cada tests/<svc>.test.js las
// registra pasando su app y los mocks de su capa de datos.
const express = require("express");

const ORIGEN_PERMITIDO = "http://localhost:5173";
const ORIGEN_AJENO = "https://sitio-malicioso.example";

function pruebasSeguridadComunes({
  nombre, // auth | catalogo | pedidos | pagos
  app,
  request,
  jwt,
  // petición protegida que exige un token válido (devuelve un supertest)
  peticionProtegida,
  // jest.fn que sustituye a tokensRevocados.estaRevocado
  estaRevocado,
  rol = "administrador",
}) {
  const firmar = (extra = {}, opciones = { expiresIn: "8h" }) =>
    jwt.sign({ idUsuario: 1, rol, ...extra }, process.env.JWT_SECRET, opciones);

  describe(`Seguridad (${nombre})`, () => {
    describe("DEF-03: revocación de tokens", () => {
      it("un jti revocado responde 401 'Sesión cerrada'", async () => {
        estaRevocado.mockResolvedValueOnce(true);
        const res = await peticionProtegida(request(app), firmar({ jti: "revocado-1" }));
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Sesión cerrada. Inicie sesión de nuevo." });
        expect(estaRevocado).toHaveBeenCalledWith("revocado-1");
      });

      it("si la consulta de revocación falla responde 503 (falla cerrada)", async () => {
        estaRevocado.mockRejectedValueOnce(new Error("db caída"));
        const consola = jest.spyOn(console, "error").mockImplementation(() => {});
        const res = await peticionProtegida(request(app), firmar({ jti: "x" }));
        consola.mockRestore();
        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: "Servicio no disponible." });
      });

      it("un token sin jti es inválido (401)", async () => {
        const res = await peticionProtegida(request(app), firmar());
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Token inválido o expirado." });
        expect(estaRevocado).not.toHaveBeenCalled();
      });

      it("un token firmado con otro secreto responde 401", async () => {
        const falso = jwt.sign({ idUsuario: 1, rol, jti: "f" }, "otro-secreto");
        const res = await peticionProtegida(request(app), falso);
        expect(res.statusCode).toBe(401);
      });
    });

    describe("cabeceras de seguridad (helmet)", () => {
      it("envía nosniff / x-frame-options y no expone x-powered-by", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBeDefined();
        expect(res.headers["x-powered-by"]).toBeUndefined();
      });
    });

    describe("CORS con lista de orígenes permitidos", () => {
      it("un origen permitido recibe Access-Control-Allow-Origin", async () => {
        const res = await request(app).get("/health").set("Origin", ORIGEN_PERMITIDO);
        expect(res.headers["access-control-allow-origin"]).toBe(ORIGEN_PERMITIDO);
      });

      it("un origen ajeno NO recibe Access-Control-Allow-Origin", async () => {
        const res = await request(app).get("/health").set("Origin", ORIGEN_AJENO);
        expect(res.statusCode).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      });

      it("una petición sin Origin (curl, health checks) funciona", async () => {
        const res = await request(app).get("/health");
        expect(res.statusCode).toBe(200);
      });

      it("CORS_ORIGINS (lista separada por comas) reemplaza el valor por defecto", async () => {
        const anterior = process.env.CORS_ORIGINS;
        process.env.CORS_ORIGINS = "https://a.example, https://b.example";
        try {
          const { configurarSeguridad } = require(`../../src/${nombre}/lib/seguridad`);
          const mini = express();
          configurarSeguridad(mini);
          mini.get("/x", (_req, res) => res.json({ ok: true }));
          const a = await request(mini).get("/x").set("Origin", "https://b.example");
          const b = await request(mini).get("/x").set("Origin", ORIGEN_PERMITIDO);
          expect(a.headers["access-control-allow-origin"]).toBe("https://b.example");
          expect(b.headers["access-control-allow-origin"]).toBeUndefined();
        } finally {
          if (anterior === undefined) delete process.env.CORS_ORIGINS;
          else process.env.CORS_ORIGINS = anterior;
        }
      });
    });

    describe("manejador de errores final", () => {
      it("responde 500 genérico sin stack ni detalles internos", () => {
        const capa = app._router.stack[app._router.stack.length - 1];
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const consola = jest.spyOn(console, "error").mockImplementation(() => {});
        const err = new Error("password=secreto en /ruta/interna");
        capa.handle(err, {}, res, jest.fn());
        consola.mockRestore();
        expect(res.status).toHaveBeenCalledWith(500);
        const cuerpo = res.json.mock.calls[0][0];
        expect(cuerpo).toEqual({ error: "Error interno del servidor." });
        expect(JSON.stringify(cuerpo)).not.toMatch(/secreto|stack|at /);
      });
    });
  });
}

module.exports = { pruebasSeguridadComunes, ORIGEN_PERMITIDO, ORIGEN_AJENO };
