import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { misPedidos } from "../../api/pedidos";
import { formatQ } from "../../utils/money";
import EstadoBadge from "../../components/EstadoBadge";
import Alerta from "../../components/Alerta";

export default function MisPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    misPedidos()
      .then(setPedidos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Mis pedidos</h1>
      <Alerta tipo="error">{error}</Alerta>

      {cargando && <p className="text-masa-600">Cargando…</p>}
      {!cargando && pedidos.length === 0 && !error && (
        <p className="text-masa-600">Todavía no tienes pedidos.</p>
      )}

      <div className="space-y-3">
        {pedidos.map((pedido) => (
          <Link
            key={pedido.idPedido}
            to={`/mis-pedidos/${pedido.idPedido}`}
            className="card flex items-center justify-between hover:border-masa-300"
          >
            <div>
              <p className="font-medium text-masa-800">Pedido #{pedido.idPedido}</p>
              <p className="text-sm text-masa-600">{new Date(pedido.fecha).toLocaleDateString("es-GT")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatQ(pedido.total)}</span>
              <EstadoBadge estado={pedido.estado} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
