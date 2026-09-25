import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { crearCliente, guardarSesion, limpiarSesion, obtenerToken } from "../../src/api/client";

function mockFetchOk(body, headers = { "content-type": "application/json" }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] },
    json: async () => body,
  });
}

function mockFetchError(status, body) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  });
}

describe("cliente API", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("agrega el header Authorization cuando hay token guardado", async () => {
    guardarSesion("token-abc", { idUsuario: 1, rol: "cliente" });
    const fetchMock = mockFetchOk({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = crearCliente("catalogo");
    await cliente.get("/productos");

    const [, opciones] = fetchMock.mock.calls[0];
    expect(opciones.headers.Authorization).toBe("Bearer token-abc");
  });

  it("no agrega Authorization si no hay sesión", async () => {
    limpiarSesion();
    const fetchMock = mockFetchOk({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const cliente = crearCliente("catalogo");
    await cliente.get("/productos");

    const [, opciones] = fetchMock.mock.calls[0];
    expect(opciones.headers.Authorization).toBeUndefined();
  });

  it("mapea errores del backend ({error: '...'}) a Error con ese mensaje", async () => {
    vi.stubGlobal("fetch", mockFetchError(401, { error: "Credenciales inválidas." }));

    const cliente = crearCliente("auth");
    await expect(cliente.post("/auth/login", { correo: "a", contrasena: "b" })).rejects.toThrow(
      "Credenciales inválidas."
    );
  });

  it("usa un mensaje genérico si el backend no responde JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const cliente = crearCliente("auth");
    await expect(cliente.get("/auth/me")).rejects.toThrow(/error de conexión/i);
  });

  it("obtenerToken devuelve null si no hay sesión guardada", () => {
    limpiarSesion();
    expect(obtenerToken()).toBeNull();
  });
});
