// src/auth/lib/tokensRevocados.js
// DEF-03: consulta la lista de tokens revocados (logout) en PostgreSQL,
// compartida por los 4 servicios. Si la consulta falla, el llamador
// debe fallar cerrado (503), nunca aceptar el token.
const prisma = require("./prisma");

async function estaRevocado(jti) {
  const fila = await prisma.tokenRevocado.findUnique({ where: { jti } });
  return !!fila;
}

// Logout (RF-21): registra el jti hasta que el token expire de todos
// modos y aprovecha para borrar las revocaciones ya vencidas.
async function revocar(jti, expSegundos) {
  await prisma.tokenRevocado.createMany({
    data: [{ jti, expira: new Date(expSegundos * 1000) }],
    skipDuplicates: true,
  });
  await prisma.tokenRevocado.deleteMany({ where: { expira: { lt: new Date() } } });
}

module.exports = { estaRevocado, revocar };
