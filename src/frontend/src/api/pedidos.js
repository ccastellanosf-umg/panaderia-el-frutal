import { crearCliente } from "./client";

const cliente = crearCliente("pedidos");

export const crearPedido = (payload) => cliente.post("/pedidos", payload);
export const misPedidos = () => cliente.get("/pedidos/mios");
export const listarPedidos = (estado) => cliente.get(`/pedidos${estado ? `?estado=${estado}` : ""}`);
export const obtenerPedido = (id) => cliente.get(`/pedidos/${id}`);
export const cambiarEstadoPedido = (id, estado) => cliente.patch(`/pedidos/${id}/estado`, { estado });
export const cancelarPedido = (id) => cliente.patch(`/pedidos/${id}/cancelar`, {});

export const ESTADOS_PEDIDO = ["recibido", "en_preparacion", "listo", "entregado", "cancelado"];

export const TRANSICIONES_VALIDAS = {
  recibido: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo"],
  listo: ["entregado"],
  entregado: [],
  cancelado: [],
};

export function etiquetaEstado(estado) {
  const etiquetas = {
    recibido: "Recibido",
    en_preparacion: "En preparación",
    listo: "Listo",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };
  return etiquetas[estado] || estado;
}
