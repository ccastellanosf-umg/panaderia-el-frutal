// tests/catalogo.test.js
// Prueba unitaria básica del microservicio de catálogo.
// Ejecutar desde src/catalogo con: npm test
const request = require("supertest");
const app = require("../src/catalogo/index");

describe("Microservicio de catálogo", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ service: "catalogo", status: "ok" });
  });
});
