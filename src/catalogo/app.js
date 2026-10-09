// src/catalogo/app.js
// Microservicio de Catálogo Digital — RF-01, RF-02, RF-03
require("./lib/asyncErrors"); // debe cargarse antes de las rutas (ver comentario en el archivo)
const express = require("express");
const { configurarSeguridad } = require("./lib/seguridad");
const catalogoRoutes = require("./routes/catalogo.routes");

const app = express();
configurarSeguridad(app);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "catalogo", status: "ok" });
});

app.use("/productos", catalogoRoutes);

// DEF-09: cuerpo JSON malformado -> 400 JSON consistente.
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido" });
  }
  next(err);
});

// DEF-01: red de seguridad final — cualquier error no controlado
// (p. ej. PrismaClientValidationError por un precio no finito)
// responde 500 JSON en vez de tumbar el proceso.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

module.exports = app;
