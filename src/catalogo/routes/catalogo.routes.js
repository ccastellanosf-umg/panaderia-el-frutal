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

// DEF-01/DEF-08: valida que "precio" sea obligatorio, un número finito
// (rechaza Infinity/-Infinity/NaN), >= 0 y con a lo sumo 2 decimales.
// null/undefined/"" se tratan igual que "ausente" (DEF-08).
function precioValido(precio) {
  if (precio === undefined || precio === null || precio === "") {
    return { ok: false };
  }
  const precioNum = Number(precio);
  if (!Number.isFinite(precioNum) || precioNum < 0) {
    return { ok: false };
  }
  const redondeado = Math.round(precioNum * 100) / 100;
  if (Math.abs(redondeado - precioNum) > 1e-9) {
    return { ok: false }; // más de 2 decimales
  }
  return { ok: true, precioNum: redondeado };
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
  const validacionPrecio = precioValido(precio);
  if (!validacionPrecio.ok) {
    return res.status(400).json({
      error: "El precio es obligatorio y debe ser un número finito mayor o igual a 0 con máximo 2 decimales.",
    });
  }

  const producto = await prisma.producto.create({
    data: { nombre, descripcion, precio: validacionPrecio.precioNum, fotoUrl, disponibilidad: true },
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
  const validacionPrecio = precioValido(precio);
  if (!validacionPrecio.ok) {
    return res.status(400).json({
      error: "El precio es obligatorio y debe ser un número finito mayor o igual a 0 con máximo 2 decimales.",
    });
  }

  try {
    const producto = await prisma.producto.update({
      where: { idProducto: Number(req.params.id) },
      data: { nombre, descripcion, precio: validacionPrecio.precioNum, fotoUrl },
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
