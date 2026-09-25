// src/pedidos/routes/pedidos.routes.js
// Implementa RF-04..08, RF-20 sobre la tabla pedidos.
const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const { query, conTransaccion, mapearErrorDb } = require("../lib/db");
const { notificarPedido } = require("../lib/notificaciones");

const router = express.Router();

function aNumero(pedido) {
  if (!pedido) return pedido;
  return { ...pedido, total: pedido.total !== undefined ? Number(pedido.total) : undefined };
}

async function obtenerPedidoCompleto(idPedido) {
  const { rows } = await query(
    `SELECT p.*, fn_cliente_de_pedido(p."idPedido") AS "idClienteResuelto"
     FROM pedidos p WHERE p."idPedido" = $1`,
    [idPedido]
  );
  if (!rows.length) return null;
  const pedido = aNumero(rows[0]);

  const detalle = await query(
    `SELECT dp."idDetalle", dp."idProducto", pr."nombre", dp."cantidad", dp."subtotal"
     FROM detalle_pedido dp
     JOIN productos pr ON pr."idProducto" = dp."idProducto"
     WHERE dp."idPedido" = $1
     ORDER BY dp."idDetalle"`,
    [idPedido]
  );
  pedido.items = detalle.rows.map((d) => ({ ...d, subtotal: Number(d.subtotal) }));
  return pedido;
}

