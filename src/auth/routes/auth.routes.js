// src/auth/routes/auth.routes.js
// Implementa US-01 (registro) y US-02 (inicio de sesión) del Sprint 1.
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /auth/registro — US-01
router.post("/registro", async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  const existente = await prisma.usuario.findUnique({ where: { correo } });
  if (existente) {
    return res.status(409).json({ error: "El correo ya está registrado." });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, 10);
  const usuario = await prisma.usuario.create({
    data: { nombre, correo, contrasenaHash, rol: "cliente" },
  });
  await prisma.cliente.create({ data: { idUsuario: usuario.idUsuario } });

  res.status(201).json({ mensaje: "Registro exitoso", idUsuario: usuario.idUsuario });
});

// POST /auth/login — US-02
router.post("/login", async (req, res) => {
  const { correo, contrasena } = req.body;

  const usuario = await prisma.usuario.findUnique({ where: { correo } });
  if (!usuario) {
    return res.status(401).json({ error: "Credenciales inválidas." });
  }

  const coincide = await bcrypt.compare(contrasena, usuario.contrasenaHash);
  if (!coincide) {
    return res.status(401).json({ error: "Credenciales inválidas." });
  }

  const token = jwt.sign(
    { idUsuario: usuario.idUsuario, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.status(200).json({ token });
});

module.exports = router;
