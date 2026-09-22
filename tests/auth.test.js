// tests/auth.test.js
// Prueba unitaria básica del microservicio de autenticación.
// Ejecutar desde src/auth con: npm test
const request = require("supertest");
const app = require("../src/auth/index");

describe("Microservicio de autenticación", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ service: "auth", status: "ok" });
  });
});
