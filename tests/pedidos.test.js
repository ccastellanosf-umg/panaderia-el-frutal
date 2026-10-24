// tests/pedidos.test.js
// Pruebas unitarias del microservicio de pedidos (RF-04..12, RF-20).
// lib/db y lib/notificaciones se mockean: corren SIN base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pruebasSeguridadComunes } = require("./helpers/seguridad");
const mockQuery = jest.fn();
const mockPoolQuery = jest.fn();
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

const mockClienteTx = { query: jest.fn(), release: jest.fn() };
// Doble del paquete pg: permite ejecutar el lib/db real (transacciones y
// traducción de errores) sin servidor PostgreSQL ni red. La justificación
// completa está en describe("lib/db (módulo real)").
jest.mock("../src/pedidos/node_modules/pg", () => ({
  Pool: jest.fn(() => ({
    query: (...a) => mockPoolQuery(...a),
    connect: () => Promise.resolve(mockClienteTx),
  })),
}));

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


// ---------------------------------------------------------------------------
// Pruebas adicionales de cobertura de comportamiento (módulo crítico: pedidos).
// Se agrupan por archivo de rutas y por módulo de lib/.
// ---------------------------------------------------------------------------
const tokenOperador = (area) =>
  jwt.sign({ jti: "t-" + Math.random(), idUsuario: 3, rol: "operador", area }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe("routes/pedidos.routes (casos adicionales)", () => {
  // Se reemplaza lib/db por un doble (mockQuery / mockConTransaccion) para aislar la
  // lógica de la ruta de PostgreSQL: la prueba verifica la validación, el control de
  // acceso y los parámetros de la consulta, no la base de datos. Se reemplaza también
  // lib/notificaciones porque enviaría WhatsApp reales; solo interesa que la ruta la invoque.
  beforeEach(() => {
    mockQuery.mockReset();
    mockConTransaccion.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  describe("POST /pedidos", () => {
    it("un token de cliente sin idCliente responde 400 y no abre transacción", async () => {
      const token = jwt.sign({ jti: "t-x", idUsuario: 4, rol: "cliente" }, process.env.JWT_SECRET);
      const res = await request(app).post("/pedidos").set(auth(token)).send({ items: [{ idProducto: 1, cantidad: 1 }] });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/cliente asociado/);
      expect(mockConTransaccion).not.toHaveBeenCalled();
    });

    it("guarda dirección y fecha de entrega con el id del pedido creado", async () => {
      const clienteFalso = { query: jest.fn().mockResolvedValue({ rows: [{ p_idPedido: 55 }] }) };
      mockConTransaccion.mockImplementation((fn) => fn(clienteFalso));
      mockPedidoCompleto(55, "recibido", 1);

      const res = await request(app)
        .post("/pedidos")
        .set(auth(tokenCliente(1)))
        .send({ items: [{ idProducto: 3, cantidad: 2 }], direccionEntrega: "Zona 1", fechaEntrega: "2026-12-01" });

      expect(res.statusCode).toBe(201);
      const llamadas = clienteFalso.query.mock.calls;
      expect(llamadas[0][1]).toEqual([1]); // sp_registrar_pedido recibe el idCliente del token
      expect(llamadas[1][1]).toEqual([55, 3, 2]); // detalle: pedido, producto, cantidad
      expect(llamadas[2][0]).toMatch(/UPDATE pedidos SET/);
      expect(llamadas[2][1]).toEqual(["Zona 1", "2026-12-01", 55]);
    });

    it("sin dirección ni fecha no ejecuta el UPDATE de entrega", async () => {
      const clienteFalso = { query: jest.fn().mockResolvedValue({ rows: [{ p_idPedido: 56 }] }) };
      mockConTransaccion.mockImplementation((fn) => fn(clienteFalso));
      mockPedidoCompleto(56);
      await request(app).post("/pedidos").set(auth(tokenCliente(1))).send({ items: [{ idProducto: 1, cantidad: 1 }] });
      expect(clienteFalso.query.mock.calls.some(([sql]) => /UPDATE pedidos/.test(sql))).toBe(false);
    });

    it("un error inesperado de la base (sin mapeo) responde 400 genérico", async () => {
      mockConTransaccion.mockRejectedValue(new Error("conexión perdida"));
      const res = await request(app)
        .post("/pedidos")
        .set(auth(tokenCliente(1)))
        .send({ items: [{ idProducto: 1, cantidad: 1 }] });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "No fue posible registrar el pedido." });
    });
  });

  describe("GET /pedidos/:id", () => {
    it("id no numérico responde 400 sin consultar la base", async () => {
      const res = await request(app).get("/pedidos/abc").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("pedido inexistente responde 404", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app).get("/pedidos/999").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(404);
      expect(mockQuery.mock.calls[0][1]).toEqual([999]);
    });

    it("el cliente dueño obtiene su pedido con los ítems numéricos", async () => {
      mockQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes("FROM detalle_pedido dp")
            ? { rows: [{ idDetalle: 1, idProducto: 2, nombre: "Pan", cantidad: 3, subtotal: "4.50" }] }
            : { rows: [{ idPedido: 10, estado: "recibido", total: "4.50", idClienteResuelto: 1 }] }
        )
      );
      const res = await request(app).get("/pedidos/10").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(4.5);
      expect(res.body.items[0].subtotal).toBe(4.5);
    });

    it("un cliente que no es dueño recibe 403", async () => {
      mockPedidoCompleto(10, "recibido", 99);
      const res = await request(app).get("/pedidos/10").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(403);
    });

    it("el operador de ventas puede ver pedidos ajenos; el de producción no", async () => {
      mockPedidoCompleto(10, "recibido", 99);
      const ventas = await request(app).get("/pedidos/10").set(auth(tokenVentas()));
      const produccion = await request(app).get("/pedidos/10").set(auth(tokenOperador("produccion")));
      expect(ventas.statusCode).toBe(200);
      expect(produccion.statusCode).toBe(403);
    });

    it("un fallo de la base responde 400 genérico", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).get("/pedidos/10").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "No fue posible obtener el pedido." });
    });
  });

  describe("PATCH /pedidos/:id/estado (validaciones)", () => {
    it("sin estado responde 400 y no consulta la base", async () => {
      const res = await request(app).patch("/pedidos/10/estado").set(auth(tokenAdmin())).send({});
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("pedido inexistente (rowCount 0) responde 404 y no notifica", async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const res = await request(app).patch("/pedidos/77/estado").set(auth(tokenAdmin())).send({ estado: "listo" });
      expect(res.statusCode).toBe(404);
      expect(mockQuery.mock.calls[0][1]).toEqual(["listo", 77]);
      expect(notificarPedido).not.toHaveBeenCalled();
    });

    it("un error inesperado responde 400 genérico", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).patch("/pedidos/10/estado").set(auth(tokenAdmin())).send({ estado: "listo" });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("No fue posible cambiar el estado del pedido.");
    });

    it("el operador de producción no puede cambiar estados (403)", async () => {
      const res = await request(app)
        .patch("/pedidos/10/estado")
        .set(auth(tokenOperador("produccion")))
        .send({ estado: "listo" });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /pedidos/:id/cancelar (validaciones)", () => {
    it("id no numérico responde 400", async () => {
      const res = await request(app).patch("/pedidos/xyz/cancelar").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("pedido inexistente responde 404 y no intenta cancelar", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app).patch("/pedidos/10/cancelar").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(404);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("un error inesperado responde 400 genérico", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).patch("/pedidos/10/cancelar").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("No fue posible cancelar el pedido.");
    });

    it("al cancelar notifica y usa el id del pedido en la consulta", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.includes("SELECT fn_cliente_de_pedido")) return Promise.resolve({ rows: [{ idCliente: 1 }] });
        return Promise.resolve({ rows: [{ idPedido: 10, estado: "cancelado", total: "0" }], rowCount: 1 });
      });
      await request(app).patch("/pedidos/10/cancelar").set(auth(tokenCliente(1)));
      expect(mockQuery.mock.calls[0][1]).toEqual([10]);
      expect(notificarPedido).toHaveBeenCalledWith(10, expect.stringContaining("cancelado"));
    });
  });

  describe("GET /pedidos (filtro y acceso)", () => {
    it("filtra por estado con parámetro enlazado, no concatenado", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await request(app).get("/pedidos?estado=listo").set(auth(tokenAdmin()));
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params).toEqual(["listo"]);
      expect(sql).toContain('WHERE p."estado" = $1');
    });

    it("sin filtro no agrega WHERE", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await request(app).get("/pedidos").set(auth(tokenVentas()));
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([]);
      expect(sql).not.toContain("WHERE");
    });

    it("un operador de producción recibe 403 por área", async () => {
      const res = await request(app).get("/pedidos").set(auth(tokenOperador("produccion")));
      expect(res.statusCode).toBe(403);
    });
  });

  describe("middleware verificarToken y manejo global de errores", () => {
    it("sin cabecera Authorization responde 401", async () => {
      const res = await request(app).get("/pedidos/mios");
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Token no proporcionado." });
    });

    it("si la base falla en una ruta async, la red de seguridad responde 500 JSON", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).get("/pedidos/mios").set(auth(tokenCliente(1)));
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Error interno del servidor." });
    });
  });
});

