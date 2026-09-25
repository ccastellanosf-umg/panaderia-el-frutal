import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { agregarAlCarrito, quitarDelCarrito, actualizarCantidad, calcularTotal } from "../utils/cart";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const agregar = useCallback((producto, cantidad = 1) => {
    setItems((prev) => agregarAlCarrito(prev, producto, cantidad));
  }, []);

  const quitar = useCallback((idProducto) => {
    setItems((prev) => quitarDelCarrito(prev, idProducto));
  }, []);

  const actualizar = useCallback((idProducto, cantidad) => {
    setItems((prev) => actualizarCantidad(prev, idProducto, cantidad));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  const valor = useMemo(
    () => ({
      items,
      total: calcularTotal(items),
      agregar,
      quitar,
      actualizar,
      vaciar,
    }),
    [items, agregar, quitar, actualizar, vaciar]
  );

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>;
}

export function useCart() {
  const contexto = useContext(CartContext);
  if (!contexto) throw new Error("useCart debe usarse dentro de CartProvider");
  return contexto;
}
