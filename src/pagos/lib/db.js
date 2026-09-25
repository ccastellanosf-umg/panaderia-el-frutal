// src/pagos/lib/db.js
// Acceso a PostgreSQL vía node-postgres (igual criterio que pedidos:
// este servicio opera sobre procedimientos/vistas ya definidos en
// db/01_schema.sql).
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function query(text, params) {
  return pool.query(text, params);
}

async function conTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (err) {
    await cliente.query("ROLLBACK");
    throw err;
  } finally {
    cliente.release();
  }
}

function mapearErrorDb(err) {
  if (err.code === "P0001") {
    return { status: 400, body: { error: err.message } };
  }
  if (err.code === "23514") {
    return { status: 400, body: { error: "Datos inválidos: violan una regla de negocio." } };
  }
  if (err.code === "23503") {
    return { status: 400, body: { error: "Referencia inválida (recurso relacionado no existe)." } };
  }
  if (err.code === "23505") {
    return { status: 409, body: { error: "El recurso ya existe." } };
  }
  return null;
}

module.exports = { pool, query, conTransaccion, mapearErrorDb };
