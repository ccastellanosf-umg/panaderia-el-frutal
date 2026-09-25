import { describe, it, expect } from "vitest";
import { validarPasoCarrito, validarPasoEntrega, puedeCancelarPedido } from "../../src/utils/checkout";

describe("validarPasoCarrito", () => {
  it("rechaza un carrito vacío", () => {
    expect(validarPasoCarrito([])).toMatch(/vacío/i);
  });

  it("acepta un carrito con productos", () => {
    expect(validarPasoCarrito([{ idProducto: 1, cantidad: 1 }])).toBeNull();
  });
});

describe("validarPasoEntrega", () => {
  it("exige dirección de entrega", () => {
    expect(validarPasoEntrega({ direccionEntrega: "", fechaEntrega: "2099-01-01" })).toMatch(
      /dirección/i
    );
  });

  it("exige fecha de entrega", () => {
    expect(validarPasoEntrega({ direccionEntrega: "Zona 1", fechaEntrega: "" })).toMatch(/fecha/i);
  });

  it("rechaza fechas en el pasado", () => {
    expect(validarPasoEntrega({ direccionEntrega: "Zona 1", fechaEntrega: "2000-01-01" })).toMatch(
      /pasado/i
    );
  });

  it("acepta dirección y fecha válidas", () => {
    expect(validarPasoEntrega({ direccionEntrega: "Zona 1", fechaEntrega: "2099-01-01" })).toBeNull();
  });
});

describe("puedeCancelarPedido", () => {
  it("permite cancelar solo en estado recibido", () => {
    expect(puedeCancelarPedido("recibido")).toBe(true);
  });

  it("no permite cancelar en otros estados", () => {
    expect(puedeCancelarPedido("en_preparacion")).toBe(false);
    expect(puedeCancelarPedido("listo")).toBe(false);
    expect(puedeCancelarPedido("entregado")).toBe(false);
    expect(puedeCancelarPedido("cancelado")).toBe(false);
  });
});
