import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { formatQ } from "../../utils/money";

export default function Carrito() {
  const { items, total, actualizar, quitar } = useCart();
  const navegar = useNavigate();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="mb-4 text-masa-600">Tu carrito está vacío.</p>
        <Link to="/" className="btn-primary">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Tu carrito</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.idProducto} className="card flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="font-medium text-masa-800">{item.nombre}</p>
              <p className="text-sm text-masa-600">{formatQ(item.precio)} c/u</p>
            </div>
            <input
              type="number"
              min={1}
              className="input w-20"
              value={item.cantidad}
              aria-label={`Cantidad de ${item.nombre}`}
              onChange={(e) => actualizar(item.idProducto, Number(e.target.value))}
            />
            <span className="w-24 text-right font-semibold">{formatQ(item.precio * item.cantidad)}</span>
            <button className="btn-secondary" onClick={() => quitar(item.idProducto)}>
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div className="card mt-4 flex items-center justify-between">
        <span className="text-lg font-bold text-masa-800">Total: {formatQ(total)}</span>
        <button className="btn-primary" onClick={() => navegar("/checkout")}>
          Continuar
        </button>
      </div>
    </div>
  );
}
