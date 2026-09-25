// src/auth/middlewares/verificarToken.js
// Middleware de autorización — RF-20 (control de acceso por rol/área).
// Cada microservicio mantiene su propia copia (docker build solo
// copia src/<svc>). En auth, además valida la lista negra de Redis
// (RF-21 logout) cuando Redis está disponible; si Redis está caído,
// degrada de forma segura (nunca bloquea al usuario por eso).
const jwt = require("jsonwebtoken");

let obtenerClienteConectado = null;
try {
  // Carga perezosa y opcional: solo auth tiene lib/redis.js con
  // soporte de lista negra. Los demás servicios no lo requieren.
  ({ obtenerClienteConectado } = require("../lib/redis"));
} catch (_err) {
  obtenerClienteConectado = null;
}

function verificarToken(rolesPermitidos = [], areasPermitidas = []) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Token no proporcionado." });
    }

    const token = authHeader.split(" ")[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }

    if (obtenerClienteConectado && payload.jti) {
      try {
        const cliente = await obtenerClienteConectado();
        if (cliente) {
          const enLista = await cliente.get(`blacklist:${payload.jti}`);
          if (enLista) {
            return res.status(401).json({ error: "Token inválido o expirado." });
          }
        }
      } catch (_err) {
        // Redis caído: continuar sin bloquear al usuario (degradación segura)
      }
    }

    if (rolesPermitidos.length && !rolesPermitidos.includes(payload.rol)) {
      return res.status(403).json({ error: "No autorizado para este recurso." });
    }

    if (
      areasPermitidas.length &&
      payload.rol === "operador" &&
      !areasPermitidas.includes(payload.area)
    ) {
      return res.status(403).json({ error: "No autorizado para este recurso." });
    }

    req.usuario = payload;
    next();
  };
}

module.exports = verificarToken;
