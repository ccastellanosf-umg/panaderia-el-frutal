// tests/pedidos.test.js
// Pruebas unitarias del microservicio de pedidos (RF-04..12, RF-20).
// lib/db y lib/notificaciones se mockean: corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pruebasSeguridadComunes } = require("./helpers/seguridad");
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

const mockEstaRevocado = jest.fn().mockResolvedValue(false);
jest.mock("../src/pedidos/lib/tokensRevocados", () => ({
  estaRevocado: (...args) => mockEstaRevocado(...args),
}));

const app = require("../src/pedidos/app");
const { notificarPedido } = require("../src/pedidos/lib/notificaciones");

const tokenCliente = (idCliente = 1) =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 4, rol: "cliente", idCliente }, process.env.JWT_SECRET, { expiresIn: "8h" });
const tokenAdmin = () =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 1, rol: "administrador" }, process.env.JWT_SECRET, { expiresIn: "8h" });
const tokenVentas = () =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 2, rol: "operador", area: "ventas" }, process.env.JWT_SECRET, {
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

  describe("GET /pedidos/mios (historial del cliente)", () => {
    // Under load (50 VUs) the history took 1 + 2N queries per request (N+1);
    // it must use a fixed number of queries whatever the number of orders.
    function mockHistorial(pedidos, detalle) {
      mockQuery.mockImplementation((sql) => {
        if (sql.includes("FROM detalle_pedido dp")) return Promise.resolve({ rows: detalle });
        return Promise.resolve({ rows: pedidos });
      });
    }

    it("usa dos consultas en total, sin importar cuántos pedidos tenga el cliente", async () => {
      const pedidos = Array.from({ length: 30 }, (_, i) => ({
        idPedido: 30 - i, estado: "recibido", total: "10.00", idClienteResuelto: 1,
      }));
      mockHistorial(pedidos, []);
      const res = await request(app).get("/pedidos/mios").set("Authorization", `Bearer ${tokenCliente(1)}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(30);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it("no consulta el detalle cuando el cliente no tiene pedidos", async () => {
      mockHistorial([], []);
      const res = await request(app).get("/pedidos/mios").set("Authorization", `Bearer ${tokenCliente(1)}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("filtra por el cliente del token sin llamar a fn_cliente_de_pedido por fila", async () => {
      mockHistorial([], []);
      await request(app).get("/pedidos/mios").set("Authorization", `Bearer ${tokenCliente(7)}`);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toContain("fn_cliente_de_pedido");
      expect(params).toEqual([7]);
    });

    it("conserva el orden de los pedidos y agrupa sus ítems con números, igual que antes", async () => {
      mockHistorial(
        [
          { idPedido: 12, estado: "recibido", total: "9.00", idClienteResuelto: 1 },
          { idPedido: 11, estado: "entregado", total: "3.50", idClienteResuelto: 1 },
        ],
        [
          { idPedido: 11, idDetalle: 1, idProducto: 3, nombre: "Conchas", cantidad: 1, subtotal: "3.50" },
          { idPedido: 12, idDetalle: 2, idProducto: 1, nombre: "Pan francés", cantidad: 2, subtotal: "3.00" },
          { idPedido: 12, idDetalle: 3, idProducto: 5, nombre: "Quesadilla", cantidad: 1, subtotal: "6.00" },
        ]
      );
      const res = await request(app).get("/pedidos/mios").set("Authorization", `Bearer ${tokenCliente(1)}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.idPedido)).toEqual([12, 11]);
      expect(res.body[0].total).toBe(9);
      expect(res.body[0].items).toEqual([
        { idDetalle: 2, idProducto: 1, nombre: "Pan francés", cantidad: 2, subtotal: 3 },
        { idDetalle: 3, idProducto: 5, nombre: "Quesadilla", cantidad: 1, subtotal: 6 },
      ]);
      expect(res.body[1].items).toEqual([
        { idDetalle: 1, idProducto: 3, nombre: "Conchas", cantidad: 1, subtotal: 3.5 },
      ]);
    });
  });

  describe("DEF-09: cuerpo JSON malformado", () => {
    it("POST /pedidos con JSON malformado responde 400 JSON", async () => {
      const res = await request(app)
        .post("/pedidos")
        .set("Authorization", `Bearer ${tokenCliente()}`)
        .set("Content-Type", "application/json")
        .send('{"items":[');
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ error: "JSON inválido" });
    });
  });

  describe("GET /reportes/ventas", () => {
    it("DEF-02: fecha 'desde' inválida responde 400 y no consulta la base de datos", async () => {
      const res = await request(app)
        .get("/reportes/ventas?desde=no-es-fecha&hasta=2026-12-31")
        .set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("DEF-02: fecha calendario inexistente (2026-02-30) responde 400", async () => {
      const res = await request(app)
        .get("/reportes/ventas?desde=2026-02-30&hasta=2026-12-31")
        .set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.statusCode).toBe(400);
    });

    it("CP-29: rango de fechas válido responde 200", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app)
        .get("/reportes/ventas?desde=2026-01-01&hasta=2026-12-31")
        .set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.porProducto)).toBe(true);
    });
  });

  pruebasSeguridadComunes({
    nombre: "pedidos",
    app,
    request,
    jwt,
    rol: "cliente",
    estaRevocado: mockEstaRevocado,
    peticionProtegida: (r, token) => r.post("/pedidos").send({}).set("Authorization", `Bearer ${token}`),
  });

  describe("lib/tokensRevocados", () => {
    const { estaRevocado } = jest.requireActual("../src/pedidos/lib/tokensRevocados");

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
require("./helpers/telemetria").pruebasTelemetria("pedidos");
