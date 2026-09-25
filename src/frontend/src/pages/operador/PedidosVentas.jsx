import { useEffect, useState } from "react";
import { listarPedidos, cambiarEstadoPedido, ESTADOS_PEDIDO } from "../../api/pedidos";
import { formatQ } from "../../utils/money";
import EstadoBadge from "../../components/EstadoBadge";
import Alerta from "../../components/Alerta";

export default function PedidosVentas() {
  const [pedidos, setPedidos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [seleccion, setSeleccion] = useState({});
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  function cargar() {
    setError("");
    listarPedidos(filtroEstado || undefined)
      .then(setPedidos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  function elegirEstado(idPedido, estado) {
    setSeleccion((prev) => ({ ...prev, [idPedido]: estado }));
  }

  async function aplicarEstado(idPedido) {
    setError("");
    setMensaje("");
    const nuevoEstado = seleccion[idPedido];
    if (!nuevoEstado) return;
    try {
      await cambiarEstadoPedido(idPedido, nuevoEstado);
      setMensaje(`Pedido #${idPedido} actualizado a "${nuevoEstado}".`);
      cargar();
    } catch (err) {
      // CP-17/18: el backend responde 409 ante transiciones inválidas (RN-04)
      setError(`Pedido #${idPedido}: ${err.message}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Pedidos (ventas)</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <div className="mb-4">
        <label htmlFor="filtroEstado" className="mb-1 block text-sm font-medium text-masa-700">
          Filtrar por estado
        </label>
        <select
          id="filtroEstado"
          className="input w-56"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos</option>
          {ESTADOS_PEDIDO.map((estado) => (
            <option key={estado} value={estado}>
              {estado}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {pedidos.map((pedido) => (
          <div key={pedido.idPedido} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-masa-800">
                Pedido #{pedido.idPedido} — {formatQ(pedido.total)}
              </p>
              <p className="text-sm text-masa-600">
                Cliente #{pedido.idCliente} · {new Date(pedido.fecha).toLocaleDateString("es-GT")}
              </p>
            </div>
            <EstadoBadge estado={pedido.estado} />
            <div className="flex items-center gap-2">
              {/* Selector con todos los estados: permite intentar una transición
                  inválida a propósito (demo CP-17) y ver el error 409 del backend. */}
              <select
                className="input w-44"
                value={seleccion[pedido.idPedido] || ""}
                onChange={(e) => elegirEstado(pedido.idPedido, e.target.value)}
                aria-label={`Nuevo estado para el pedido ${pedido.idPedido}`}
              >
                <option value="">Cambiar a…</option>
                {ESTADOS_PEDIDO.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
              <button className="btn-primary" onClick={() => aplicarEstado(pedido.idPedido)}>
                Aplicar
              </button>
            </div>
          </div>
        ))}
        {pedidos.length === 0 && <p className="text-sm text-masa-600">No hay pedidos con ese filtro.</p>}
      </div>
    </div>
  );
}
