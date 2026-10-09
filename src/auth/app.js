// src/auth/app.js
// Microservicio de Autenticación — RF-20, RF-21, RNF-02
// Exporta la app de Express sin escuchar puerto (permite pruebas con
// supertest sin abrir sockets reales).
require("./lib/asyncErrors"); // debe cargarse antes de las rutas (ver comentario en el archivo)
const express = require("express");
const { configurarSeguridad } = require("./lib/seguridad");
const authRoutes = require("./routes/auth.routes");

const app = express();
configurarSeguridad(app);
app.use(express.json());

// Endpoint de salud, usado por Docker healthcheck y por Azure Pipelines
app.get("/health", (_req, res) => {
  res.status(200).json({ service: "auth", status: "ok" });
});

app.use("/auth", authRoutes);

// DEF-09: cuerpo JSON malformado -> 400 JSON consistente (en vez del
// HTML por defecto de Express).
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido" });
  }
  next(err);
});

// DEF-01/DEF-02: red de seguridad final — cualquier error no
// controlado responde 500 JSON en vez de tumbar el proceso.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

module.exports = app;
