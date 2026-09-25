import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RouteGuard from "../../src/components/RouteGuard";

const mockUseAuth = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderConRuta(inicial) {
  return render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/login" element={<div>Pantalla de login</div>} />
        <Route path="/" element={<div>Inicio público</div>} />
        <Route
          path="/admin"
          element={
            <RouteGuard roles={["administrador"]}>
              <div>Panel admin</div>
            </RouteGuard>
          }
        />
        <Route
          path="/produccion"
          element={
            <RouteGuard roles={["operador"]} areas={["produccion"]}>
              <div>Panel producción</div>
            </RouteGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RouteGuard", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("redirige a /login si no hay sesión", () => {
    mockUseAuth.mockReturnValue({ usuario: null, autenticado: false });
    renderConRuta("/admin");
    expect(screen.getByText("Pantalla de login")).toBeInTheDocument();
  });

  it("redirige a / si el rol no tiene permiso", () => {
    mockUseAuth.mockReturnValue({
      usuario: { rol: "cliente" },
      autenticado: true,
    });
    renderConRuta("/admin");
    expect(screen.getByText("Inicio público")).toBeInTheDocument();
  });

  it("permite el acceso cuando el rol coincide", () => {
    mockUseAuth.mockReturnValue({
      usuario: { rol: "administrador" },
      autenticado: true,
    });
    renderConRuta("/admin");
    expect(screen.getByText("Panel admin")).toBeInTheDocument();
  });

  it("respeta el filtro de área para operadores", () => {
    mockUseAuth.mockReturnValue({
      usuario: { rol: "operador", area: "ventas" },
      autenticado: true,
    });
    renderConRuta("/produccion");
    expect(screen.getByText("Inicio público")).toBeInTheDocument();
  });
});
