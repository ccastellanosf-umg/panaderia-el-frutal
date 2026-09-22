// src/pedidos/index.js
// ESTADO: scaffolding para el Sprint 2 (gestión de pedidos e inventario).
// Expone únicamente /health mientras se implementan RF-04 a RF-08.
const express = require("express");
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pedidos", status: "scaffolding-sprint-2" });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Microservicio de pedidos (scaffolding) escuchando en el puerto ${PORT}`);
});

module.exports = app;
