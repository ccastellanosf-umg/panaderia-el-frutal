import { useEffect, useState } from "react";
import { listarPagos, cobrarSuscripcion } from "../../api/pagos";
import { formatQ } from "../../utils/money";
import EstadoBadge from "../../components/EstadoBadge";
import Alerta from "../../components/Alerta";

export default function SuscripcionesPagos() {
  const [pagos, setPagos] = useState([]);
  const [idSuscripcion, setIdSuscripcion] = useState("");
  const [simular, setSimular] = useState("aprobado");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  function cargar() {
    listarPagos()
      .then(setPagos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cobrar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    if (!idSuscripcion) return setError("Ingresa el id de la suscripción a cobrar.");

    setCargando(true);
    try {
      const { resultado } = await cobrarSuscripcion(Number(idSuscripcion), simular);
      setMensaje(`Cobro procesado: ${resultado}.`);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Suscripciones y pagos</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <form onSubmit={cobrar} className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="idSuscripcion" className="mb-1 block text-sm font-medium text-masa-700">
            ID de suscripción
          </label>
          <input
            id="idSuscripcion"
            className="input w-40"
            value={idSuscripcion}
            onChange={(e) => setIdSuscripcion(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="simular" className="mb-1 block text-sm font-medium text-masa-700">
            Simular resultado (RF-15)
          </label>
          <select id="simular" className="input w-48" value={simular} onChange={(e) => setSimular(e.target.value)}>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={cargando}>
          {cargando ? "Cobrando…" : "Cobrar"}
        </button>
      </form>

      <h2 className="mb-2 font-semibold text-masa-800">Historial de pagos</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-masa-200 text-left text-masa-600">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Suscripción</th>
              <th className="py-2 pr-4">Monto</th>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.idPago} className="border-b border-masa-100">
                <td className="py-2 pr-4">{pago.idPago}</td>
                <td className="py-2 pr-4">{pago.idSuscripcion ?? pago.idPedido ?? "—"}</td>
                <td className="py-2 pr-4">{formatQ(pago.monto)}</td>
                <td className="py-2 pr-4">{new Date(pago.fecha).toLocaleDateString("es-GT")}</td>
                <td className="py-2 pr-4">
                  <EstadoBadge estado={pago.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
