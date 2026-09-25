// src/pagos/routes/suscripciones.routes.js
// Implementa RF-13, RF-14, RF-15, RF-16, RF-20.
const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const { query, conTransaccion, mapearErrorDb } = require("../lib/db");
const { procesarCobro } = require("../lib/pasarela");

const router = express.Router();

async function obtenerSuscripcionCompleta(idSuscripcion) {
  const { rows } = await query(
    `SELECT s.*, pl."nombre" AS "planNombre", pl."frecuencia", pl."precio"
     FROM suscripciones s JOIN planes pl ON pl."idPlan" = s."idPlan"
     WHERE s."idSuscripcion" = $1`,
    [idSuscripcion]
  );
  if (!rows.length) return null;
  const suscripcion = { ...rows[0], precio: Number(rows[0].precio) };

  const surtido = await query(
    `SELECT sp."idProducto", pr."nombre", sp."cantidad"
     FROM suscripcion_producto sp JOIN productos pr ON pr."idProducto" = sp."idProducto"
     WHERE sp."idSuscripcion" = $1`,
    [idSuscripcion]
  );
  suscripcion.surtido = surtido.rows;
  return suscripcion;
}

function horasHastaCobro(fechaCobro) {
  const ahora = new Date();
  return (new Date(fechaCobro).getTime() - ahora.getTime()) / (1000 * 60 * 60);
}

