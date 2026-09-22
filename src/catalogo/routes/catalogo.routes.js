// src/catalogo/routes/catalogo.routes.js
// Implementa US-04 (registro), US-05 (disponibilidad) y
// US-06 (consulta pública) del Sprint 1.
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const verificarToken = require("../middlewares/verificarToken");

const router = express.Router();
const prisma = new PrismaClient();

// GET /productos — US-06: consulta pública, sin autenticación
router.get("/", async (_req, res) => {
  const productos = await prisma.producto.findMany({
    where: { disponibilidad: true },
  });
  res.status(200).json(productos);
});

// POST /productos — US-04: solo administrador
router.post("/", verificarToken(["administrador"]), async (req, res) => {
  const { nombre, descripcion, precio, fotoUrl } = req.body;
  const producto = await prisma.producto.create({
    data: { nombre, descripcion, precio, fotoUrl, disponibilidad: true },
  });
  res.status(201).json(producto);
});

// PATCH /productos/:id/disponibilidad — US-05: solo administrador
router.patch("/:id/disponibilidad", verificarToken(["administrador"]), async (req, res) => {
  const { disponibilidad } = req.body;
  const producto = await prisma.producto.update({
    where: { idProducto: Number(req.params.id) },
    data: { disponibilidad },
  });
  res.status(200).json(producto);
});

module.exports = router;