// POST /pedidos — cliente. RF-04, CP-14, CP-15, CU-05 3a
router.post("/", verificarToken(["cliente"]), async (req, res) => {
  const { items, direccionEntrega, fechaEntrega } = req.body || {};
  const idCliente = req.usuario.idCliente;

  if (!idCliente) {
    return res.status(400).json({ error: "El token no tiene un cliente asociado." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Pedido vacío" });
  }
  for (const item of items) {
    if (
      !item ||
      !Number.isInteger(item.idProducto) ||
      !Number.isInteger(item.cantidad) ||
      item.cantidad < 1
    ) {
      return res.status(400).json({ error: "Cada ítem requiere idProducto y cantidad entera >= 1." });
    }
  }

  try {
    const idPedido = await conTransaccion(async (cliente) => {
      const resultado = await cliente.query(
        `CALL sp_registrar_pedido($1::INT, NULL::INT, 'ocasional'::VARCHAR(20), NULL)`,
        [idCliente]
      );
      const nuevoId = resultado.rows[0].p_idPedido;

      for (const item of items) {
        await cliente.query(`CALL sp_agregar_detalle_pedido($1::INT, $2::INT, $3::INT)`, [
          nuevoId,
          item.idProducto,
          item.cantidad,
        ]);
      }

      if (direccionEntrega || fechaEntrega) {
        await cliente.query(
          `UPDATE pedidos SET "direccionEntrega" = $1, "fechaEntrega" = $2 WHERE "idPedido" = $3`,
          [direccionEntrega || null, fechaEntrega || null, nuevoId]
        );
      }

      return nuevoId;
    });

    const pedido = await obtenerPedidoCompleto(idPedido);
    return res.status(201).json(pedido);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    console.error("Error al registrar pedido:", err);
    return res.status(400).json({ error: "No fue posible registrar el pedido." });
  }
});

// GET /pedidos/mios — cliente (historial, RF-07)
router.get("/mios", verificarToken(["cliente"]), async (req, res) => {
  const idCliente = req.usuario.idCliente;
  const { rows } = await query(
    `SELECT p."idPedido" FROM pedidos p
     WHERE fn_cliente_de_pedido(p."idPedido") = $1
     ORDER BY p."fecha" DESC, p."idPedido" DESC`,
    [idCliente]
  );
  const pedidos = await Promise.all(rows.map((r) => obtenerPedidoCompleto(r.idPedido)));
  return res.status(200).json(pedidos);
});

// GET /pedidos — administrador u operador de ventas
router.get(
  "/",
  verificarToken(["administrador", "operador"], ["ventas"]),
  async (req, res) => {
    const { estado } = req.query;
    const params = [];
    let sql = `SELECT p."idPedido", p."fecha", p."estado", p."tipo", p."total",
                      fn_cliente_de_pedido(p."idPedido") AS "idCliente"
               FROM pedidos p`;
    if (estado) {
      params.push(estado);
      sql += ` WHERE p."estado" = $1`;
    }
    sql += ` ORDER BY p."fecha" DESC, p."idPedido" DESC`;
    const { rows } = await query(sql, params);
    return res.status(200).json(rows.map(aNumero));
  }
);

// GET /pedidos/:id — dueño o personal
router.get("/:id", verificarToken([]), async (req, res) => {
  const idPedido = Number(req.params.id);
  if (!Number.isInteger(idPedido)) {
    return res.status(400).json({ error: "El id del pedido debe ser un número entero." });
  }

  try {
    const pedido = await obtenerPedidoCompleto(idPedido);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado." });

    const { rol, idCliente, area } = req.usuario;
    const esDueno = rol === "cliente" && idCliente === pedido.idClienteResuelto;
    const esPersonal = rol === "administrador" || (rol === "operador" && area === "ventas");
    if (!esDueno && !esPersonal) {
      return res.status(403).json({ error: "No autorizado para este recurso." });
    }
    return res.status(200).json(pedido);
  } catch (err) {
    console.error("Error al obtener pedido:", err);
    return res.status(400).json({ error: "No fue posible obtener el pedido." });
  }
});

// PATCH /pedidos/:id/estado — administrador / operador ventas. CP-16..19
router.patch(
  "/:id/estado",
  verificarToken(["administrador", "operador"], ["ventas"]),
  async (req, res) => {
    const idPedido = Number(req.params.id);
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ error: "El estado es obligatorio." });

    try {
      const { rowCount } = await query(
        `UPDATE pedidos SET "estado" = $1 WHERE "idPedido" = $2`,
        [estado, idPedido]
      );
      if (!rowCount) return res.status(404).json({ error: "Pedido no encontrado." });

      await notificarPedido(idPedido, `Tu pedido #${idPedido} cambió de estado a "${estado}".`);

      const pedido = await obtenerPedidoCompleto(idPedido);
      return res.status(200).json(pedido);
    } catch (err) {
      const mapeado = mapearErrorDb(err);
      if (mapeado) return res.status(mapeado.status).json(mapeado.body);
      console.error("Error al cambiar estado del pedido:", err);
      return res.status(400).json({ error: "No fue posible cambiar el estado del pedido." });
    }
  }
);

// PATCH /pedidos/:id/cancelar — cliente dueño. CP-20, CP-21
router.patch("/:id/cancelar", verificarToken(["cliente"]), async (req, res) => {
  const idPedido = Number(req.params.id);
  const idCliente = req.usuario.idCliente;
  if (!Number.isInteger(idPedido)) {
    return res.status(400).json({ error: "El id del pedido debe ser un número entero." });
  }

  try {
    const { rows } = await query(
      `SELECT fn_cliente_de_pedido("idPedido") AS "idCliente" FROM pedidos WHERE "idPedido" = $1`,
      [idPedido]
    );
    if (!rows.length) return res.status(404).json({ error: "Pedido no encontrado." });
    if (rows[0].idCliente !== idCliente) {
      return res.status(403).json({ error: "No autorizado para este recurso." });
    }

    await query(`UPDATE pedidos SET "estado" = 'cancelado' WHERE "idPedido" = $1`, [idPedido]);
    await notificarPedido(idPedido, `Tu pedido #${idPedido} fue cancelado.`);
    const pedido = await obtenerPedidoCompleto(idPedido);
    return res.status(200).json(pedido);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    console.error("Error al cancelar pedido:", err);
    return res.status(400).json({ error: "No fue posible cancelar el pedido." });
  }
});

module.exports = router;
