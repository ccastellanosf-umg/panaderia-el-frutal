// src/catalogo/routes/catalogo.routes.js
// Implementa RF-01, RF-02, RF-03, RF-20.
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const verificarToken = require("../middlewares/verificarToken");
const { obtenerClienteConectado } = require("../lib/redis");

const router = express.Router();
const prisma = new PrismaClient();

const CLAVE_CACHE = "catalogo:disponibles";
const TTL_CACHE = 60; // segundos

function aNumero(producto) {
  return { ...producto, precio: Number(producto.precio) };
}

async function invalidarCache() {
  try {
    const cliente = await obtenerClienteConectado();
    if (cliente) await cliente.del(CLAVE_CACHE);
  } catch (_err) {
    // Redis caído: nada que invalidar, la próxima lectura irá a Postgres
  }
}

// GET /productos — RF-03: consulta pública, cacheada 60s (CU-03 2a)
router.get("/", async (_req, res) => {
  try {
    const cliente = await obtenerClienteConectado();
    if (cliente) {
      const cacheado = await cliente.get(CLAVE_CACHE);
      if (cacheado) {
        return res.status(200).json(JSON.parse(cacheado));
      }
    }

    const productos = await prisma.producto.findMany({ where: { disponibilidad: true } });
    const resultado = productos.map(aNumero);

    if (cliente) {
      await cliente.set(CLAVE_CACHE, JSON.stringify(resultado), { EX: TTL_CACHE });
    }

    return res.status(200).json(resultado);
  } catch (_err) {
    // Fallback ante fallo de Redis: leer directo de Postgres, sin error (CU-03 2a)
    const productos = await prisma.producto.findMany({ where: { disponibilidad: true } });
    return res.status(200).json(productos.map(aNumero));
  }
});

// GET /productos/todos — administrador: incluye no disponibles
router.get("/todos", verificarToken(["administrador"]), async (_req, res) => {
  const productos = await prisma.producto.findMany();
  res.status(200).json(productos.map(aNumero));
});

// POST /productos — administrador (CP-07, CP-08, CP-09, CP-10, CP-11)
router.post("/", verificarToken(["administrador"]), async (req, res) => {
  const { nombre, descripcion, precio, fotoUrl } = req.body || {};

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio." });
  }
  const precioNum = Number(precio);
  if (precio === undefined || Number.isNaN(precioNum) || precioNum < 0) {
    return res.status(400).json({ error: "El precio debe ser un número mayor o igual a 0." });
  }

  const producto = await prisma.producto.create({
    data: { nombre, descripcion, precio: precioNum, fotoUrl, disponibilidad: true },
  });
  await invalidarCache();
  res.status(201).json(aNumero(producto));
});

// PUT /productos/:id — administrador
router.put("/:id", verificarToken(["administrador"]), async (req, res) => {
  const { nombre, descripcion, precio, fotoUrl } = req.body || {};

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio." });
  }
  const precioNum = Number(precio);
  if (precio === undefined || Number.isNaN(precioNum) || precioNum < 0) {
    return res.status(400).json({ error: "El precio debe ser un número mayor o igual a 0." });
  }

  try {
    const producto = await prisma.producto.update({
      where: { idProducto: Number(req.params.id) },
      data: { nombre, descripcion, precio: precioNum, fotoUrl },
    });
    await invalidarCache();
    res.status(200).json(aNumero(producto));
  } catch (_err) {
    res.status(404).json({ error: "Producto no encontrado." });
  }
});

// PATCH /productos/:id/disponibilidad — administrador (CP-12)
router.patch("/:id/disponibilidad", verificarToken(["administrador"]), async (req, res) => {
  const { disponibilidad } = req.body || {};
  if (typeof disponibilidad !== "boolean") {
    return res.status(400).json({ error: "disponibilidad debe ser booleano." });
  }
  try {
    const producto = await prisma.producto.update({
      where: { idProducto: Number(req.params.id) },
      data: { disponibilidad },
    });
    await invalidarCache();
    res.status(200).json(aNumero(producto));
  } catch (_err) {
    res.status(404).json({ error: "Producto no encontrado." });
  }
});

module.exports = router;
