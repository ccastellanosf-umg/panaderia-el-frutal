import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { crearPedido } from "../../api/pedidos";
import { validarPasoCarrito, validarPasoEntrega } from "../../utils/checkout";
import { formatQ } from "../../utils/money";
import Alerta from "../../components/Alerta";

const PASOS = ["Carrito", "Entrega", "Confirmar"];

export default function Checkout() {
  const { items, total, vaciar } = useCart();
  const [paso, setPaso] = useState(0);
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();

  function siguiente() {
    setError("");
    if (paso === 0) {
      const err = validarPasoCarrito(items);
      if (err) return setError(err);
    }
    if (paso === 1) {
      const err = validarPasoEntrega({ direccionEntrega, fechaEntrega });
      if (err) return setError(err);
    }
    setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  }

  function anterior() {
    setError("");
    setPaso((p) => Math.max(p - 1, 0));
  }

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const payload = {
        items: items.map((i) => ({ idProducto: i.idProducto, cantidad: i.cantidad })),
        direccionEntrega,
        fechaEntrega,
      };
      const pedido = await crearPedido(payload);
      vaciar();
      navegar(`/mis-pedidos/${pedido.idPedido}`, { state: { confirmado: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Finalizar compra</h1>

      <ol className="mb-6 flex items-center gap-2 text-sm">
        {PASOS.map((nombre, i) => (
          <li
            key={nombre}
            className={`rounded-full px-3 py-1 ${
              i === paso ? "bg-masa-600 text-white" : i < paso ? "bg-masa-200 text-masa-800" : "bg-masa-50 text-masa-500"
            }`}
          >
            {i + 1}. {nombre}
          </li>
        ))}
      </ol>

      <div className="mb-4">
        <Alerta tipo="error">{error}</Alerta>
      </div>

      {paso === 0 && (
        <div className="card space-y-2">
          {items.map((item) => (
            <div key={item.idProducto} className="flex justify-between text-sm">
              <span>
                {item.cantidad} × {item.nombre}
              </span>
              <span>{formatQ(item.precio * item.cantidad)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-masa-100 pt-2 font-bold">
            <span>Total</span>
            <span>{formatQ(total)}</span>
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="card space-y-4">
          <div>
            <label htmlFor="direccion" className="mb-1 block text-sm font-medium text-masa-700">
              Dirección de entrega
            </label>
            <input
              id="direccion"
              className="input"
              value={direccionEntrega}
              onChange={(e) => setDireccionEntrega(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fecha" className="mb-1 block text-sm font-medium text-masa-700">
              Fecha de entrega
            </label>
            <input
              id="fecha"
              type="date"
              className="input"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
            />
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="card space-y-2 text-sm">
          <p>
            <strong>Dirección:</strong> {direccionEntrega}
          </p>
          <p>
            <strong>Fecha de entrega:</strong> {fechaEntrega}
          </p>
          <p>
            <strong>Total a pagar:</strong> {formatQ(total)}
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button className="btn-secondary" onClick={anterior} disabled={paso === 0 || enviando}>
          Atrás
        </button>
        {paso < PASOS.length - 1 ? (
          <button className="btn-primary" onClick={siguiente}>
            Siguiente
          </button>
        ) : (
          <button className="btn-primary" onClick={confirmar} disabled={enviando}>
            {enviando ? "Confirmando…" : "Confirmar pedido"}
          </button>
        )}
      </div>
    </div>
  );
}
