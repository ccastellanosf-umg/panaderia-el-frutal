// src/pagos/lib/seguridad.js
// Endurecimiento HTTP común (copia por servicio: docker build solo
// copia src/<svc>): cabeceras de seguridad (helmet), sin X-Powered-By,
// confianza en el proxy de Azure y CORS con lista de orígenes.
const cors = require("cors");
const helmet = require("helmet");

const ORIGEN_POR_DEFECTO = "http://localhost:5173";

// CORS_ORIGINS: orígenes permitidos separados por comas.
function origenesPermitidos() {
  const lista = (process.env.CORS_ORIGINS || ORIGEN_POR_DEFECTO)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return lista.length ? lista : [ORIGEN_POR_DEFECTO];
}

function configurarSeguridad(app) {
  app.disable("x-powered-by");
  // Azure App Service está detrás de un proxy: así req.ip es la IP real.
  app.set("trust proxy", 1);
  app.use(helmet());
  // Origen no permitido: no se envía Access-Control-Allow-Origin.
  // Sin cabecera Origin (curl, health checks) la petición pasa igual.
  app.use(cors({ origin: origenesPermitidos() }));
}

module.exports = { configurarSeguridad, origenesPermitidos };

