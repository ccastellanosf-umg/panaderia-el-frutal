// src/pagos/routes/planes.routes.js
// GET /planes — público (catálogo de planes de suscripción).
const express = require("express");
const { query } = require("../lib/db");

const router = express.Router();

router.get("/", async (_req, res) => {
  const { rows } = await query(`SELECT * FROM planes ORDER BY "idPlan"`);
  res.status(200).json(rows.map((p) => ({ ...p, precio: Number(p.precio) })));
});

module.exports = router;
