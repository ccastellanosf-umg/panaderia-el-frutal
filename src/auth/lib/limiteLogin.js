// src/auth/lib/limiteLogin.js
// Protección contra fuerza bruta en POST /auth/login: máximo 5
// intentos FALLIDOS por ventana de 15 minutos. La llave es IP + correo
// (en minúsculas) para que probar una cuenta no bloquee a las demás.
// Los inicios de sesión exitosos no cuentan.
const rateLimit = require("express-rate-limit");

// Azure App Service agrega el puerto de origen a X-Forwarded-For
// ("203.0.113.7:54321"); sin quitarlo, cada intento tendría una llave
// distinta y el límite nunca se alcanzaría.
function ipSinPuerto(ip) {
  const valor = String(ip || "");
  const ipv6ConPuerto = valor.match(/^\[(.+)\](?::\d+)?$/);
  if (ipv6ConPuerto) return ipv6ConPuerto[1];
  const ipv4ConPuerto = valor.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4ConPuerto) return ipv4ConPuerto[1];
  return valor;
}

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const correo = String((req.body && req.body.correo) || "").trim().toLowerCase();
    return `${ipSinPuerto(req.ip)}|${correo}`;
  },
  // La IP con puerto que llega de Azure es esperada: se normaliza arriba.
  validate: { ip: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.",
    });
  },
});

module.exports = { limiteLogin, ipSinPuerto };
