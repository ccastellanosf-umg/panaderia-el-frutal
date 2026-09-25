// tests/catalogo.test.js
// Pruebas unitarias del microservicio de catálogo (RF-01..03, RF-20).
// Prisma y Redis se mockean: estas pruebas corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockProducto = {
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ producto: mockProducto })),
}));

jest.mock("../src/catalogo/lib/redis", () => ({
  obtenerClienteConectado: jest.fn().mockResolvedValue(null),
}));

const app = require("../src/catalogo/app");

const tokenAdmin = () =>
  jwt.sign({ idUsuario: 1, rol: "administrador", nombre: "Admin" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });
const tokenCliente = () =>
  jwt.sign({ idUsuario: 4, rol: "cliente", idCliente: 1 }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

beforeEach(() => jest.clearAllMocks());

describe("Microservicio de catálogo", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ service: "catalogo", status: "ok" });
  });

  describe("GET /productos", () => {
    it("CP-13: solo devuelve productos con disponibilidad=true", async () => {
      mockProducto.findMany.mockResolvedValue([
        { idProducto: 1, nombre: "Pan francés", precio: 1.5, disponibilidad: true },
      ]);
      const res = await request(app).get("/productos");
      expect(res.statusCode).toBe(200);
      expect(mockProducto.findMany).toHaveBeenCalledWith({ where: { disponibilidad: true } });
      expect(res.body).toHaveLength(1);
      expect(res.body[0].precio).toBe(1.5);
    });
  });

  describe("POST /productos", () => {
    it("CP-07: cliente autenticado recibe 403", async () => {
      const res = await request(app)
        .post("/productos")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .send({ nombre: "Pan", precio: 5 });
      expect(res.statusCode).toBe(403);
    });

    it("CP-08: administrador crea producto y responde 201", async () => {
      mockProducto.create.mockResolvedValue({
        idProducto: 9,
        nombre: "Pan nuevo",
        precio: 15.5,
        disponibilidad: true,
      });
      const res = await request(app)
        .post("/productos")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ nombre: "Pan nuevo", precio: 15.5 });
      expect(res.statusCode).toBe(201);
      expect(res.body.precio).toBe(15.5);
    });

    it("CP-09: precio 15.50 es válido", async () => {
      mockProducto.create.mockResolvedValue({ idProducto: 10, nombre: "X", precio: 15.5 });
      const res = await request(app)
        .post("/productos")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ nombre: "X", precio: 15.5 });
      expect(res.statusCode).toBe(201);
    });

    it("CP-10: precio 0 es válido", async () => {
      mockProducto.create.mockResolvedValue({ idProducto: 11, nombre: "Y", precio: 0 });
      const res = await request(app)
        .post("/productos")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ nombre: "Y", precio: 0 });
      expect(res.statusCode).toBe(201);
    });

    it("CP-11: precio negativo responde 400", async () => {
      const res = await request(app)
        .post("/productos")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ nombre: "Z", precio: -0.01 });
      expect(res.statusCode).toBe(400);
      expect(mockProducto.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /productos/:id/disponibilidad", () => {
    it("CP-12: oculta el producto de la lista pública tras actualizar", async () => {
      mockProducto.update.mockResolvedValue({
        idProducto: 1,
        nombre: "Pan francés",
        precio: 1.5,
        disponibilidad: false,
      });
      const res = await request(app)
        .patch("/productos/1/disponibilidad")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ disponibilidad: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.disponibilidad).toBe(false);
    });

    it("responde 404 cuando el producto no existe", async () => {
      mockProducto.update.mockRejectedValue(new Error("not found"));
      const res = await request(app)
        .patch("/productos/999/disponibilidad")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ disponibilidad: false });
      expect(res.statusCode).toBe(404);
    });
  });
});
