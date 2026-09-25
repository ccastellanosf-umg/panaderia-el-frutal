import { crearCliente } from "./client";

const cliente = crearCliente("pagos");

export const listarPlanes = () => cliente.get("/planes");
export const misSuscripciones = () => cliente.get("/suscripciones/mias");
export const crearSuscripcion = (payload) => cliente.post("/suscripciones", payload);
export const pausarSuscripcion = (id) => cliente.patch(`/suscripciones/${id}/pausar`, {});
export const cancelarSuscripcion = (id) => cliente.patch(`/suscripciones/${id}/cancelar`, {});
export const reactivarSuscripcion = (id) => cliente.patch(`/suscripciones/${id}/reactivar`, {});
export const cobrarSuscripcion = (id, simularRespuesta) =>
  cliente.post(`/suscripciones/${id}/cobrar`, simularRespuesta ? { simularRespuesta } : {});
export const listarPagos = () => cliente.get("/pagos");
