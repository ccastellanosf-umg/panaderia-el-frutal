import { redondear2 } from "./money";

// Calcula el total del carrito. items: [{ idProducto, nombre, precio, cantidad }]
export function calcularTotal(items) {
  const total = (items || []).reduce(
    (acc, item) => acc + Number(item.precio) * Number(item.cantidad),
    0
  );
  return redondear2(total);
}

export function agregarAlCarrito(items, producto, cantidad = 1) {
  const existente = items.find((i) => i.idProducto === producto.idProducto);
  if (existente) {
    return items.map((i) =>
      i.idProducto === producto.idProducto ? { ...i, cantidad: i.cantidad + cantidad } : i
    );
  }
  return [...items, { ...producto, cantidad }];
}

export function quitarDelCarrito(items, idProducto) {
  return items.filter((i) => i.idProducto !== idProducto);
}

export function actualizarCantidad(items, idProducto, cantidad) {
  if (cantidad < 1) return quitarDelCarrito(items, idProducto);
  return items.map((i) => (i.idProducto === idProducto ? { ...i, cantidad } : i));
}
