// src/auth/app.js
// Microservicio de Autenticación — RF-20, RF-21, RNF-02
// Exporta la app de Express sin escuchar puerto (permite pruebas con
// supertest sin abrir sockets reales).
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint de salud, usado por Docker healthcheck y por Azure Pipelines
app.get("/health", (_req, res) => {
  res.status(200).json({ service: "auth", status: "ok" });
});

app.use("/auth", authRoutes);

module.exports = app;
