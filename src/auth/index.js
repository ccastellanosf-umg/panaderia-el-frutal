// src/auth/index.js
// Microservicio de Autenticación — RF-20, RF-21, RNF-02
const express = require("express");
const authRoutes = require("./routes/auth.routes");

const app = express();
app.use(express.json());

// Endpoint de salud, usado por Docker healthcheck y por Azure Pipelines
app.get("/health", (_req, res) => {
  res.status(200).json({ service: "auth", status: "ok" });
});

app.use("/auth", authRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Microservicio de autenticación escuchando en el puerto ${PORT}`);
});

module.exports = app;
