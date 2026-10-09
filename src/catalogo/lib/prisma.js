// src/catalogo/lib/prisma.js
// Cliente Prisma único por proceso (rutas y verificarToken comparten
// el mismo pool de conexiones).
const { PrismaClient } = require("@prisma/client");

module.exports = new PrismaClient();
