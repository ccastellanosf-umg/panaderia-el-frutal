import { crearCliente, BASE_URLS, solicitar } from "./client";

const cliente = crearCliente("pedidos");

function conRango(base, desde, hasta) {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
}

export const reporteVentas = (desde, hasta) => cliente.get(conRango("/reportes/ventas", desde, hasta));
export const reporteInventario = (desde, hasta) =>
  cliente.get(conRango("/reportes/inventario", desde, hasta));
export const sugerenciaProduccion = () => cliente.get("/reportes/sugerencia-produccion");

export async function descargarVentasExcel(desde, hasta) {
  const respuesta = await solicitar("pedidos", conRango("/reportes/ventas/excel", desde, hasta), {
    raw: true,
  });
  return respuesta.blob();
}

export { BASE_URLS };
