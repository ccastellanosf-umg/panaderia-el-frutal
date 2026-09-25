// src/pagos/routes/pagos.routes.js
// GET /pagos — administrador: listado de pagos procesados.
const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const { query } = require("../lib/db");

const router = express.Router();

router.get("/", verificarToken(["administrador"]), async (_req, res) => {
  const { rows } = await query(`SELECT * FROM pagos ORDER BY "idPago" DESC`);
  res.status(200).json(rows.map((p) => ({ ...p, monto: Number(p.monto) })));
});

module.exports = router;
