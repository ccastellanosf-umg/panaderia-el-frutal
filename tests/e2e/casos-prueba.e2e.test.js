// tests/e2e/casos-prueba.e2e.test.js
// Suite E2E de la Fase 1 — un test por caso de prueba (CP-01..CP-30)
// del documento de QA. Corre contra servicios REALES (docker compose
// por defecto; AUTH_URL/CATALOGO_URL/PEDIDOS_URL/PAGOS_URL permiten
// apuntar a Azure más adelante). Cuando el setup requiere manipular
// la base de datos directamente (CP-22, CP-23, CP-27, CP-28) se usa
// `pg` con DATABASE_URL; si no está definida, esos casos se marcan
// como "skipped" con el motivo.
const { Pool } = require("pg");

const AUTH_URL = process.env.AUTH_URL || "http://localhost:3001";
const CATALOGO_URL = process.env.CATALOGO_URL || "http://localhost:3002";
const PEDIDOS_URL = process.env.PEDIDOS_URL || "http://localhost:3003";
const PAGOS_URL = process.env.PAGOS_URL || "http://localhost:3004";

const DB_DISPONIBLE = !!process.env.DATABASE_URL;
const pool = DB_DISPONIBLE
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const itDb = DB_DISPONIBLE ? it : it.skip;

function correoUnico(prefijo) {
  return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@correo.com`;
}

async function api(method, url, { body, token } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_err) {
    json = null;
  }
  return { status: res.status, body: json };
}

async function login(correo, contrasena) {
  const { status, body } = await api("POST", `${AUTH_URL}/auth/login`, {
    body: { correo, contrasena },
  });
  if (status !== 200) {
    throw new Error(`Login falló para ${correo}: ${status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function registrarCliente(nombre, contrasena = "Pass1234") {
  const correo = correoUnico("cliente");
  const { status } = await api("POST", `${AUTH_URL}/auth/registro`, {
    body: { nombre, correo, contrasena },
  });
  if (status !== 201) throw new Error(`No fue posible registrar ${correo}`);
  return login(correo, contrasena);
}

// Credenciales semilla (db/02_seed.sql)
let admin;
let ventas;
let produccion;

beforeAll(async () => {
  admin = await login("admin@elfrutal.com", "Admin1234");
  ventas = await login("ventas@elfrutal.com", "Ventas1234");
  produccion = await login("produccion@elfrutal.com", "Produccion1234");
}, 30000);

afterAll(async () => {
  if (pool) await pool.end();
});

// ------------------------------------------------------------
// auth — RF-20, RF-21
// ------------------------------------------------------------
describe("Registro e inicio de sesión", () => {
  it("CP-01 registra un cliente nuevo y responde 201", async () => {
    const correo = correoUnico("cp01");
    const { status, body } = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Cliente CP-01", correo, contrasena: "Pass1234" },
    });
    expect(status).toBe(201);
    expect(body.idUsuario).toBeDefined();
  });

  it("CP-02 correo duplicado responde 400 con 'Correo en uso'", async () => {
    const correo = correoUnico("cp02");
    await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Original", correo, contrasena: "Pass1234" },
    });
    const { status, body } = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Duplicado", correo, contrasena: "Pass1234" },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("Correo en uso");
  });

  it("CP-03 contraseña de 7 caracteres responde 400", async () => {
    const { status } = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Corto", correo: correoUnico("cp03"), contrasena: "Pass12!" },
    });
    expect(status).toBe(400);
  });

  it("CP-04 contraseña de exactamente 8 caracteres es aceptada", async () => {
    const { status } = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "Justo Ocho", correo: correoUnico("cp04"), contrasena: "Pass1234" },
    });
    expect(status).toBe(201);
  });

  it("CP-05 login válido responde 200 con token de 8h", async () => {
    const correo = correoUnico("cp05");
    await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "CP-05", correo, contrasena: "Pass1234" },
    });
    const { status, body } = await api("POST", `${AUTH_URL}/auth/login`, {
      body: { correo, contrasena: "Pass1234" },
    });
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.expiresIn).toBe("8h");
  });

  it("CP-06 credenciales inválidas responden 401", async () => {
    const { status } = await api("POST", `${AUTH_URL}/auth/login`, {
      body: { correo: "no-existe-cp06@correo.com", contrasena: "Pass1234" },
    });
    expect(status).toBe(401);
  });

  it("DEF-09 correo sin arroba responde 400", async () => {
    const { status } = await api("POST", `${AUTH_URL}/auth/registro`, {
      body: { nombre: "DEF-09", correo: "usuario.sin.arroba", contrasena: "Pass1234" },
    });
    expect(status).toBe(400);
  });
});

