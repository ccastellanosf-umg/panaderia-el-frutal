import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const linkClase = ({ isActive }) =>
  `px-3 py-2 text-sm rounded-md ${isActive ? "bg-masa-100 text-masa-800 font-semibold" : "text-masa-700 hover:bg-masa-50"}`;

export default function Navbar() {
  const { usuario, autenticado, logout } = useAuth();
  const { items } = useCart();
  const navegar = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);

  async function cerrarSesion() {
    await logout();
    navegar("/login");
  }

  const cantidadCarrito = items.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <header className="sticky top-0 z-10 border-b border-masa-100 bg-trigo-50/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link to="/" className="font-display text-xl font-bold text-masa-800">
          🥖 El Frutal
        </Link>

        <button
          className="btn-secondary sm:hidden"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label="Abrir menú"
        >
          Menú
        </button>

        <div className={`${menuAbierto ? "flex" : "hidden"} w-full flex-wrap items-center gap-1 sm:flex sm:w-auto`}>
          <NavLink to="/" className={linkClase} end>
            Catálogo
          </NavLink>

          {autenticado && usuario.rol === "cliente" && (
            <>
              <NavLink to="/mis-pedidos" className={linkClase}>
                Mis pedidos
              </NavLink>
              <NavLink to="/suscripciones" className={linkClase}>
                Suscripciones
              </NavLink>
              <NavLink to="/carrito" className={linkClase}>
                Carrito {cantidadCarrito > 0 && `(${cantidadCarrito})`}
              </NavLink>
            </>
          )}

          {autenticado && (usuario.rol === "administrador" || (usuario.rol === "operador" && usuario.area === "ventas")) && (
            <NavLink to="/ventas/pedidos" className={linkClase}>
              Pedidos (ventas)
            </NavLink>
          )}

          {autenticado &&
            (usuario.rol === "administrador" || (usuario.rol === "operador" && usuario.area === "produccion")) && (
              <NavLink to="/produccion/insumos" className={linkClase}>
                Insumos
              </NavLink>
            )}

          {autenticado && usuario.rol === "administrador" && (
            <>
              <NavLink to="/admin/productos" className={linkClase}>
                Productos
              </NavLink>
              <NavLink to="/admin/suscripciones" className={linkClase}>
                Suscripciones/Pagos
              </NavLink>
              <NavLink to="/admin/reportes" className={linkClase}>
                Reportes
              </NavLink>
            </>
          )}

          {autenticado ? (
            <div className="ml-auto flex items-center gap-2 pl-2">
              <span className="text-sm text-masa-600">{usuario.nombre}</span>
              <button className="btn-secondary" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2 pl-2">
              <NavLink to="/login" className={linkClase}>
                Iniciar sesión
              </NavLink>
              <NavLink to="/registro" className={linkClase}>
                Crear cuenta
              </NavLink>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
