// src/catalogo/lib/tokensRevocados.js
// DEF-03: consulta la lista de tokens revocados (logout) en PostgreSQL,
// compartida por los 4 servicios. Si la consulta falla, el llamador
// debe fallar cerrado (503), nunca aceptar el token.
const prisma = require("./prisma");

async function estaRevocado(jti) {
  const fila = await prisma.tokenRevocado.findUnique({ where: { jti } });
  return !!fila;
}

module.exports = { estaRevocado };
