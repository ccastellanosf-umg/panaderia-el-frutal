import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PedidoDetalle from "../../src/pages/cliente/PedidoDetalle";

const mockObtenerPedido = vi.fn();
vi.mock("../../src/api/pedidos", () => ({
  obtenerPedido: (...args) => mockObtenerPedido(...args),
  cancelarPedido: vi.fn(),
}));

function renderConEstado(estado) {
  mockObtenerPedido.mockResolvedValue({
    idPedido: 1,
    fecha: new Date().toISOString(),
    estado,
    total: 10,
    items: [],
  });

  return render(
    <MemoryRouter initialEntries={["/mis-pedidos/1"]}>
      <Routes>
        <Route path="/mis-pedidos/:id" element={<PedidoDetalle />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PedidoDetalle - visibilidad del botón cancelar", () => {
  beforeEach(() => {
    mockObtenerPedido.mockReset();
  });

  it("muestra el botón cancelar cuando el estado es 'recibido'", async () => {
    renderConEstado("recibido");
    expect(await screen.findByRole("button", { name: /cancelar pedido/i })).toBeInTheDocument();
  });

  it("no muestra el botón cancelar cuando el estado es 'en_preparacion'", async () => {
    renderConEstado("en_preparacion");
    await screen.findByText(/Pedido #1/i);
    expect(screen.queryByRole("button", { name: /cancelar pedido/i })).not.toBeInTheDocument();
  });

  it("no muestra el botón cancelar cuando el estado es 'entregado'", async () => {
    renderConEstado("entregado");
    await screen.findByText(/Pedido #1/i);
    expect(screen.queryByRole("button", { name: /cancelar pedido/i })).not.toBeInTheDocument();
  });
});
