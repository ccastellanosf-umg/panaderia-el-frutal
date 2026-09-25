// src/pagos/app.js
// Microservicio de Pagos y Suscripciones — RF-13..16, RF-20
const express = require("express");
const cors = require("cors");
const suscripcionesRoutes = require("./routes/suscripciones.routes");
const planesRoutes = require("./routes/planes.routes");
const pagosRoutes = require("./routes/pagos.routes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pagos", status: "ok" });
});

app.use("/suscripciones", suscripcionesRoutes);
app.use("/planes", planesRoutes);
app.use("/pagos", pagosRoutes);

module.exports = app;
