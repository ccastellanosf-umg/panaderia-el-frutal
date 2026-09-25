// tests/pedidos.test.js
// Pruebas unitarias del microservicio de pedidos (RF-04..12, RF-20).
// lib/db y lib/notificaciones se mockean: corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockQuery = jest.fn();
const mockConTransaccion = jest.fn();
const mockMapearErrorDb = jest.fn((err) => {
  if (err.code === "P0001") {
    const conflicto = ["Transición no permitida", "ya está en un estado final"].some((f) =>
      (err.message || "").includes(f)
    );
    return { status: conflicto ? 409 : 400, body: { error: err.message } };
  }
  return null;
});

jest.mock("../src/pedidos/lib/db", () => ({
  query: (...args) => mockQuery(...args),
  conTransaccion: (...args) => mockConTransaccion(...args),
  mapearErrorDb: (...args) => mockMapearErrorDb(...args),
}));

jest.mock("../src/pedidos/lib/notificaciones", () => ({
  notificarPedido: jest.fn().mockResolvedValue("enviada"),
  notificarCliente: jest.fn().mockResolvedValue("enviada"),
}));

const app = require("../src/pedidos/app");
const { notificarPedido } = require("../src/pedidos/lib/notificaciones");

const tokenCliente = (idCliente = 1) =>
  jwt.sign({ idUsuario: 4, rol: "cliente", idCliente }, process.env.JWT_SECRET, { expiresIn: "8h" });
const tokenAdmin = () =>
  jwt.sign({ idUsuario: 1, rol: "administrador" }, process.env.JWT_SECRET, { expiresIn: "8h" });
const tokenVentas = () =>
  jwt.sign({ idUsuario: 2, rol: "operador", area: "ventas" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

beforeEach(() => jest.clearAllMocks());

function mockPedidoCompleto(idPedido = 10, estado = "recibido", idClienteResuelto = 1) {
  mockQuery.mockImplementation((sql) => {
    if (sql.includes("fn_cliente_de_pedido(p.\"idPedido\") AS \"idClienteResuelto\"")) {
      return Promise.resolve({
        rows: [{ idPedido, estado, tipo: "ocasional", total: "10.00", idClienteResuelto }],
      });
    }
    if (sql.includes("FROM detalle_pedido dp")) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

describe("Microservicio de pedidos", () => {
  it("GET /health responde con estado ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
  });

  describe("POST /pedidos", () => {
    it("CP-15: items vacío responde 400 'Pedido vacío'", async () => {
      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .send({ items: [] });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Pedido vacío" });
    });

    it("CP-14: crea el pedido y responde 201 con estado 'recibido'", async () => {
      mockConTransaccion.mockImplementation(async (fn) => {
        const clienteFalso = {
          query: jest.fn().mockResolvedValue({ rows: [{ p_idPedido: 10 }] }),
        };
        return fn(clienteFalso);
      });
      mockPedidoCompleto(10, "recibido", 1);

      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenCliente(1)}`)
        .send({ items: [{ idProducto: 1, cantidad: 2 }] });

      expect(res.statusCode).toBe(201);
      expect(res.body.estado).toBe("recibido");
    });

    it("producto no disponible: el trigger rechaza y responde 400", async () => {
      mockConTransaccion.mockImplementation(async () => {
        const err = new Error("El producto 8 no está disponible");
        err.code = "P0001";
        throw err;
      });

      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenCliente(1)}`)
        .send({ items: [{ idProducto: 8, cantidad: 1 }] });

      expect(res.statusCode).toBe(400);
    });

    it("cantidad no entera responde 400", async () => {
      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .send({ items: [{ idProducto: 1, cantidad: 0 }] });
      expect(res.statusCode).toBe(400);
    });

    it("operador (no cliente) recibe 403", async () => {
      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenVentas()}`)
        .send({ items: [{ idProducto: 1, cantidad: 1 }] });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /pedidos/:id/estado", () => {
    it("CP-16: recibido -> en_preparacion responde 200 y notifica (CP-19)", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.startsWith("UPDATE pedidos SET")) return Promise.resolve({ rowCount: 1 });
        if (sql.includes("idClienteResuelto")) {
          return Promise.resolve({
            rows: [{ idPedido: 10, estado: "en_preparacion", total: "10.00" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/estado")
        .set("Authorization", `Bearer ${tokenVentas()}`)
        .send({ estado: "en_preparacion" });

      expect(res.statusCode).toBe(200);
      expect(notificarPedido).toHaveBeenCalled();
    });

    it("CP-17: recibido -> entregado es rechazado por el trigger (409)", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.startsWith("UPDATE pedidos SET")) {
          const err = new Error("Transición no permitida: recibido -> entregado");
          err.code = "P0001";
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/estado")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ estado: "entregado" });

      expect(res.statusCode).toBe(409);
    });

    it("CP-18: entregado -> en_preparacion es rechazado (409)", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.startsWith("UPDATE pedidos SET")) {
          const err = new Error("El pedido 10 ya está en un estado final");
          err.code = "P0001";
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/estado")
        .set("Authorization", `Bearer ${tokenAdmin()}`)
        .send({ estado: "en_preparacion" });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("PATCH /pedidos/:id/cancelar", () => {
    it("CP-20: recibido -> cancelado responde 200", async () => {
      let llamada = 0;
      mockQuery.mockImplementation((sql) => {
        llamada += 1;
        if (sql.includes('SELECT fn_cliente_de_pedido')) {
          return Promise.resolve({ rows: [{ idCliente: 1 }] });
        }
        if (sql.startsWith("UPDATE pedidos SET")) return Promise.resolve({ rowCount: 1 });
        if (sql.includes("idClienteResuelto")) {
          return Promise.resolve({ rows: [{ idPedido: 10, estado: "cancelado", total: "0" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/cancelar")
        .set("Authorization", `Bearer ${tokenCliente(1)}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe("cancelado");
    });

    it("CP-21: en_preparacion -> cancelado es rechazado (409)", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.includes('SELECT fn_cliente_de_pedido')) {
          return Promise.resolve({ rows: [{ idCliente: 1 }] });
        }
        if (sql.startsWith("UPDATE pedidos SET")) {
          const err = new Error("Transición no permitida: en_preparacion -> cancelado");
          err.code = "P0001";
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/cancelar")
        .set("Authorization", `Bearer ${tokenCliente(1)}`);

      expect(res.statusCode).toBe(409);
    });

    it("un cliente que no es dueño recibe 403", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.includes('SELECT fn_cliente_de_pedido')) {
          return Promise.resolve({ rows: [{ idCliente: 99 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/pedidos/10/cancelar")
        .set("Authorization", `Bearer ${tokenCliente(1)}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /pedidos", () => {
    it("cliente recibe 403 (solo administrador/operador ventas)", async () => {
      const res = await request(app).get("/pedidos").set("Authorization", `Bearer ${tokenCliente()}`);
      expect(res.statusCode).toBe(403);
    });

    it("administrador puede listar y filtrar por estado", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idPedido: 1, estado: "recibido", total: "5.00" }] });
      const res = await request(app)
        .get("/pedidos?estado=recibido")
        .set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.statusCode).toBe(200);
      expect(res.body[0].total).toBe(5);
    });
  });
});
