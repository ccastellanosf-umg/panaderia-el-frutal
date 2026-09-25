import { crearCliente } from "./client";

const cliente = crearCliente("pedidos");

export const listarInsumos = () => cliente.get("/inventario/insumos");
export const crearInsumo = (insumo) => cliente.post("/inventario/insumos", insumo);
export const actualizarInsumo = (id, cambios) => cliente.patch(`/inventario/insumos/${id}`, cambios);
export const listarAlertas = () => cliente.get("/inventario/alertas");
export const obtenerReceta = (idProducto) => cliente.get(`/inventario/recetas/${idProducto}`);
export const guardarReceta = (idProducto, receta) =>
  cliente.put(`/inventario/recetas/${idProducto}`, { receta });
export const listarProduccion = (desde, hasta) => {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const query = params.toString();
  return cliente.get(`/inventario/produccion${query ? `?${query}` : ""}`);
};
export const registrarProduccion = (payload) => cliente.post("/inventario/produccion", payload);
