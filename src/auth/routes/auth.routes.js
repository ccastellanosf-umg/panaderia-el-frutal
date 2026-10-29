// src/auth/routes/auth.routes.js
// Implementa RF-20 (registro/login) y RF-21 (logout con lista negra).
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const verificarToken = require("../middlewares/verificarToken");
const prisma = require("../lib/prisma");
const { revocar } = require("../lib/tokensRevocados");
const { limiteLogin } = require("../lib/limiteLogin");
const { sanitizarLog } = require("../lib/log");

const router = express.Router();
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

    // DEF-06: normaliza el correo (trim + minúsculas) antes de buscar
    // y de guardar, para que "QA.Tester@x.com" y "qa.tester@x.com" se
    // traten como el mismo correo.
    const correoNormalizado = String(correo).trim().toLowerCase();

    const existente = await prisma.usuario.findUnique({ where: { correo: correoNormalizado } });
    if (existente) {
      return res.status(400).json({ error: "Correo en uso" });
    }

    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const usuario = await prisma.usuario.create({
      data: { nombre, correo: correoNormalizado, contrasenaHash, rol: "cliente" },
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
router.post("/login", limiteLogin, async (req, res) => {
  try {
    const { correo, contrasena } = req.body || {};
    if (!correo || !contrasena) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
    }

    // DEF-06: mismo criterio de normalización que en /registro.
    const correoNormalizado = String(correo).trim().toLowerCase();
    const usuario = await prisma.usuario.findUnique({ where: { correo: correoNormalizado } });
    if (!usuario) {
      console.warn(`Intento de login fallido para correo: ${sanitizarLog(correo)}`);
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasenaHash);
    if (!coincide) {
      console.warn(`Intento de login fallido para correo: ${sanitizarLog(correo)}`);
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

// POST /auth/logout — RF-21, DEF-03: revoca el jti en PostgreSQL
// (tabla compartida por los 4 servicios hasta que el token expire).
router.post("/logout", verificarToken([]), async (req, res) => {
  try {
    const { jti, exp } = req.usuario;
    await revocar(jti, exp);
    return res.status(200).json({ mensaje: "Sesión cerrada correctamente." });
  } catch (err) {
    // Sin poder revocar, la sesión sigue abierta: no se finge éxito.
    console.error("No se pudo revocar el token:", err.message);
    return res.status(503).json({ error: "Servicio no disponible." });
  }
});

module.exports = router;
