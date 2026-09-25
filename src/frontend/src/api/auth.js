import { crearCliente, guardarSesion, limpiarSesion } from "./client";

const cliente = crearCliente("auth");

export async function login(correo, contrasena) {
  const datos = await cliente.post("/auth/login", { correo, contrasena });
  guardarSesion(datos.token, datos.usuario);
  return datos.usuario;
}

export async function registro({ nombre, correo, telefono, contrasena }) {
  return cliente.post("/auth/registro", { nombre, correo, telefono, contrasena });
}

export async function logout() {
  try {
    await cliente.post("/auth/logout", {});
  } finally {
    limpiarSesion();
  }
}

export async function obtenerPerfil() {
  const { usuario } = await cliente.get("/auth/me");
  return usuario;
}
