// Validación de cada paso del checkout (RNF-03: máximo 3 pasos).
export function validarPasoCarrito(items) {
  if (!items || items.length === 0) return "Tu carrito está vacío.";
  return null;
}

export function validarPasoEntrega({ direccionEntrega, fechaEntrega }) {
  if (!direccionEntrega || !direccionEntrega.trim()) {
    return "La dirección de entrega es obligatoria.";
  }
  if (!fechaEntrega) {
    return "La fecha de entrega es obligatoria.";
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(`${fechaEntrega}T00:00:00`);
  if (Number.isNaN(fecha.getTime()) || fecha < hoy) {
    return "La fecha de entrega no puede ser en el pasado.";
  }
  return null;
}

// RF-07/08: el pedido solo puede cancelarse mientras está en estado 'recibido'.
export function puedeCancelarPedido(estado) {
  return estado === "recibido";
}
