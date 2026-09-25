import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { obtenerPedido, cancelarPedido } from "../../api/pedidos";
import { puedeCancelarPedido } from "../../utils/checkout";
import { formatQ } from "../../utils/money";
import EstadoBadge from "../../components/EstadoBadge";
import Alerta from "../../components/Alerta";

export default function PedidoDetalle() {
  const { id } = useParams();
  const ubicacion = useLocation();
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");
  const [cancelando, setCancelando] = useState(false);

  function cargar() {
    obtenerPedido(id)
      .then(setPedido)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function manejarCancelar() {
    setError("");
    setCancelando(true);
    try {
      const actualizado = await cancelarPedido(id);
      setPedido(actualizado);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelando(false);
    }
  }

  if (error && !pedido) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Alerta tipo="error">{error}</Alerta>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 text-masa-600">Cargando…</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/mis-pedidos" className="text-sm text-masa-600 underline">
        ← Volver a mis pedidos
      </Link>

      {ubicacion.state?.confirmado && (
        <div className="my-3">
          <Alerta tipo="exito">¡Tu pedido fue confirmado!</Alerta>
        </div>
      )}

      <div className="card mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-masa-800">Pedido #{pedido.idPedido}</h1>
          <EstadoBadge estado={pedido.estado} />
        </div>
        <p className="text-sm text-masa-600">
          Fecha: {new Date(pedido.fecha).toLocaleString("es-GT")}
        </p>
        {pedido.direccionEntrega && (
          <p className="text-sm text-masa-600">Entrega: {pedido.direccionEntrega}</p>
        )}

        <div className="divide-y divide-masa-100 border-t border-masa-100">
          {(pedido.items || []).map((item) => (
            <div key={item.idDetalle} className="flex justify-between py-2 text-sm">
              <span>
                {item.cantidad} × {item.nombre}
              </span>
              <span>{formatQ(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between border-t border-masa-100 pt-2 font-bold">
          <span>Total</span>
          <span>{formatQ(pedido.total)}</span>
        </div>

        <Alerta tipo="error">{error}</Alerta>

        {puedeCancelarPedido(pedido.estado) && (
          <button className="btn-danger" onClick={manejarCancelar} disabled={cancelando}>
            {cancelando ? "Cancelando…" : "Cancelar pedido"}
          </button>
        )}
      </div>
    </div>
  );
}
