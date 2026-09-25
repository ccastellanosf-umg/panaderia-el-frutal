import { crearCliente } from "./client";

const cliente = crearCliente("catalogo");

export const listarProductos = () => cliente.get("/productos");
export const listarProductosTodos = () => cliente.get("/productos/todos");
export const crearProducto = (producto) => cliente.post("/productos", producto);
export const actualizarProducto = (id, producto) => cliente.put(`/productos/${id}`, producto);
export const cambiarDisponibilidad = (id, disponibilidad) =>
  cliente.patch(`/productos/${id}/disponibilidad`, { disponibilidad });
