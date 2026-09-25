import { describe, it, expect } from "vitest";
import { calcularTotal, agregarAlCarrito, quitarDelCarrito, actualizarCantidad } from "../../src/utils/cart";

describe("calcularTotal", () => {
  it("redondea correctamente 3 x 12.33 a 36.99", () => {
    const items = [{ idProducto: 1, precio: 12.33, cantidad: 3 }];
    expect(calcularTotal(items)).toBe(36.99);
  });

  it("suma varios productos", () => {
    const items = [
      { idProducto: 1, precio: 10, cantidad: 2 },
      { idProducto: 2, precio: 5.5, cantidad: 1 },
    ];
    expect(calcularTotal(items)).toBe(25.5);
  });

  it("devuelve 0 para carrito vacío", () => {
    expect(calcularTotal([])).toBe(0);
  });
});

describe("agregarAlCarrito", () => {
  it("agrega un producto nuevo con cantidad 1", () => {
    const resultado = agregarAlCarrito([], { idProducto: 1, nombre: "Pan", precio: 5 });
    expect(resultado).toEqual([{ idProducto: 1, nombre: "Pan", precio: 5, cantidad: 1 }]);
  });

  it("incrementa la cantidad si el producto ya existe", () => {
    const inicial = [{ idProducto: 1, nombre: "Pan", precio: 5, cantidad: 1 }];
    const resultado = agregarAlCarrito(inicial, { idProducto: 1, nombre: "Pan", precio: 5 });
    expect(resultado[0].cantidad).toBe(2);
  });
});

describe("quitarDelCarrito", () => {
  it("elimina el producto indicado", () => {
    const inicial = [
      { idProducto: 1, cantidad: 1 },
      { idProducto: 2, cantidad: 1 },
    ];
    expect(quitarDelCarrito(inicial, 1)).toEqual([{ idProducto: 2, cantidad: 1 }]);
  });
});

describe("actualizarCantidad", () => {
  it("actualiza la cantidad de un producto", () => {
    const inicial = [{ idProducto: 1, cantidad: 1 }];
    expect(actualizarCantidad(inicial, 1, 4)[0].cantidad).toBe(4);
  });

  it("elimina el producto si la cantidad es menor a 1", () => {
    const inicial = [{ idProducto: 1, cantidad: 1 }];
    expect(actualizarCantidad(inicial, 1, 0)).toEqual([]);
  });
});
