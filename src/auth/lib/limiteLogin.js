// src/auth/lib/limiteLogin.js
// Protección contra fuerza bruta en POST /auth/login: máximo 5
// intentos FALLIDOS por ventana de 15 minutos. La llave es IP + correo
// (en minúsculas) para que probar una cuenta no bloquee a las demás.
// Los inicios de sesión exitosos no cuentan.
const rateLimit = require("express-rate-limit");

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const correo = String((req.body && req.body.correo) || "").trim().toLowerCase();
    return `${req.ip}|${correo}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.",
    });
  },
});

module.exports = { limiteLogin };
