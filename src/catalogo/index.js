// src/catalogo/index.js
// Microservicio de Catálogo Digital — RF-01, RF-02, RF-03
const express = require("express");
const catalogoRoutes = require("./routes/catalogo.routes");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "catalogo", status: "ok" });
});

app.use("/productos", catalogoRoutes);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Microservicio de catálogo escuchando en el puerto ${PORT}`);
});

module.exports = app;
