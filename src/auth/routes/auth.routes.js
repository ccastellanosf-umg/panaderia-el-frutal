// src/auth/routes/auth.routes.js
// Implementa RF-20 (registro/login) y RF-21 (logout con lista negra).
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const verificarToken = require("../middlewares/verificarToken");
const { obtenerClienteConectado } = require("../lib/redis");

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /auth/registro — CP-01..CP-04, DEF-09
router.post("/registro", async (req, res) => {
  try {
    const { nombre, correo, telefono, contrasena } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }
    if (!correo || !REGEX_CORREO.test(correo)) {
      return res.status(400).json({ error: "El correo no tiene un formato válido." });
    }
    if (!contrasena || String(contrasena).length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const existente = await prisma.usuario.findUnique({ where: { correo } });
    if (existente) {
      return res.status(400).json({ error: "Correo en uso" });
    }

    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const usuario = await prisma.usuario.create({
      data: { nombre, correo, contrasenaHash, rol: "cliente" },
    });
    await prisma.cliente.create({
      data: { idUsuario: usuario.idUsuario, telefono: telefono || null },
    });

    return res.status(201).json({ mensaje: "Registro exitoso", idUsuario: usuario.idUsuario });
  } catch (err) {
    return res.status(400).json({ error: "No fue posible completar el registro." });
  }
});

// POST /auth/login — CP-05, CP-06, DEF-06
router.post("/login", async (req, res) => {
  try {
    const { correo, contrasena } = req.body || {};
    if (!correo || !contrasena) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { correo } });
    if (!usuario) {
      console.warn(`Intento de login fallido para correo: ${correo}`);
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasenaHash);
    if (!coincide) {
      console.warn(`Intento de login fallido para correo: ${correo}`);
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const cliente = await prisma.cliente.findUnique({ where: { idUsuario: usuario.idUsuario } });
    const personal = await prisma.personal.findUnique({ where: { idUsuario: usuario.idUsuario } });

    const payload = {
      idUsuario: usuario.idUsuario,
      rol: usuario.rol,
      nombre: usuario.nombre,
      jti: randomUUID(),
    };
    if (personal) payload.area = personal.area;
    if (cliente) payload.idCliente = cliente.idCliente;

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });

    return res.status(200).json({
      token,
      expiresIn: "8h",
      usuario: {
        idUsuario: usuario.idUsuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        ...(personal ? { area: personal.area } : {}),
        ...(cliente ? { idCliente: cliente.idCliente } : {}),
      },
    });
  } catch (err) {
    return res.status(400).json({ error: "No fue posible iniciar sesión." });
  }
});

// GET /auth/me — cualquier usuario autenticado
router.get("/me", verificarToken([]), (req, res) => {
  res.status(200).json({ usuario: req.usuario });
});

// POST /auth/logout — RF-21: invalida el token actual (lista negra en Redis)
router.post("/logout", verificarToken([]), async (req, res) => {
  try {
    const { jti, exp } = req.usuario;
    if (jti && exp) {
      const cliente = await obtenerClienteConectado();
      if (cliente) {
        const ttlSegundos = exp - Math.floor(Date.now() / 1000);
        if (ttlSegundos > 0) {
          await cliente.set(`blacklist:${jti}`, "1", { EX: ttlSegundos });
        }
      }
    }
    return res.status(200).json({ mensaje: "Sesión cerrada correctamente." });
  } catch (_err) {
    // Redis caído: la sesión igual se considera cerrada del lado del cliente
    return res.status(200).json({ mensaje: "Sesión cerrada correctamente." });
  }
});

module.exports = router;
