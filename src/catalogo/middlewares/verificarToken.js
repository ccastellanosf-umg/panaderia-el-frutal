// src/catalogo/middlewares/verificarToken.js
// Middleware de autorización — RF-20 (control de acceso por rol/área).
// Copia local (docker build solo copia src/<svc>). Ver src/auth para
// la variante con verificación de lista negra (logout).
const jwt = require("jsonwebtoken");

function verificarToken(rolesPermitidos = [], areasPermitidas = []) {
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

      if (
        areasPermitidas.length &&
        payload.rol === "operador" &&
        !areasPermitidas.includes(payload.area)
      ) {
        return res.status(403).json({ error: "No autorizado para este recurso." });
      }

      req.usuario = payload;
      next();
    } catch (_err) {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }
  };
}

module.exports = verificarToken;
