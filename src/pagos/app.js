// src/pagos/app.js
// Microservicio de Pagos y Suscripciones — RF-13..16, RF-20
require("./lib/asyncErrors"); // debe cargarse antes de las rutas (ver comentario en el archivo)
const express = require("express");
const { configurarSeguridad } = require("./lib/seguridad");
const suscripcionesRoutes = require("./routes/suscripciones.routes");
const planesRoutes = require("./routes/planes.routes");
const pagosRoutes = require("./routes/pagos.routes");

const app = express();
configurarSeguridad(app);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pagos", status: "ok" });
});

app.use("/suscripciones", suscripcionesRoutes);
app.use("/planes", planesRoutes);
app.use("/pagos", pagosRoutes);

// DEF-09: cuerpo JSON malformado -> 400 JSON consistente.
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido" });
  }
  next(err);
});

// DEF-04 y crash-proofing general: red de seguridad final — cualquier
// error no controlado responde 500 JSON en vez de tumbar el proceso.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

module.exports = app;
