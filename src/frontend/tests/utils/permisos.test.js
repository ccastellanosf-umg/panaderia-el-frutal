import { describe, it, expect } from "vitest";
import { puedeAcceder } from "../../src/utils/permisos";

describe("puedeAcceder", () => {
  it("niega el acceso si no hay usuario", () => {
    expect(puedeAcceder(null, ["cliente"])).toBe(false);
  });

  it("el administrador accede a cualquier pantalla protegida", () => {
    const admin = { rol: "administrador" };
    expect(puedeAcceder(admin, ["cliente"])).toBe(true);
    expect(puedeAcceder(admin, ["operador"], ["produccion"])).toBe(true);
  });

  it("permite a un cliente entrar a rutas de cliente", () => {
    const cliente = { rol: "cliente" };
    expect(puedeAcceder(cliente, ["cliente"])).toBe(true);
  });

  it("niega a un cliente entrar a rutas de operador", () => {
    const cliente = { rol: "cliente" };
    expect(puedeAcceder(cliente, ["operador"])).toBe(false);
  });

  it("filtra operadores por área", () => {
    const ventas = { rol: "operador", area: "ventas" };
    const produccion = { rol: "operador", area: "produccion" };
    expect(puedeAcceder(ventas, ["operador"], ["ventas"])).toBe(true);
    expect(puedeAcceder(produccion, ["operador"], ["ventas"])).toBe(false);
  });
});
