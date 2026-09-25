// src/catalogo/app.js
// Microservicio de Catálogo Digital — RF-01, RF-02, RF-03
const express = require("express");
const cors = require("cors");
const catalogoRoutes = require("./routes/catalogo.routes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "catalogo", status: "ok" });
});

app.use("/productos", catalogoRoutes);

module.exports = app;