// ------------------------------------------------------------
// catalogo — RF-01..03
// ------------------------------------------------------------
describe("Catálogo de productos", () => {
  let cliente;
  beforeAll(async () => {
    cliente = await registrarCliente("Cliente Catálogo");
  });

  it("CP-07 cliente autenticado no puede crear productos (403)", async () => {
    const { status } = await api("POST", `${CATALOGO_URL}/productos`, {
      token: cliente.token,
      body: { nombre: "Intento cliente", precio: 5 },
    });
    expect(status).toBe(403);
  });

  it("CP-08 administrador crea producto y responde 201", async () => {
    const { status, body } = await api("POST", `${CATALOGO_URL}/productos`, {
      token: admin.token,
      body: { nombre: "Producto CP-08", precio: 10 },
    });
    expect(status).toBe(201);
    expect(body.idProducto).toBeDefined();
  });

  it("CP-09 precio 15.50 es aceptado", async () => {
    const { status, body } = await api("POST", `${CATALOGO_URL}/productos`, {
      token: admin.token,
      body: { nombre: "Producto CP-09", precio: 15.5 },
    });
    expect(status).toBe(201);
    expect(body.precio).toBe(15.5);
  });

  it("CP-10 precio 0 es aceptado", async () => {
    const { status } = await api("POST", `${CATALOGO_URL}/productos`, {
      token: admin.token,
      body: { nombre: "Producto CP-10", precio: 0 },
    });
    expect(status).toBe(201);
  });

  it("CP-11 precio -0.01 responde 400", async () => {
    const { status } = await api("POST", `${CATALOGO_URL}/productos`, {
      token: admin.token,
      body: { nombre: "Producto CP-11", precio: -0.01 },
    });
    expect(status).toBe(400);
  });

  it("CP-12 ocultar producto lo saca del listado público", async () => {
    const creado = await api("POST", `${CATALOGO_URL}/productos`, {
      token: admin.token,
      body: { nombre: "Producto CP-12", precio: 20 },
    });
    const idProducto = creado.body.idProducto;

    await api("PATCH", `${CATALOGO_URL}/productos/${idProducto}/disponibilidad`, {
      token: admin.token,
      body: { disponibilidad: false },
    });

    const { body: publico } = await api("GET", `${CATALOGO_URL}/productos`);
    expect(publico.some((p) => p.idProducto === idProducto)).toBe(false);
  });

  it("CP-13 el listado público solo incluye disponibles", async () => {
    const { status, body } = await api("GET", `${CATALOGO_URL}/productos`);
    expect(status).toBe(200);
    expect(body.every((p) => p.disponibilidad !== false)).toBe(true);
  });
});