describe("routes/inventario.routes", () => {
  // Se reemplaza lib/db por un doble para aislar las rutas de inventario de PostgreSQL:
  // se comprueba el control de acceso por área, la validación de entradas y que los
  // valores del usuario viajen como parámetros enlazados ($n) y no dentro del SQL.
  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  const prod = () => auth(tokenOperador("produccion"));

  describe("control de acceso", () => {
    it.each([
      ["cliente", () => auth(tokenCliente())],
      ["operador de ventas", () => auth(tokenVentas())],
    ])("%s recibe 403 en GET /inventario/insumos", async (_n, cab) => {
      const res = await request(app).get("/inventario/insumos").set(cab());
      expect(res.statusCode).toBe(403);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("administrador y operador de producción pueden listar insumos con cantidades numéricas", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ idInsumo: 1, nombre: "Harina", cantidadDisponible: "12.50", nivelMinimo: "5.00" }],
      });
      for (const cab of [auth(tokenAdmin()), prod()]) {
        const res = await request(app).get("/inventario/insumos").set(cab);
        expect(res.statusCode).toBe(200);
        expect(res.body[0]).toMatchObject({ cantidadDisponible: 12.5, nivelMinimo: 5 });
      }
    });
  });

  describe("POST /inventario/insumos", () => {
    it("sin nombre o unidad responde 400", async () => {
      const res = await request(app).post("/inventario/insumos").set(prod()).send({ nombre: "Sal" });
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("cantidades negativas o no numéricas responden 400", async () => {
      const neg = await request(app)
        .post("/inventario/insumos").set(prod()).send({ nombre: "Sal", unidadMedida: "kg", cantidadDisponible: -1 });
      const nan = await request(app)
        .post("/inventario/insumos").set(prod()).send({ nombre: "Sal", unidadMedida: "kg", nivelMinimo: "abc" });
      expect(neg.statusCode).toBe(400);
      expect(nan.statusCode).toBe(400);
    });

    it("crea el insumo (201) con 0 por defecto y parámetros en orden", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idInsumo: 9, nombre: "Sal", cantidadDisponible: "0", nivelMinimo: "0", unidadMedida: "kg" }] });
      const res = await request(app).post("/inventario/insumos").set(prod()).send({ nombre: "Sal", unidadMedida: "kg" });
      expect(res.statusCode).toBe(201);
      expect(mockQuery.mock.calls[0][1]).toEqual(["Sal", 0, 0, "kg"]);
      expect(res.body.cantidadDisponible).toBe(0);
    });

    it("una regla de negocio de la base (P0001) se traduce con su mensaje", async () => {
      const err = Object.assign(new Error("Insumo duplicado"), { code: "P0001" });
      mockQuery.mockRejectedValue(err);
      const res = await request(app).post("/inventario/insumos").set(prod()).send({ nombre: "Sal", unidadMedida: "kg" });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Insumo duplicado" });
    });

    it("un error desconocido responde 400 genérico", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).post("/inventario/insumos").set(prod()).send({ nombre: "Sal", unidadMedida: "kg" });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "No fue posible crear el insumo." });
    });
  });

  describe("PATCH /inventario/insumos/:id", () => {
    it("sin campos responde 400 'Nada que actualizar'", async () => {
      const res = await request(app).patch("/inventario/insumos/1").set(prod()).send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("Nada que actualizar.");
    });

    it.each([
      [{ cantidadDisponible: -5 }, /cantidadDisponible/],
      [{ nivelMinimo: "x" }, /nivelMinimo/],
    ])("valor inválido %j responde 400", async (cuerpo, patron) => {
      const res = await request(app).patch("/inventario/insumos/1").set(prod()).send(cuerpo);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(patron);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("actualiza ambos campos y pasa el id como último parámetro", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idInsumo: 4, cantidadDisponible: "20", nivelMinimo: "3" }] });
      const res = await request(app).patch("/inventario/insumos/4").set(prod()).send({ cantidadDisponible: 20, nivelMinimo: 3 });
      expect(res.statusCode).toBe(200);
      expect(mockQuery.mock.calls[0][1]).toEqual([20, 3, 4]);
      expect(res.body).toMatchObject({ cantidadDisponible: 20, nivelMinimo: 3 });
    });

    it("insumo inexistente responde 404", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app).patch("/inventario/insumos/404").set(prod()).send({ nivelMinimo: 1 });
      expect(res.statusCode).toBe(404);
    });

    it("errores de la base: mapeado conserva el mensaje, desconocido es 400 genérico", async () => {
      mockQuery.mockRejectedValueOnce(Object.assign(new Error("Regla violada"), { code: "P0001" }));
      const mapeado = await request(app).patch("/inventario/insumos/1").set(prod()).send({ nivelMinimo: 1 });
      mockQuery.mockRejectedValueOnce(new Error("caída"));
      const generico = await request(app).patch("/inventario/insumos/1").set(prod()).send({ nivelMinimo: 1 });
      expect(mapeado.body).toEqual({ error: "Regla violada" });
      expect(generico.body).toEqual({ error: "No fue posible actualizar el insumo." });
    });
  });

  describe("GET /inventario/alertas y recetas", () => {
    it("alertas devuelve los insumos críticos con cantidades numéricas", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idInsumo: 2, cantidadDisponible: "1.00", nivelMinimo: "4.00" }] });
      const res = await request(app).get("/inventario/alertas").set(prod());
      expect(res.statusCode).toBe(200);
      expect(mockQuery.mock.calls[0][0]).toContain("vw_inventario_critico");
      expect(res.body[0]).toMatchObject({ cantidadDisponible: 1, nivelMinimo: 4 });
    });

    it("receta de un producto filtra por idProducto y convierte la cantidad", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idInsumo: 1, nombre: "Harina", unidadMedida: "kg", cantidadRequerida: "0.250" }] });
      const res = await request(app).get("/inventario/recetas/7").set(prod());
      expect(res.statusCode).toBe(200);
      expect(mockQuery.mock.calls[0][1]).toEqual([7]);
      expect(res.body[0].cantidadRequerida).toBe(0.25);
    });
  });

  describe("PUT /inventario/recetas/:idProducto", () => {
    it("receta que no es arreglo responde 400", async () => {
      const res = await request(app).put("/inventario/recetas/7").set(prod()).send({ receta: "harina" });
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("un ítem con cantidad 0 responde 400 y no borra la receta existente", async () => {
      const res = await request(app)
        .put("/inventario/recetas/7").set(prod()).send({ receta: [{ idInsumo: 1, cantidadRequerida: 0 }] });
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("reemplaza la receta: borra la anterior y luego inserta cada ítem", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const res = await request(app)
        .put("/inventario/recetas/7")
        .set(prod())
        .send({ receta: [{ idInsumo: 1, cantidadRequerida: 0.5 }, { idInsumo: 2, cantidadRequerida: "2" }] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ mensaje: "Receta actualizada." });
      expect(mockQuery.mock.calls[0][0]).toMatch(/^DELETE FROM producto_insumo/);
      expect(mockQuery.mock.calls[0][1]).toEqual([7]);
      expect(mockQuery.mock.calls[1][1]).toEqual([7, 1, 0.5]);
      expect(mockQuery.mock.calls[2][1]).toEqual([7, 2, 2]);
    });

    it("errores de la base: mapeado y genérico", async () => {
      mockQuery.mockRejectedValueOnce(Object.assign(new Error("Insumo inválido"), { code: "P0001" }));
      const mapeado = await request(app).put("/inventario/recetas/7").set(prod()).send({ receta: [] });
      mockQuery.mockRejectedValueOnce(new Error("caída"));
      const generico = await request(app).put("/inventario/recetas/7").set(prod()).send({ receta: [] });
      expect(mapeado.body).toEqual({ error: "Insumo inválido" });
      expect(generico.body).toEqual({ error: "No fue posible actualizar la receta." });
    });
  });

  describe("GET/POST /inventario/produccion", () => {
    it.each(["desde", "hasta"])("fecha '%s' inválida responde 400 sin consultar", async (campo) => {
      const res = await request(app).get(`/inventario/produccion?${campo}=2026-02-30`).set(prod());
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain(campo);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("sin filtros no usa WHERE; con rango enlaza ambos parámetros", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await request(app).get("/inventario/produccion").set(prod());
      expect(mockQuery.mock.calls[0][0]).not.toContain("WHERE");
      expect(mockQuery.mock.calls[0][1]).toEqual([]);

      await request(app).get("/inventario/produccion?desde=2026-01-01&hasta=2026-01-31").set(prod());
      expect(mockQuery.mock.calls[1][0]).toContain('pd."fecha" >= $1 AND pd."fecha" <= $2');
      expect(mockQuery.mock.calls[1][1]).toEqual(["2026-01-01", "2026-01-31"]);
    });

    it("solo 'hasta' enlaza un único parámetro", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idProducto: 1, cantidadProducida: 10 }] });
      const res = await request(app).get("/inventario/produccion?hasta=2026-03-01").set(prod());
      expect(res.statusCode).toBe(200);
      expect(mockQuery.mock.calls[0][1]).toEqual(["2026-03-01"]);
      expect(res.body).toHaveLength(1);
    });

    it("POST con datos inválidos responde 400", async () => {
      for (const cuerpo of [{}, { idProducto: 1, cantidadProducida: -1 }, { idProducto: "1", cantidadProducida: 2 }]) {
        const res = await request(app).post("/inventario/produccion").set(prod()).send(cuerpo);
        expect(res.statusCode).toBe(400);
      }
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("POST registra la producción (201) y usa null si no se envía fecha", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idProduccion: 1, idProducto: 3, cantidadProducida: 40 }] });
      const res = await request(app).post("/inventario/produccion").set(prod()).send({ idProducto: 3, cantidadProducida: 40 });
      expect(res.statusCode).toBe(201);
      expect(mockQuery.mock.calls[0][1]).toEqual([3, null, 40]);
      expect(res.body.cantidadProducida).toBe(40);
    });

    it("POST: errores de la base, mapeado y genérico", async () => {
      mockQuery.mockRejectedValueOnce(Object.assign(new Error("Producto inactivo"), { code: "P0001" }));
      const mapeado = await request(app).post("/inventario/produccion").set(prod()).send({ idProducto: 3, cantidadProducida: 1 });
      mockQuery.mockRejectedValueOnce(new Error("caída"));
      const generico = await request(app).post("/inventario/produccion").set(prod()).send({ idProducto: 3, cantidadProducida: 1 });
      expect(mapeado.body).toEqual({ error: "Producto inactivo" });
      expect(generico.body).toEqual({ error: "No fue posible registrar la producción." });
    });
  });
});

