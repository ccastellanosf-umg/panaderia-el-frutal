import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Checkout from "../../src/pages/cliente/Checkout";

const mockUseCart = vi.fn();
vi.mock("../../src/context/CartContext", () => ({
  useCart: () => mockUseCart(),
}));

vi.mock("../../src/api/pedidos", () => ({
  crearPedido: vi.fn(),
}));

describe("Checkout", () => {
  beforeEach(() => {
    mockUseCart.mockReturnValue({
      items: [{ idProducto: 1, nombre: "Pan francés", precio: 5, cantidad: 3 }],
      total: 15,
      vaciar: vi.fn(),
    });
  });

  it("no avanza al paso de entrega si falta la dirección", async () => {
    const usuario = userEvent.setup();
    render(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );

    await usuario.click(screen.getByRole("button", { name: /siguiente/i }));
    // ahora en paso "Entrega": intenta avanzar sin llenar dirección/fecha
    await usuario.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/dirección/i);
  });

  it("avanza por los 3 pasos cuando los datos son válidos", async () => {
    const usuario = userEvent.setup();
    render(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );

    expect(screen.getByText(/pan francés/i)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /siguiente/i }));

    await usuario.type(screen.getByLabelText(/dirección de entrega/i), "Zona 1, Villa Nueva");
    await usuario.type(screen.getByLabelText(/fecha de entrega/i), "2099-01-01");
    await usuario.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByText(/confirmar pedido/i)).toBeInTheDocument();
    expect(screen.getByText(/Zona 1, Villa Nueva/)).toBeInTheDocument();
  });
});