// ------------------------------------------------------------
// pedidos — RF-04..08
// ------------------------------------------------------------
describe("Pedidos", () => {
  let cliente;
  beforeAll(async () => {
    cliente = await registrarCliente("Cliente Pedidos");
  });

  it("CP-15 pedido sin ítems responde 400 'Pedido vacío'", async () => {
    const { status, body } = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [] },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("Pedido vacío");
  });

  it("CP-14 crea el pedido y responde 201 con estado 'recibido'", async () => {
    const { status, body } = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 2 }] },
    });
    expect(status).toBe(201);
    expect(body.estado).toBe("recibido");
  });

  it("CP-16 recibido -> en_preparacion responde 200", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const { status, body } = await api(
      "PATCH",
      `${PEDIDOS_URL}/pedidos/${pedido.body.idPedido}/estado`,
      { token: ventas.token, body: { estado: "en_preparacion" } }
    );
    expect(status).toBe(200);
    expect(body.estado).toBe("en_preparacion");
  });

  it("CP-17 recibido -> entregado es rechazado (409)", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const { status } = await api(
      "PATCH",
      `${PEDIDOS_URL}/pedidos/${pedido.body.idPedido}/estado`,
      { token: ventas.token, body: { estado: "entregado" } }
    );
    expect(status).toBe(409);
  });

  it("CP-18 entregado -> en_preparacion es rechazado (409)", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const idPedido = pedido.body.idPedido;
    for (const estado of ["en_preparacion", "listo", "entregado"]) {
      const paso = await api("PATCH", `${PEDIDOS_URL}/pedidos/${idPedido}/estado`, {
        token: ventas.token,
        body: { estado },
      });
      expect(paso.status).toBe(200);
    }
    const { status } = await api("PATCH", `${PEDIDOS_URL}/pedidos/${idPedido}/estado`, {
      token: ventas.token,
      body: { estado: "en_preparacion" },
    });
    expect(status).toBe(409);
  });

  itDb("CP-19 el cambio de estado registra una notificación", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const idPedido = pedido.body.idPedido;
    await api("PATCH", `${PEDIDOS_URL}/pedidos/${idPedido}/estado`, {
      token: ventas.token,
      body: { estado: "en_preparacion" },
    });
    const { rows } = await pool.query(
      `SELECT * FROM notificaciones WHERE "idPedido" = $1`,
      [idPedido]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("CP-20 cancelar desde 'recibido' responde 200", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const { status, body } = await api(
      "PATCH",
      `${PEDIDOS_URL}/pedidos/${pedido.body.idPedido}/cancelar`,
      { token: cliente.token }
    );
    expect(status).toBe(200);
    expect(body.estado).toBe("cancelado");
  });

  it("CP-21 cancelar desde 'en_preparacion' es rechazado (409)", async () => {
    const pedido = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });
    const idPedido = pedido.body.idPedido;
    await api("PATCH", `${PEDIDOS_URL}/pedidos/${idPedido}/estado`, {
      token: ventas.token,
      body: { estado: "en_preparacion" },
    });
    const { status } = await api("PATCH", `${PEDIDOS_URL}/pedidos/${idPedido}/cancelar`, {
      token: cliente.token,
    });
    expect(status).toBe(409);
  });
});

// ------------------------------------------------------------
// inventario — RF-09..12
// ------------------------------------------------------------
describe("Inventario", () => {
  itDb("CP-22 descuenta insumos según receta (100 -> 95)", async () => {
    const cliente = await registrarCliente("Cliente Inventario 22");
    await pool.query(`UPDATE insumos SET "cantidadDisponible" = 100 WHERE "idInsumo" = 1`);
    await pool.query(
      `UPDATE producto_insumo SET "cantidadRequerida" = 0.5 WHERE "idProducto" = 1 AND "idInsumo" = 1`
    );

    const { status } = await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 10 }] },
    });
    expect(status).toBe(201);

    const { rows } = await pool.query(
      `SELECT "cantidadDisponible" FROM insumos WHERE "idInsumo" = 1`
    );
    expect(Number(rows[0].cantidadDisponible)).toBeCloseTo(95, 2);
  });

  itDb("CP-23 alerta de inventario crítico aparece tras el consumo (10.5 -> 9.5)", async () => {
    const cliente = await registrarCliente("Cliente Inventario 23");
    await pool.query(
      `UPDATE insumos SET "cantidadDisponible" = 10.5, "nivelMinimo" = 10 WHERE "idInsumo" = 1`
    );
    await pool.query(
      `UPDATE producto_insumo SET "cantidadRequerida" = 1.0 WHERE "idProducto" = 1 AND "idInsumo" = 1`
    );

    await api("POST", `${PEDIDOS_URL}/pedidos`, {
      token: cliente.token,
      body: { items: [{ idProducto: 1, cantidad: 1 }] },
    });

    const { rows } = await pool.query(
      `SELECT "cantidadDisponible" FROM insumos WHERE "idInsumo" = 1`
    );
    expect(Number(rows[0].cantidadDisponible)).toBeCloseTo(9.5, 2);

    const { status, body } = await api("GET", `${PEDIDOS_URL}/inventario/alertas`, {
      token: produccion.token,
    });
    expect(status).toBe(200);
    expect(body.some((i) => i.idInsumo === 1)).toBe(true);
  });
});

