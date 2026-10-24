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

// Las contraseñas de la semilla solo sirven contra servicios por http
// (localhost o la red de docker compose en CI, p. ej. http://auth:3001);
// los despliegues (Azure) siempre usan https.
function esLocal(url) {
  return url.startsWith("http://");
}

function credencial(rol, authUrl = process.env.AUTH_URL || "http://localhost:3001") {
  if (!SEMILLA[rol]) throw new Error(`Rol semilla desconocido: ${rol}`);
  const [correo, variable, local] = SEMILLA[rol];
  if (process.env[variable]) return { correo, contrasena: process.env[variable] };
  if (!esLocal(authUrl)) {
    throw new Error(`${variable} es obligatoria contra ${authUrl}: la contraseña de la semilla solo vale en local`);
  }
  return { correo, contrasena: local };
}

module.exports = { credencial };
