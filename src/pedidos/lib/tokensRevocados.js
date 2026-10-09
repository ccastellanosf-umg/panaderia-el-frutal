// src/pedidos/lib/tokensRevocados.js
// DEF-03: consulta la lista de tokens revocados (logout) en PostgreSQL,
// compartida por los 4 servicios. Si la consulta falla, el llamador
// debe fallar cerrado (503), nunca aceptar el token.
const { query } = require("./db");

async function estaRevocado(jti) {
  const { rows } = await query(
    "SELECT 1 FROM tokens_revocados WHERE jti = $1 LIMIT 1",
    [jti]
  );
  return rows.length > 0;
}

module.exports = { estaRevocado };
