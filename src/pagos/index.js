// src/pagos/index.js
// ESTADO: scaffolding para el Sprint 3 (suscripciones y pagos).
// Expone únicamente /health mientras se implementan RF-13 a RF-16.
const express = require("express");
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pagos", status: "scaffolding-sprint-3" });
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Microservicio de pagos (scaffolding) escuchando en el puerto ${PORT}`);
});

module.exports = app;
