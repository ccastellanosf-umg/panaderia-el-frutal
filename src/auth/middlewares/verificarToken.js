// src/auth/middlewares/verificarToken.js
// Middleware de autorización — RF-20 (control de acceso por rol/área)
// y RF-21 (logout). Cada microservicio mantiene su propia copia
// (docker build solo copia src/<svc>); las 4 son idénticas.
// DEF-03: tras validar la firma, rechaza los tokens revocados por
// logout consultando la tabla compartida `tokens_revocados`. Si la
// consulta falla, falla cerrado (503): nunca se acepta un token sin
// poder comprobar que sigue vigente.
const jwt = require("jsonwebtoken");
const { estaRevocado } = require("../lib/tokensRevocados");

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

    // Todo token emitido por auth lleva jti; sin él no se puede revocar.
    if (!payload.jti) {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }

    try {
      if (await estaRevocado(payload.jti)) {
        return res.status(401).json({ error: "Sesión cerrada. Inicie sesión de nuevo." });
      }
    } catch (err) {
      console.error("No se pudo consultar tokens_revocados:", err.message);
      return res.status(503).json({ error: "Servicio no disponible." });
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
