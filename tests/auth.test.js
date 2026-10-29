// tests/auth.test.js
// Pruebas unitarias del microservicio de autenticación (RF-20, RF-21).
// Prisma y Redis se mockean: estas pruebas corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pruebasSeguridadComunes } = require("./helpers/seguridad");
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
const mockTokenRevocado = {
  findUnique: jest.fn(),
  createMany: jest.fn().mockResolvedValue({ count: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    usuario: mockUsuario,
    cliente: mockCliente,
    personal: mockPersonal,
    tokenRevocado: mockTokenRevocado,
  })),
}));

const mockEstaRevocado = jest.fn().mockResolvedValue(false);
jest.mock("../src/auth/lib/tokensRevocados", () => ({
  ...jest.requireActual("../src/auth/lib/tokensRevocados"),
  estaRevocado: (...args) => mockEstaRevocado(...args),
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

    it("no inyecta saltos de línea del correo en el registro de intentos fallidos", async () => {
      const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
      mockUsuario.findUnique.mockResolvedValue(null);
      const res = await request(app).post("/auth/login").send({
        correo: "falso@correo.com\r\n[INFO] login exitoso para admin",
        contrasena: "Pass1234",
      });
      expect(res.statusCode).toBe(401);
      expect(aviso).toHaveBeenCalledTimes(1);
      const linea = aviso.mock.calls[0].join(" ");
      expect(linea).not.toMatch(/[\r\n]/);
      expect(linea).toContain("falso@correo.com");
      aviso.mockRestore();
    });

    it("no inyecta saltos de línea cuando la contraseña es incorrecta", async () => {
      const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
      const hash = await bcrypt.hash("Pass1234", 10);
      mockUsuario.findUnique.mockResolvedValue({
        idUsuario: 4,
        correo: "cliente@elfrutal.com",
        rol: "cliente",
        contrasenaHash: hash,
      });
      await request(app).post("/auth/login").send({
        correo: "cliente@elfrutal.com\nFORJADO",
        contrasena: "Incorrecta1",
      });
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(aviso.mock.calls[0].join(" ")).not.toMatch(/[\r\n]/);
      aviso.mockRestore();
    });
  });

  describe("GET /auth/me", () => {
    it("responde 401 sin token", async () => {
      const res = await request(app).get("/auth/me");
      expect(res.statusCode).toBe(401);
    });

    it("responde 200 con token válido", async () => {
      const token = jwt.sign({ idUsuario: 1, rol: "cliente", jti: "me-1" }, process.env.JWT_SECRET, {
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
    const tokenConJti = (jti = "abc-123") =>
      jwt.sign({ idUsuario: 1, rol: "cliente", jti }, process.env.JWT_SECRET, { expiresIn: "8h" });

    it("DEF-03: guarda el jti en tokens_revocados y limpia los vencidos", async () => {
      const token = tokenConJti();
      const { exp } = jwt.decode(token);
      const res = await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(mockTokenRevocado.createMany).toHaveBeenCalledWith({
        data: [{ jti: "abc-123", expira: new Date(exp * 1000) }],
        skipDuplicates: true,
      });
      expect(mockTokenRevocado.deleteMany).toHaveBeenCalledWith({
        where: { expira: { lt: expect.any(Date) } },
      });
    });

    it("si no puede guardar la revocación responde 503 (la sesión sigue abierta)", async () => {
      mockTokenRevocado.createMany.mockRejectedValueOnce(new Error("db caída"));
      const res = await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${tokenConJti()}`);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: "Servicio no disponible." });
    });

    it("un token ya revocado no puede volver a usarse en logout (401)", async () => {
      mockEstaRevocado.mockResolvedValueOnce(true);
      const res = await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${tokenConJti("ya-revocado")}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /auth/login: límite de intentos fallidos", () => {
    const hashPromesa = bcrypt.hash("Correcta1", 4);
    const intentar = (correo, contrasena, ip) => {
      const r = request(app).post("/auth/login").send({ correo, contrasena });
      return ip ? r.set("X-Forwarded-For", ip) : r;
    };
    const usuarioDe = async (correo) => ({
      idUsuario: 9,
      nombre: "Demo",
      correo,
      rol: "cliente",
      contrasenaHash: await hashPromesa,
    });

    it("el 6.º intento fallido de un correo responde 429 con RateLimit headers", async () => {
      const correo = "bloqueado@correo.com";
      mockUsuario.findUnique.mockResolvedValue(await usuarioDe(correo));
      for (let i = 0; i < 5; i++) {
        const res = await intentar(correo, "Mala-clave1");
        expect(res.statusCode).toBe(401);
      }
      const sexto = await intentar(correo, "Mala-clave1");
      expect(sexto.statusCode).toBe(429);
      expect(sexto.body).toEqual({
        error: "Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.",
      });
      expect(sexto.headers["ratelimit-limit"]).toBeDefined();
      expect(sexto.headers["ratelimit-remaining"]).toBeDefined();
      // ni siquiera con la contraseña correcta mientras dure el bloqueo
      const correcta = await intentar(correo, "Correcta1");
      expect(correcta.statusCode).toBe(429);
    });

    it("otro correo (misma IP) sigue pudiendo iniciar sesión", async () => {
      const otro = "libre@correo.com";
      mockUsuario.findUnique.mockResolvedValue(await usuarioDe(otro));
      mockCliente.findUnique.mockResolvedValue({ idCliente: 1 });
      mockPersonal.findUnique.mockResolvedValue(null);
      const res = await intentar(otro, "Correcta1");
      expect(res.statusCode).toBe(200);
    });

    it("el correo se compara sin distinguir mayúsculas", async () => {
      const correo = "mayus@correo.com";
      mockUsuario.findUnique.mockResolvedValue(await usuarioDe(correo));
      for (let i = 0; i < 5; i++) await intentar(i % 2 ? "MAYUS@correo.com" : correo, "Mala-clave1");
      const sexto = await intentar("Mayus@Correo.com", "Mala-clave1");
      expect(sexto.statusCode).toBe(429);
    });

    it("detrás del proxy de Azure (IP:puerto en X-Forwarded-For) los intentos de la misma IP se acumulan", async () => {
      const correo = "proxy@correo.com";
      mockUsuario.findUnique.mockResolvedValue(await usuarioDe(correo));
      for (let i = 0; i < 5; i++) {
        const res = await intentar(correo, "Mala-clave1", `203.0.113.7:${50000 + i}`);
        expect(res.statusCode).toBe(401);
      }
      const sexto = await intentar(correo, "Mala-clave1", "203.0.113.7:59999");
      expect(sexto.statusCode).toBe(429);
    });

    it("los inicios de sesión exitosos no cuentan", async () => {
      const correo = "exitoso@correo.com";
      mockUsuario.findUnique.mockResolvedValue(await usuarioDe(correo));
      mockCliente.findUnique.mockResolvedValue({ idCliente: 1 });
      mockPersonal.findUnique.mockResolvedValue(null);
      for (let i = 0; i < 8; i++) {
        const res = await intentar(correo, "Correcta1");
        expect(res.statusCode).toBe(200);
      }
    });
  });

  pruebasSeguridadComunes({
    nombre: "auth",
    app,
    request,
    jwt,
    rol: "cliente",
    estaRevocado: mockEstaRevocado,
    peticionProtegida: (r, token) => r.get("/auth/me").set("Authorization", `Bearer ${token}`),
  });

  describe("lib/tokensRevocados", () => {
    const { estaRevocado } = jest.requireActual("../src/auth/lib/tokensRevocados");

    it("devuelve true cuando el jti figura en tokens_revocados", async () => {
      mockTokenRevocado.findUnique.mockResolvedValueOnce({ jti: "abc" });
      await expect(estaRevocado("abc")).resolves.toBe(true);
    });

    it("devuelve false cuando no figura", async () => {
      mockTokenRevocado.findUnique.mockResolvedValueOnce(null);
      await expect(estaRevocado("abc")).resolves.toBe(false);
    });
  });
});

// Telemetría de Application Insights (SDK sustituido por un doble de prueba).
require("./helpers/telemetria").pruebasTelemetria("auth");
