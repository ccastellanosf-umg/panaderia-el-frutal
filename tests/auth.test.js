// tests/auth.test.js
// Pruebas unitarias del microservicio de autenticación (RF-20, RF-21).
// Prisma y Redis se mockean: estas pruebas corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const mockUsuario = {
  findUnique: jest.fn(),
  create: jest.fn(),
};
const mockCliente = {
  findUnique: jest.fn(),
  create: jest.fn(),
};
const mockPersonal = {
  findUnique: jest.fn(),
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    usuario: mockUsuario,
    cliente: mockCliente,
    personal: mockPersonal,
  })),
}));

jest.mock("../src/auth/lib/redis", () => ({
  obtenerClienteConectado: jest.fn().mockResolvedValue(null),
}));

const app = require("../src/auth/app");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Microservicio de autenticación", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ service: "auth", status: "ok" });
  });

  describe("POST /auth/registro", () => {
    it("CP-01: registra un cliente nuevo y responde 201", async () => {
      mockUsuario.findUnique.mockResolvedValue(null);
      mockUsuario.create.mockResolvedValue({ idUsuario: 1, correo: "nuevo@correo.com" });
      mockCliente.create.mockResolvedValue({ idCliente: 1 });

      const res = await request(app).post("/auth/registro").send({
        nombre: "Cliente Nuevo",
        correo: "nuevo@correo.com",
        contrasena: "Pass1234",
      });

      expect(res.statusCode).toBe(201);
      expect(mockUsuario.create).toHaveBeenCalled();
      expect(mockCliente.create).toHaveBeenCalled();
    });

    it("CP-02: correo duplicado responde 400 con 'Correo en uso'", async () => {
      mockUsuario.findUnique.mockResolvedValue({ idUsuario: 1, correo: "dup@correo.com" });

      const res = await request(app).post("/auth/registro").send({
        nombre: "Otro",
        correo: "dup@correo.com",
        contrasena: "Pass1234",
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Correo en uso" });
    });

    it("CP-03: contraseña de 7 caracteres responde 400", async () => {
      mockUsuario.findUnique.mockResolvedValue(null);
      const res = await request(app).post("/auth/registro").send({
        nombre: "Cliente",
        correo: "corto@correo.com",
        contrasena: "Pass12!",
      });
      expect(res.statusCode).toBe(400);
    });

    it("CP-04: contraseña de exactamente 8 caracteres es aceptada", async () => {
      mockUsuario.findUnique.mockResolvedValue(null);
      mockUsuario.create.mockResolvedValue({ idUsuario: 2, correo: "ocho@correo.com" });
      mockCliente.create.mockResolvedValue({ idCliente: 2 });

      const res = await request(app).post("/auth/registro").send({
        nombre: "Cliente Ocho",
        correo: "ocho@correo.com",
        contrasena: "Pass1234",
      });
      expect(res.statusCode).toBe(201);
    });

    it("DEF-09: correo sin arroba responde 400", async () => {
      const res = await request(app).post("/auth/registro").send({
        nombre: "Cliente",
        correo: "usuario.sin.arroba",
        contrasena: "Pass1234",
      });
      expect(res.statusCode).toBe(400);
      expect(mockUsuario.findUnique).not.toHaveBeenCalled();
    });

    it("nombre es obligatorio", async () => {
      const res = await request(app).post("/auth/registro").send({
        correo: "sinnombre@correo.com",
        contrasena: "Pass1234",
      });
      expect(res.statusCode).toBe(400);
    });

    it("DEF-06: correo que difiere solo en mayúsculas de uno existente responde 400 'Correo en uso'", async () => {
      // El correo ya existe en BD guardado en minúsculas; el usuario
      // intenta registrarse con una variación de mayúsculas.
      mockUsuario.findUnique.mockResolvedValue({ idUsuario: 1, correo: "qa.tester2@elfrutal-test.com" });

      const res = await request(app).post("/auth/registro").send({
        nombre: "Dup Case",
        correo: "QA.Tester2@Elfrutal-Test.com",
        contrasena: "Qatest1234",
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Correo en uso" });
      // Debe haber normalizado (trim + minúsculas) antes de buscar.
      expect(mockUsuario.findUnique).toHaveBeenCalledWith({
        where: { correo: "qa.tester2@elfrutal-test.com" },
      });
    });
  });

  describe("POST /auth/login", () => {
    it("CP-05: credenciales válidas responden 200 con token de 8h", async () => {
      const hash = await bcrypt.hash("Pass1234", 10);
      mockUsuario.findUnique.mockResolvedValue({
        idUsuario: 4,
        nombre: "Cliente Demo",
        correo: "cliente@elfrutal.com",
        rol: "cliente",
        contrasenaHash: hash,
      });
      mockCliente.findUnique.mockResolvedValue({ idCliente: 1 });
      mockPersonal.findUnique.mockResolvedValue(null);

      const res = await request(app).post("/auth/login").send({
        correo: "cliente@elfrutal.com",
        contrasena: "Pass1234",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.usuario.idCliente).toBe(1);
      const decoded = jwt.decode(res.body.token);
      expect(decoded.rol).toBe("cliente");
      expect(decoded.exp - decoded.iat).toBe(8 * 60 * 60);
    });

    it("CP-06: contraseña incorrecta responde 401", async () => {
      const hash = await bcrypt.hash("Pass1234", 10);
      mockUsuario.findUnique.mockResolvedValue({
        idUsuario: 4,
        correo: "cliente@elfrutal.com",
        rol: "cliente",
        contrasenaHash: hash,
      });

      const res = await request(app).post("/auth/login").send({
        correo: "cliente@elfrutal.com",
        contrasena: "Incorrecta1",
      });
      expect(res.statusCode).toBe(401);
    });

    it("CP-06: correo desconocido responde 401", async () => {
      mockUsuario.findUnique.mockResolvedValue(null);
      const res = await request(app).post("/auth/login").send({
        correo: "no-existe@correo.com",
        contrasena: "Pass1234",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("responde 401 sin token", async () => {
      const res = await request(app).get("/auth/me");
      expect(res.statusCode).toBe(401);
    });

    it("responde 200 con token válido", async () => {
      const token = jwt.sign({ idUsuario: 1, rol: "cliente" }, process.env.JWT_SECRET, {
        expiresIn: "8h",
      });
      const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.usuario.idUsuario).toBe(1);
    });
  });

  describe("DEF-09: cuerpo JSON malformado", () => {
    it("POST /auth/registro con JSON malformado responde 400 JSON", async () => {
      const res = await request(app)
        .post("/auth/registro")
        .set("Content-Type", "application/json")
        .send('{"nombre":');
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ error: "JSON inválido" });
    });
  });

  describe("POST /auth/logout", () => {
    it("invalida el token sin fallar aunque Redis no esté disponible", async () => {
      const token = jwt.sign(
        { idUsuario: 1, rol: "cliente", jti: "abc-123" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );
      const res = await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });
  });
});

// DEMO ONLY (branch demo/jenkins-fallo, never merged): intentionally broken
// test that shows how the Jenkins pipeline stops at a failing unit test.
describe("DEMO - intentionally failing unit test", () => {
  it("GET /health responds 500 (wrong on purpose: the real answer is 200)", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(500);
  });
});
