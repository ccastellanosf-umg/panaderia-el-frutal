// tests/e2e/credenciales.js
// Credenciales de los usuarios semilla. Por defecto son las de
// db/02_seed.sql (entorno local); en Azure las contraseñas son otras y
// se pasan con SEED_<ROL>_PASSWORD (ver scripts/e2e-azure.sh).
const SEMILLA = {
  admin: ["admin@elfrutal.com", "SEED_ADMIN_PASSWORD", "Admin1234"],
  ventas: ["ventas@elfrutal.com", "SEED_VENTAS_PASSWORD", "Ventas1234"],
  produccion: ["produccion@elfrutal.com", "SEED_PRODUCCION_PASSWORD", "Produccion1234"],
  cliente: ["cliente@elfrutal.com", "SEED_CLIENTE_PASSWORD", "Cliente1234"],
};

function credencial(rol) {
  const [correo, variable, local] = SEMILLA[rol];
  return { correo, contrasena: process.env[variable] || local };
}

module.exports = { credencial };
