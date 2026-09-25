// src/auth/lib/redis.js
// Cliente Redis compartido — usado para la lista negra de tokens
// (RF-21, logout) y, en catálogo, como caché de lecturas. Se conecta
// de forma perezosa y nunca lanza si Redis no está disponible: el
// llamador debe tratar `null` como "Redis no disponible" y degradar.
const { createClient } = require("redis");

let cliente = null;

async function obtenerClienteConectado() {
  if (!process.env.REDIS_URL) return null;

  if (!cliente) {
    cliente = createClient({ url: process.env.REDIS_URL });
    cliente.on("error", (err) => {
      console.warn("Redis: error de conexión —", err.message);
    });
  }

  if (!cliente.isOpen) {
    try {
      await cliente.connect();
    } catch (err) {
      console.warn("Redis: no se pudo conectar —", err.message);
      return null;
    }
  }

  return cliente;
}

module.exports = { obtenerClienteConectado };