describe("routes/reportes.routes (casos adicionales)", () => {
  // Se reemplaza lib/db por un doble para no depender de PostgreSQL: se verifica el rango
  // de fechas enlazado a la consulta, la conversión de importes y los cálculos propios de
  // la ruta (mermas, sugerencia de producción), que son lógica de aplicación y no de SQL.
  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  it.each([["operador", () => auth(tokenVentas())], ["cliente", () => auth(tokenCliente())]])(
    "%s no puede ver reportes (403)", async (_n, cab) => {
      for (const ruta of ["/reportes/ventas", "/reportes/ventas/excel", "/reportes/inventario", "/reportes/sugerencia-produccion"]) {
        const res = await request(app).get(ruta).set(cab());
        expect(res.statusCode).toBe(403);
      }
      expect(mockQuery).not.toHaveBeenCalled();
    }
  );

  describe("GET /reportes/ventas", () => {
    it("sin fechas usa el rango completo y convierte los totales a número", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idProducto: 1, nombre: "Pan", unidadesVendidas: 3, totalVendido: "7.50" }] });
      const res = await request(app).get("/reportes/ventas").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(200);
      expect(mockQuery).toHaveBeenCalledTimes(2); // por producto y por canal
      expect(mockQuery.mock.calls[0][1]).toEqual(["1900-01-01", "2999-12-31"]);
      expect(res.body.porProducto[0].totalVendido).toBe(7.5);
      expect(res.body.porCanal[0].totalVendido).toBe(7.5);
    });

    it("'hasta' con fecha inexistente responde 400", async () => {
      const res = await request(app).get("/reportes/ventas?hasta=2026-13-01").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('"hasta"');
    });

    it("desde posterior a hasta responde 400", async () => {
      const res = await request(app).get("/reportes/ventas?desde=2026-05-02&hasta=2026-05-01").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/menor o igual/);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("un fallo de la base responde 500 JSON", async () => {
      mockQuery.mockRejectedValue(new Error("caída"));
      const res = await request(app).get("/reportes/ventas").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(500);
    });
  });

  describe("GET /reportes/ventas/excel", () => {
    it("devuelve un .xlsx con una fila por producto vendido", async () => {
      mockQuery.mockResolvedValue({ rows: [{ idProducto: 1, nombre: "Pan", unidadesVendidas: 3, totalVendido: "7.50" }] });
      const res = await request(app)
        .get("/reportes/ventas/excel?desde=2026-01-01&hasta=2026-01-31")
        .set(auth(tokenAdmin()))
        .buffer(true)
        .parse((r, cb) => {
          const partes = [];
          r.on("data", (d) => partes.push(d));
          r.on("end", () => cb(null, Buffer.concat(partes)));
        });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
      expect(res.headers["content-disposition"]).toContain("reporte-ventas.xlsx");
      expect(mockQuery.mock.calls[0][1]).toEqual(["2026-01-01", "2026-01-31"]);

      const ExcelJS = require("exceljs");
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(res.body);
      const hoja = libro.getWorksheet("Ventas por producto");
      expect(hoja.getRow(1).values.slice(1)).toEqual(["Producto", "Unidades vendidas", "Total vendido (Q)"]);
      expect(hoja.getRow(2).values.slice(1)).toEqual(["Pan", 3, 7.5]);
    });

    it("fechas inválidas responden 400 y no generan archivo", async () => {
      const res = await request(app).get("/reportes/ventas/excel?desde=ayer").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("'hasta' inválida también responde 400", async () => {
      const res = await request(app).get("/reportes/ventas/excel?hasta=2026-02-30").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /reportes/inventario", () => {
    it("calcula la merma como producido menos vendido y convierte los insumos", async () => {
      mockQuery.mockImplementation((sql) => {
        if (sql.includes("FROM insumos")) {
          return Promise.resolve({ rows: [{ idInsumo: 1, cantidadDisponible: "9.5", nivelMinimo: "2" }] });
        }
        if (sql.includes("vw_inventario_critico")) return Promise.resolve({ rows: [{ idInsumo: 5 }] });
        if (sql.includes("produccion_diaria")) {
          return Promise.resolve({ rows: [{ idProducto: 1, producido: 50 }, { idProducto: 2, producido: 10 }] });
        }
        return Promise.resolve({ rows: [{ idProducto: 1, vendido: 42 }] });
      });
      const res = await request(app).get("/reportes/inventario?desde=2026-01-01&hasta=2026-01-31").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(200);
      expect(res.body.insumos[0]).toMatchObject({ cantidadDisponible: 9.5, nivelMinimo: 2 });
      expect(res.body.criticos).toEqual([{ idInsumo: 5 }]);
      expect(res.body.mermas).toEqual([
        { idProducto: 1, producido: 50, vendido: 42, merma: 8 },
        { idProducto: 2, producido: 10, vendido: 0, merma: 10 }, // sin ventas: toda la producción es merma
      ]);
    });

    it("rango inválido responde 400 sin consultar", async () => {
      const res = await request(app).get("/reportes/inventario?desde=2026-02-30").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe("GET /reportes/sugerencia-produccion", () => {
    // Se fija el reloj solo en Date para que el día de la semana sea determinista
    // (2026-03-04 es miércoles = 3); los temporizadores reales siguen activos para supertest.
    beforeEach(() =>
      jest.useFakeTimers({
        now: new Date(2026, 2, 4, 12, 0, 0),
        doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout", "hrtime", "performance", "queueMicrotask"],
      })
    );
    afterEach(() => jest.useRealTimers());

    it("sugiere el promedio por día distinto más 10% redondeado hacia arriba", async () => {
      mockQuery.mockImplementation((sql, params) => {
        if (sql.includes("FROM productos")) {
          return Promise.resolve({ rows: [{ idProducto: 1, nombre: "Pan" }, { idProducto: 2, nombre: "Concha" }] });
        }
        if (params[0] === 1) {
          return Promise.resolve({
            rows: [
              { idPedido: 1, cantidad: "10", fecha: new Date("2026-02-25T00:00:00Z") },
              { idPedido: 2, cantidad: "4", fecha: new Date("2026-02-25T00:00:00Z") }, // mismo día
              { idPedido: 3, cantidad: "6", fecha: new Date("2026-02-18T00:00:00Z") },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app).get("/reportes/sugerencia-produccion").set(auth(tokenAdmin()));
      expect(res.statusCode).toBe(200);
      // Pan: 20 unidades / 2 días = 10 -> ceil(11) = 11. Concha: sin historial -> 0.
      expect(res.body).toEqual([
        { idProducto: 1, nombre: "Pan", promedioVendido: 10, cantidadSugerida: 11 },
        { idProducto: 2, nombre: "Concha", promedioVendido: 0, cantidadSugerida: 0 },
      ]);
      expect(mockQuery.mock.calls[1][1]).toEqual([1, 3]); // producto y día de la semana
    });
  });
});

describe("lib/notificaciones (módulo real)", () => {
  // Se usa el módulo real pero con doble de lib/db (sin tabla notificaciones) y de fetch
  // (sin red): se verifica el contrato DEF-07: la notificación se registra con su estado y
  // un fallo del proveedor o del registro nunca propaga una excepción.
  const real = jest.requireActual("../src/pedidos/lib/notificaciones");
  const urlOriginal = process.env.WHATSAPP_API_URL;

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn();
    delete process.env.WHATSAPP_API_URL;
  });
  afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
    delete global.fetch;
    if (urlOriginal === undefined) delete process.env.WHATSAPP_API_URL;
    else process.env.WHATSAPP_API_URL = urlOriginal;
  });

  it("modo simulado (sin URL): no llama a la red y registra 'enviada'", async () => {
    await expect(real.notificarPedido(10, "hola")).resolves.toBe("enviada");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1]).toEqual([10, "hola", "enviada"]);
  });

  it("modo real: hace POST JSON con destino y mensaje", async () => {
    process.env.WHATSAPP_API_URL = "https://api.ejemplo.test/enviar";
    global.fetch.mockResolvedValue({ ok: true });
    await expect(real.enviarWhatsapp("hola", "pedido:3")).resolves.toBe("enviada");
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.ejemplo.test/enviar");
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body)).toEqual({ destino: "pedido:3", mensaje: "hola" });
  });

  it("respuesta no exitosa del proveedor se registra como 'fallida'", async () => {
    process.env.WHATSAPP_API_URL = "https://api.ejemplo.test/enviar";
    global.fetch.mockResolvedValue({ ok: false });
    await expect(real.notificarPedido(10, "hola")).resolves.toBe("fallida");
    expect(mockQuery.mock.calls[0][1]).toEqual([10, "hola", "fallida"]);
  });

  it("si fetch lanza (timeout/red) devuelve 'fallida' sin lanzar", async () => {
    process.env.WHATSAPP_API_URL = "https://api.ejemplo.test/enviar";
    global.fetch.mockRejectedValue(new Error("timeout"));
    await expect(real.enviarWhatsapp("hola", "cliente:1")).resolves.toBe("fallida");
  });

  it("si no se puede registrar en la base, advierte pero no bloquea (pedido)", async () => {
    mockQuery.mockRejectedValue(new Error("tabla no existe"));
    await expect(real.notificarPedido(10, "hola")).resolves.toBe("enviada");
    expect(console.warn).toHaveBeenCalled();
  });

  it("notificarCliente registra tipo 'alerta' por defecto y permite otro tipo", async () => {
    await real.notificarCliente(5, "stock bajo");
    await real.notificarCliente(5, "promo", "promocion");
    expect(mockQuery.mock.calls[0][1]).toEqual([5, "stock bajo", "alerta", "enviada"]);
    expect(mockQuery.mock.calls[1][1]).toEqual([5, "promo", "promocion", "enviada"]);
  });

  it("notificarCliente tolera un fallo del registro", async () => {
    mockQuery.mockRejectedValue(new Error("caída"));
    await expect(real.notificarCliente(5, "x")).resolves.toBe("enviada");
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("lib/db (módulo real)", () => {
  // Se reemplaza el paquete 'pg' por un doble para ejercitar el código real de lib/db
  // (transacciones y traducción de errores) sin servidor PostgreSQL ni red.
  const clienteTx = mockClienteTx;
  const db = jest.requireActual("../src/pedidos/lib/db");

  beforeEach(() => {
    clienteTx.query.mockReset().mockResolvedValue({});
    clienteTx.release.mockReset();
    mockPoolQuery.mockReset();
  });

  it("query delega en el pool con el texto y los parámetros", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ a: 1 }] });
    await expect(db.query("SELECT $1", [1])).resolves.toEqual({ rows: [{ a: 1 }] });
    expect(mockPoolQuery).toHaveBeenCalledWith("SELECT $1", [1]);
  });

  it("conTransaccion hace BEGIN, COMMIT, devuelve el resultado y libera la conexión", async () => {
    const r = await db.conTransaccion(async () => "ok");
    expect(r).toBe("ok");
    expect(clienteTx.query.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(clienteTx.release).toHaveBeenCalledTimes(1);
  });

  it("si la función lanza, hace ROLLBACK, relanza el error y libera la conexión", async () => {
    await expect(db.conTransaccion(async () => { throw new Error("falla"); })).rejects.toThrow("falla");
    expect(clienteTx.query.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(clienteTx.release).toHaveBeenCalledTimes(1);
  });

  describe("mapearErrorDb", () => {
    it.each([
      [{ code: "P0001", message: "Transición no permitida: a -> b" }, 409],
      [{ code: "P0001", message: "El pedido 1 ya está en un estado final" }, 409],
      [{ code: "P0001", message: "Producto no disponible" }, 400],
      [{ code: "P0001" }, 400],
      [{ code: "23514" }, 400],
      [{ code: "23503" }, 400],
      [{ code: "23505" }, 409],
    ])("%j -> %i", (err, status) => {
      expect(db.mapearErrorDb(err).status).toBe(status);
    });

    it("un error de negocio conserva su mensaje en el cuerpo", () => {
      expect(db.mapearErrorDb({ code: "P0001", message: "Producto no disponible" }).body).toEqual({
        error: "Producto no disponible",
      });
    });

    it("un error desconocido devuelve null para que la ruta responda 500/400 genérico", () => {
      expect(db.mapearErrorDb({ code: "XX000" })).toBeNull();
    });
  });
});

// Telemetría de Application Insights (SDK sustituido por un doble de prueba).
require("./helpers/telemetria").pruebasTelemetria("pedidos");
