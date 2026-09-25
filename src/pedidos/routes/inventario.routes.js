// src/pedidos/routes/inventario.routes.js
// Implementa RF-09, RF-10, RF-11, RF-12.
const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const { query, mapearErrorDb } = require("../lib/db");

const router = express.Router();

const permitirInventario = verificarToken(["administrador", "operador"], ["produccion"]);

// DEF-02: mismo criterio de validación de fechas que reportes.routes.js
// (formato YYYY-MM-DD, fecha calendario real) para este endpoint de
// reporte de producción.
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
function fechaValida(valor) {
  if (!REGEX_FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.toISOString().slice(0, 10) === valor;
}

function aNumeroInsumo(i) {
  return {
    ...i,
    cantidadDisponible: Number(i.cantidadDisponible),
    nivelMinimo: Number(i.nivelMinimo),
  };
}

// GET /inventario/insumos — RF-09
router.get("/insumos", permitirInventario, async (_req, res) => {
  const { rows } = await query(`SELECT * FROM insumos ORDER BY "idInsumo"`);
  res.status(200).json(rows.map(aNumeroInsumo));
});

// POST /inventario/insumos — RF-09
router.post("/insumos", permitirInventario, async (req, res) => {
  const { nombre, cantidadDisponible, nivelMinimo, unidadMedida } = req.body || {};
  if (!nombre || !unidadMedida) {
    return res.status(400).json({ error: "nombre y unidadMedida son obligatorios." });
  }
  const cantidad = Number(cantidadDisponible ?? 0);
  const minimo = Number(nivelMinimo ?? 0);
  if (Number.isNaN(cantidad) || cantidad < 0 || Number.isNaN(minimo) || minimo < 0) {
    return res.status(400).json({ error: "cantidadDisponible y nivelMinimo deben ser >= 0." });
  }

  try {
    const { rows } = await query(
      `INSERT INTO insumos ("nombre", "cantidadDisponible", "nivelMinimo", "unidadMedida")
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, cantidad, minimo, unidadMedida]
    );
    res.status(201).json(aNumeroInsumo(rows[0]));
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible crear el insumo." });
  }
});

// PATCH /inventario/insumos/:id — restock/ajuste
router.patch("/insumos/:id", permitirInventario, async (req, res) => {
  const { cantidadDisponible, nivelMinimo } = req.body || {};
  const campos = [];
  const valores = [];
  let idx = 1;

  if (cantidadDisponible !== undefined) {
    const cantidad = Number(cantidadDisponible);
    if (Number.isNaN(cantidad) || cantidad < 0) {
      return res.status(400).json({ error: "cantidadDisponible debe ser >= 0." });
    }
    campos.push(`"cantidadDisponible" = $${idx++}`);
    valores.push(cantidad);
  }
  if (nivelMinimo !== undefined) {
    const minimo = Number(nivelMinimo);
    if (Number.isNaN(minimo) || minimo < 0) {
      return res.status(400).json({ error: "nivelMinimo debe ser >= 0." });
    }
    campos.push(`"nivelMinimo" = $${idx++}`);
    valores.push(minimo);
  }
  if (!campos.length) {
    return res.status(400).json({ error: "Nada que actualizar." });
  }

  valores.push(Number(req.params.id));
  try {
    const { rows } = await query(
      `UPDATE insumos SET ${campos.join(", ")} WHERE "idInsumo" = $${idx} RETURNING *`,
      valores
    );
    if (!rows.length) return res.status(404).json({ error: "Insumo no encontrado." });
    res.status(200).json(aNumeroInsumo(rows[0]));
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible actualizar el insumo." });
  }
});

// GET /inventario/alertas — RF-11 (vw_inventario_critico), DEF-10
router.get("/alertas", permitirInventario, async (_req, res) => {
  const { rows } = await query(`SELECT * FROM vw_inventario_critico ORDER BY "idInsumo"`);
  res.status(200).json(rows.map(aNumeroInsumo));
});

// GET /inventario/recetas/:idProducto
router.get("/recetas/:idProducto", permitirInventario, async (req, res) => {
  const { rows } = await query(
    `SELECT pi."idInsumo", i."nombre", i."unidadMedida", pi."cantidadRequerida"
     FROM producto_insumo pi
     JOIN insumos i ON i."idInsumo" = pi."idInsumo"
     WHERE pi."idProducto" = $1
     ORDER BY pi."idInsumo"`,
    [Number(req.params.idProducto)]
  );
  res.status(200).json(rows.map((r) => ({ ...r, cantidadRequerida: Number(r.cantidadRequerida) })));
});

// PUT /inventario/recetas/:idProducto — reemplaza la receta completa
router.put("/recetas/:idProducto", permitirInventario, async (req, res) => {
  const idProducto = Number(req.params.idProducto);
  const { receta } = req.body || {};
  if (!Array.isArray(receta)) {
    return res.status(400).json({ error: "receta debe ser un arreglo de {idInsumo, cantidadRequerida}." });
  }
  for (const r of receta) {
    if (!r || !Number.isInteger(r.idInsumo) || !(Number(r.cantidadRequerida) > 0)) {
      return res.status(400).json({ error: "Cada ítem requiere idInsumo y cantidadRequerida > 0." });
    }
  }

  try {
    await query(`DELETE FROM producto_insumo WHERE "idProducto" = $1`, [idProducto]);
    for (const r of receta) {
      await query(
        `INSERT INTO producto_insumo ("idProducto", "idInsumo", "cantidadRequerida") VALUES ($1, $2, $3)`,
        [idProducto, r.idInsumo, Number(r.cantidadRequerida)]
      );
    }
    res.status(200).json({ mensaje: "Receta actualizada." });
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible actualizar la receta." });
  }
});

// GET /inventario/produccion — RF-12
router.get("/produccion", permitirInventario, async (req, res) => {
  const { desde, hasta } = req.query;
  if (desde !== undefined && !fechaValida(desde)) {
    return res.status(400).json({ error: `"desde" no es una fecha válida (formato esperado YYYY-MM-DD).` });
  }
  if (hasta !== undefined && !fechaValida(hasta)) {
    return res.status(400).json({ error: `"hasta" no es una fecha válida (formato esperado YYYY-MM-DD).` });
  }
  const params = [];
  let sql = `SELECT pd.*, pr."nombre" AS "producto" FROM produccion_diaria pd
             JOIN productos pr ON pr."idProducto" = pd."idProducto"`;
  const condiciones = [];
  if (desde) {
    params.push(desde);
    condiciones.push(`pd."fecha" >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`pd."fecha" <= $${params.length}`);
  }
  if (condiciones.length) sql += ` WHERE ${condiciones.join(" AND ")}`;
  sql += ` ORDER BY pd."fecha" DESC`;

  const { rows } = await query(sql, params);
  res.status(200).json(rows);
});

// POST /inventario/produccion — RF-12
router.post("/produccion", permitirInventario, async (req, res) => {
  const { idProducto, fecha, cantidadProducida } = req.body || {};
  if (!Number.isInteger(idProducto) || !Number.isInteger(cantidadProducida) || cantidadProducida < 0) {
    return res.status(400).json({ error: "idProducto y cantidadProducida (entero >= 0) son obligatorios." });
  }

  try {
    const { rows } = await query(
      `INSERT INTO produccion_diaria ("idProducto", "fecha", "cantidadProducida")
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3) RETURNING *`,
      [idProducto, fecha || null, cantidadProducida]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    const mapeado = mapearErrorDb(err);
    if (mapeado) return res.status(mapeado.status).json(mapeado.body);
    res.status(400).json({ error: "No fue posible registrar la producción." });
  }
});

module.exports = router;
