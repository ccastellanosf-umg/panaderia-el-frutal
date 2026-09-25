// src/pedidos/lib/db.js
// Acceso a PostgreSQL vía node-postgres. Se usa directamente (en vez
// de Prisma) porque este servicio opera casi enteramente sobre
// procedimientos almacenados, disparadores y vistas ya definidos en
// db/01_schema.sql — $queryRaw añadiría una capa sin beneficio real.
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

// Traduce errores de Postgres (RAISE EXCEPTION, CHECK, FK) a una
// respuesta HTTP homogénea — nunca 500 por reglas de negocio.
function mapearErrorDb(err) {
  // P0001: RAISE EXCEPTION de nuestros triggers/procedimientos
  if (err.code === "P0001") {
    const conflictos = [
      "Transición no permitida",
      "ya está en un estado final",
    ];
    const esConflicto = conflictos.some((frase) => (err.message || "").includes(frase));
    return { status: esConflicto ? 409 : 400, body: { error: err.message } };
  }
  // 23514: violación de CHECK constraint
  if (err.code === "23514") {
    return { status: 400, body: { error: "Datos inválidos: violan una regla de negocio." } };
  }
  // 23503: violación de llave foránea
  if (err.code === "23503") {
    return { status: 400, body: { error: "Referencia inválida (recurso relacionado no existe)." } };
  }
  // 23505: violación de unicidad
  if (err.code === "23505") {
    return { status: 409, body: { error: "El recurso ya existe." } };
  }
  return null;
}

module.exports = { pool, query, conTransaccion, mapearErrorDb };