// POST /suscripciones — cliente. CP-24
router.post("/", verificarToken(["cliente"]), async (req, res) => {
  const { idPlan, surtido } = req.body || {};
  const idCliente = req.usuario.idCliente;

  if (!idCliente) return res.status(400).json({ error: "El token no tiene un cliente asociado." });
  if (!Number.isInteger(idPlan)) return res.status(400).json({ error: "idPlan es obligatorio." });
  if (!Array.isArray(surtido) || surtido.length === 0) {
    return res.status(400).json({ error: "El surtido de productos es obligatorio." });
  }
  for (const s of surtido) {
    if (!s || !Number.isInteger(s.idProducto) || !Number.isInteger(s.cantidad) || s.cantidad < 1) {
      return res.status(400).json({ error: "Cada ítem del surtido requiere idProducto y cantidad entera >= 1." });
    }
  }

  try {
    const idSuscripcion = await conTransaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO suscripciones ("idCliente", "idPlan", "fechaCobro")
         VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING "idSuscripcion"`,
        [idCliente, idPlan]
      );
      const nuevoId = rows[0].idSuscripcion;

      for (const s of surtido) {
        await cliente.query(
          `INSERT INTO suscripcion_producto ("idSuscripcion", "idProducto", "cantidad")
           VALUES ($1, $2, $3)`,
          [nuevoId, s.idProducto, s.cantidad]
        );
      }

      await cliente.query(`UPDATE clientes SET "tipoCliente" = 'suscriptor' WHERE "idCliente" = $1`, [
        idCliente,
      ]);

      const resultado = procesarCobro();
      await cliente.query(`CALL sp_procesar_cobro_suscripcion($1::INT, $2::VARCHAR(20))`, [
        nuevoId,
        resultado,
      ]);

      return nuevoId;
    });

    const suscripcion = await obtenerSuscripcionCompleta(idSuscripcion);
    return res.status(201).json(suscripcion);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    console.error("Error al crear suscripción:", err);
    return res.status(400).json({ error: "No fue posible crear la suscripción." });
  }
});

// GET /suscripciones/mias — cliente
router.get("/mias", verificarToken(["cliente"]), async (req, res) => {
  const { rows } = await query(
    `SELECT "idSuscripcion" FROM suscripciones WHERE "idCliente" = $1 ORDER BY "idSuscripcion" DESC`,
    [req.usuario.idCliente]
  );
  const suscripciones = await Promise.all(rows.map((r) => obtenerSuscripcionCompleta(r.idSuscripcion)));
  res.status(200).json(suscripciones);
});

// POST /suscripciones/:id/cobrar — administrador. CP-25, CP-26, DEF-04
router.post("/:id/cobrar", verificarToken(["administrador"]), async (req, res) => {
  const idSuscripcion = Number(req.params.id);
  const modo = process.env.PASARELA_MODO || "simulada";
  const { simularRespuesta } = req.body || {};

  if (simularRespuesta && !["aprobado", "rechazado"].includes(simularRespuesta)) {
    return res.status(400).json({ error: "simularRespuesta debe ser 'aprobado' o 'rechazado'." });
  }
  if (simularRespuesta && modo !== "simulada") {
    return res.status(400).json({ error: "simularRespuesta solo aplica en modo simulado." });
  }

  try {
    const resultado = procesarCobro(simularRespuesta);
    await query(`CALL sp_procesar_cobro_suscripcion($1::INT, $2::VARCHAR(20))`, [
      idSuscripcion,
      resultado,
    ]);
    const suscripcion = await obtenerSuscripcionCompleta(idSuscripcion);
    if (!suscripcion) return res.status(404).json({ error: "Suscripción no encontrada." });
    return res.status(200).json({ resultado, suscripcion });
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    console.error("Error al procesar cobro:", err);
    return res.status(400).json({ error: "No fue posible procesar el cobro." });
  }
});

async function validarPropiedadYVentana(req, res, accion) {
  const idSuscripcion = Number(req.params.id);
  const idCliente = req.usuario.idCliente;

  const { rows } = await query(
    `SELECT "idCliente", "fechaCobro", "estado" FROM suscripciones WHERE "idSuscripcion" = $1`,
    [idSuscripcion]
  );
  if (!rows.length) {
    res.status(404).json({ error: "Suscripción no encontrada." });
    return null;
  }
  if (rows[0].idCliente !== idCliente) {
    res.status(403).json({ error: "No autorizado para este recurso." });
    return null;
  }
  if (accion !== "reactivar" && horasHastaCobro(rows[0].fechaCobro) < 48) {
    res.status(409).json({
      error: "Debes esperar al menos 48 horas antes del próximo cobro para realizar esta acción.",
    });
    return null;
  }
  return idSuscripcion;
}

// PATCH /suscripciones/:id/cancelar — owner. CP-27, CP-28, RN-03
router.patch("/:id/cancelar", verificarToken(["cliente"]), async (req, res) => {
  const idSuscripcion = await validarPropiedadYVentana(req, res, "cancelar");
  if (idSuscripcion === null) return;

  try {
    await query(`CALL sp_cancelar_suscripcion($1::INT)`, [idSuscripcion]);
    const suscripcion = await obtenerSuscripcionCompleta(idSuscripcion);
    res.status(200).json(suscripcion);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible cancelar la suscripción." });
  }
});

// PATCH /suscripciones/:id/pausar — owner. RN-03
router.patch("/:id/pausar", verificarToken(["cliente"]), async (req, res) => {
  const idSuscripcion = await validarPropiedadYVentana(req, res, "pausar");
  if (idSuscripcion === null) return;

  try {
    await query(`UPDATE suscripciones SET "estado" = 'pausada' WHERE "idSuscripcion" = $1`, [
      idSuscripcion,
    ]);
    const suscripcion = await obtenerSuscripcionCompleta(idSuscripcion);
    res.status(200).json(suscripcion);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible pausar la suscripción." });
  }
});

// PATCH /suscripciones/:id/reactivar — owner
router.patch("/:id/reactivar", verificarToken(["cliente"]), async (req, res) => {
  const idSuscripcion = await validarPropiedadYVentana(req, res, "reactivar");
  if (idSuscripcion === null) return;

  try {
    await query(`UPDATE suscripciones SET "estado" = 'activa' WHERE "idSuscripcion" = $1`, [
      idSuscripcion,
    ]);
    const suscripcion = await obtenerSuscripcionCompleta(idSuscripcion);
    res.status(200).json(suscripcion);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible reactivar la suscripción." });
  }
});

module.exports = router;
