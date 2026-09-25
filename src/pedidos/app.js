// src/pedidos/app.js
// Microservicio de Gestión de Pedidos — RF-04..12, RF-17..20
const express = require("express");
const cors = require("cors");
const pedidosRoutes = require("./routes/pedidos.routes");
const inventarioRoutes = require("./routes/inventario.routes");
const reportesRoutes = require("./routes/reportes.routes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "pedidos", status: "ok" });
});

app.use("/pedidos", pedidosRoutes);
app.use("/inventario", inventarioRoutes);
app.use("/reportes", reportesRoutes);

module.exports = app;
