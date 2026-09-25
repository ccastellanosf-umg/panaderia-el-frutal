// Cliente HTTP compartido: agrega el header Authorization cuando hay token
// en localStorage y normaliza los errores del backend ({error: "..."})
// a un objeto Error con mensaje en español.

const BASE_URLS = {
  auth: import.meta.env.VITE_AUTH_URL || "http://localhost:3001",
  catalogo: import.meta.env.VITE_CATALOGO_URL || "http://localhost:3002",
  pedidos: import.meta.env.VITE_PEDIDOS_URL || "http://localhost:3003",
  pagos: import.meta.env.VITE_PAGOS_URL || "http://localhost:3004",
};

export const TOKEN_KEY = "elfrutal_token";
export const USUARIO_KEY = "elfrutal_usuario";

export function obtenerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_err) {
    return null;
  }
}

export function guardarSesion(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
}

export function limpiarSesion() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
}

export function obtenerUsuario() {
  try {
    const crudo = localStorage.getItem(USUARIO_KEY);
    return crudo ? JSON.parse(crudo) : null;
  } catch (_err) {
    return null;
  }
}

const MENSAJE_GENERICO = "Ocurrió un error de conexión. Intenta de nuevo.";

async function solicitar(servicio, ruta, { method = "GET", body, headers, raw } = {}) {
  const base = BASE_URLS[servicio];
  const token = obtenerToken();
  const cabeceras = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  let respuesta;
  try {
    respuesta = await fetch(`${base}${ruta}`, {
      method,
      headers: cabeceras,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_err) {
    throw new Error(MENSAJE_GENERICO);
  }

  if (raw) {
    if (!respuesta.ok) {
      throw new Error(MENSAJE_GENERICO);
    }
    return respuesta;
  }

  const contentType = respuesta.headers.get("content-type") || "";
  const datos = contentType.includes("application/json") ? await respuesta.json().catch(() => null) : null;

  if (!respuesta.ok) {
    const mensaje = datos && datos.error ? datos.error : MENSAJE_GENERICO;
    const error = new Error(mensaje);
    error.status = respuesta.status;
    error.body = datos;
    throw error;
  }

  return datos;
}

export function crearCliente(servicio) {
  return {
    get: (ruta, opts) => solicitar(servicio, ruta, { ...opts, method: "GET" }),
    post: (ruta, body, opts) => solicitar(servicio, ruta, { ...opts, method: "POST", body }),
    put: (ruta, body, opts) => solicitar(servicio, ruta, { ...opts, method: "PUT", body }),
    patch: (ruta, body, opts) => solicitar(servicio, ruta, { ...opts, method: "PATCH", body }),
  };
}

export { BASE_URLS, solicitar };
