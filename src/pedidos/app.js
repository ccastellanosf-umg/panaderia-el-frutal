// src/pedidos/app.js
// Microservicio de Gestión de Pedidos — RF-04..12, RF-17..20
require("./lib/asyncErrors"); // debe cargarse antes de las rutas (ver comentario en el archivo)
const express = require("express");
const { configurarSeguridad } = require("./lib/seguridad");
const pedidosRoutes = require("./routes/pedidos.routes");
const inventarioRoutes = require("./routes/inventario.routes");
const reportesRoutes = require("./routes/reportes.routes");

const app = express();
configurarSeguridad(app);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pedidos", status: "ok" });
});

app.use("/pedidos", pedidosRoutes);
app.use("/inventario", inventarioRoutes);
app.use("/reportes", reportesRoutes);

// DEF-09: cuerpo JSON malformado -> 400 JSON consistente.
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido" });
  }
  next(err);
});

// DEF-02: red de seguridad final — cualquier error no controlado
// (p. ej. una fecha inválida que llega a Postgres como DateTimeParseError)
// responde 500 JSON en vez de tumbar el proceso.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

module.exports = app;
