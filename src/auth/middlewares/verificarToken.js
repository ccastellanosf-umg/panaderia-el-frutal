// src/auth/middlewares/verificarToken.js
// Middleware de autorización — RF-20 (control de acceso por rol).
// Los demás microservicios importan una copia de este archivo o lo
// consumen como paquete interno compartido.
const jwt = require("jsonwebtoken");

function verificarToken(rolesPermitidos = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Token no proporcionado." });
    }

    const token = authHeader.split(" ")[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (rolesPermitidos.length && !rolesPermitidos.includes(payload.rol)) {
        return res.status(403).json({ error: "No autorizado para este recurso." });
      }
      req.usuario = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }
  };
}

module.exports = verificarToken;