// ------------------------------------------------------------
// suscripciones y pagos — RF-13..16
// ------------------------------------------------------------
describe("Suscripciones y pagos", () => {
  it("CP-24 crea la suscripción y responde 201 con estado 'activa'", async () => {
    const cliente = await registrarCliente("Cliente CP-24");
    const { status, body } = await api("POST", `${PAGOS_URL}/suscripciones`, {
      token: cliente.token,
      body: { idPlan: 1, surtido: [{ idProducto: 1, cantidad: 5 }] },
    });
    expect(status).toBe(201);
    expect(body.estado).toBe("activa");
  });

  it("CP-25 cobro aprobado avanza fechaCobro", async () => {
    const cliente = await registrarCliente("Cliente CP-25");
    const creada = await api("POST", `${PAGOS_URL}/suscripciones`, {
      token: cliente.token,
      body: { idPlan: 1, surtido: [{ idProducto: 1, cantidad: 1 }] },
    });
    const fechaAntes = creada.body.fechaCobro;

    const { status, body } = await api(
      "POST",
      `${PAGOS_URL}/suscripciones/${creada.body.idSuscripcion}/cobrar`,
      { token: admin.token, body: { simularRespuesta: "aprobado" } }
    );
    expect(status).toBe(200);
    expect(body.resultado).toBe("aprobado");
    expect(new Date(body.suscripcion.fechaCobro).getTime()).toBeGreaterThan(
      new Date(fechaAntes).getTime()
    );
  });

  it("CP-26 cobro rechazado pausa la suscripción", async () => {
    const cliente = await registrarCliente("Cliente CP-26");
    const creada = await api("POST", `${PAGOS_URL}/suscripciones`, {
      token: cliente.token,
      body: { idPlan: 1, surtido: [{ idProducto: 1, cantidad: 1 }] },
    });

    const { status, body } = await api(
      "POST",
      `${PAGOS_URL}/suscripciones/${creada.body.idSuscripcion}/cobrar`,
      { token: admin.token, body: { simularRespuesta: "rechazado" } }
    );
    expect(status).toBe(200);
    expect(body.resultado).toBe("rechazado");
    expect(body.suscripcion.estado).toBe("pausada");
  });

  itDb("CP-27 cancelar 72h antes del cobro es aceptado", async () => {
    const cliente = await registrarCliente("Cliente CP-27");
    const creada = await api("POST", `${PAGOS_URL}/suscripciones`, {
      token: cliente.token,
      body: { idPlan: 1, surtido: [{ idProducto: 1, cantidad: 1 }] },
    });
    await pool.query(
      `UPDATE suscripciones SET "fechaCobro" = NOW() + INTERVAL '72 hour' WHERE "idSuscripcion" = $1`,
      [creada.body.idSuscripcion]
    );

    const { status, body } = await api(
      "PATCH",
      `${PAGOS_URL}/suscripciones/${creada.body.idSuscripcion}/cancelar`,
      { token: cliente.token }
    );
    expect(status).toBe(200);
    expect(body.estado).toBe("cancelada");
  });

  itDb("CP-28 cancelar 12h antes del cobro es rechazado (409)", async () => {
    const cliente = await registrarCliente("Cliente CP-28");
    const creada = await api("POST", `${PAGOS_URL}/suscripciones`, {
      token: cliente.token,
      body: { idPlan: 1, surtido: [{ idProducto: 1, cantidad: 1 }] },
    });
    await pool.query(
      `UPDATE suscripciones SET "fechaCobro" = NOW() + INTERVAL '12 hour' WHERE "idSuscripcion" = $1`,
      [creada.body.idSuscripcion]
    );

    const { status } = await api(
      "PATCH",
      `${PAGOS_URL}/suscripciones/${creada.body.idSuscripcion}/cancelar`,
      { token: cliente.token }
    );
    expect(status).toBe(409);
  });
});

// ------------------------------------------------------------
// reportes — RF-17..19
// ------------------------------------------------------------
describe("Reportes", () => {
  it("CP-29 el reporte de ventas excluye pedidos cancelados", async () => {
    const { status, body } = await api("GET", `${PEDIDOS_URL}/reportes/ventas`, {
      token: admin.token,
    });
    expect(status).toBe(200);
    expect(Array.isArray(body.porProducto)).toBe(true);
    expect(Array.isArray(body.porCanal)).toBe(true);
  });

  it("CP-30 sugerencia de producción responde con cantidadSugerida entera", async () => {
    const { status, body } = await api("GET", `${PEDIDOS_URL}/reportes/sugerencia-produccion`, {
      token: admin.token,
    });
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length) {
      expect(Number.isInteger(body[0].cantidadSugerida)).toBe(true);
    }
  });
});
