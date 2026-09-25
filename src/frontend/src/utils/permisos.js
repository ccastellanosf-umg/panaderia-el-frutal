// Reglas de autorización de rutas. El administrador siempre tiene acceso
// a cualquier pantalla protegida, sin importar los roles/áreas permitidos.
export function puedeAcceder(usuario, rolesPermitidos = [], areasPermitidas = []) {
  if (!usuario) return false;
  if (usuario.rol === "administrador") return true;
  if (rolesPermitidos.length && !rolesPermitidos.includes(usuario.rol)) return false;
  if (usuario.rol === "operador" && areasPermitidas.length) {
    return areasPermitidas.includes(usuario.area);
  }
  return true;
}
