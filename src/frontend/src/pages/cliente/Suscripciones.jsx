import { useEffect, useState } from "react";
import { listarPlanes } from "../../api/pagos";
import { listarProductos } from "../../api/catalogo";
import { misSuscripciones, crearSuscripcion, pausarSuscripcion, cancelarSuscripcion, reactivarSuscripcion } from "../../api/pagos";
import { formatQ } from "../../utils/money";
import EstadoBadge from "../../components/EstadoBadge";
import Alerta from "../../components/Alerta";

export default function Suscripciones() {
  const [planes, setPlanes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [misSubs, setMisSubs] = useState([]);
  const [idPlan, setIdPlan] = useState("");
  const [surtido, setSurtido] = useState({});
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  function cargarTodo() {
    Promise.all([listarPlanes(), listarProductos(), misSuscripciones()])
      .then(([p, prod, subs]) => {
        setPlanes(p);
        setProductos(prod);
        setMisSubs(subs);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function cambiarCantidadSurtido(idProducto, cantidad) {
    setSurtido((prev) => ({ ...prev, [idProducto]: Number(cantidad) }));
  }

  async function contratar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");

    const surtidoArray = Object.entries(surtido)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([idProducto, cantidad]) => ({ idProducto: Number(idProducto), cantidad }));

    if (!idPlan) return setError("Selecciona un plan.");
    if (surtidoArray.length === 0) return setError("Selecciona al menos un producto para el surtido.");

    setCargando(true);
    try {
      await crearSuscripcion({ idPlan: Number(idPlan), surtido: surtidoArray });
      setMensaje("Suscripción contratada correctamente.");
      setSurtido({});
      setIdPlan("");
      cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function manejarAccion(accion, id) {
    setError("");
    setMensaje("");
    try {
      if (accion === "pausar") await pausarSuscripcion(id);
      if (accion === "cancelar") await cancelarSuscripcion(id);
      if (accion === "reactivar") await reactivarSuscripcion(id);
      cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Suscripciones</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <section className="card mb-6">
        <h2 className="mb-3 font-semibold text-masa-800">Contratar un plan</h2>
        <form onSubmit={contratar} className="space-y-3">
          <div>
            <label htmlFor="plan" className="mb-1 block text-sm font-medium text-masa-700">
              Plan
            </label>
            <select id="plan" className="input" value={idPlan} onChange={(e) => setIdPlan(e.target.value)}>
              <option value="">Selecciona un plan…</option>
              {planes.map((plan) => (
                <option key={plan.idPlan} value={plan.idPlan}>
                  {plan.nombre} — {plan.frecuencia} — {formatQ(plan.precio)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-masa-700">Elige tu surtido</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {productos.map((producto) => (
                <label key={producto.idProducto} className="flex items-center justify-between gap-2 text-sm">
                  <span>{producto.nombre}</span>
                  <input
                    type="number"
                    min={0}
                    className="input w-20"
                    value={surtido[producto.idProducto] || ""}
                    onChange={(e) => cambiarCantidadSurtido(producto.idProducto, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? "Contratando…" : "Contratar suscripción"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-masa-800">Mis suscripciones</h2>
        {misSubs.length === 0 && <p className="text-sm text-masa-600">No tienes suscripciones activas.</p>}
        <div className="space-y-3">
          {misSubs.map((sub) => (
            <div key={sub.idSuscripcion} className="card">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium text-masa-800">
                  {sub.planNombre} — {formatQ(sub.precio)} / {sub.frecuencia}
                </p>
                <EstadoBadge estado={sub.estado} />
              </div>
              <ul className="mb-3 text-sm text-masa-600">
                {sub.surtido.map((s) => (
                  <li key={s.idProducto}>
                    {s.cantidad} × {s.nombre}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                {sub.estado === "activa" && (
                  <button className="btn-secondary" onClick={() => manejarAccion("pausar", sub.idSuscripcion)}>
                    Pausar
                  </button>
                )}
                {sub.estado !== "cancelada" && (
                  <button className="btn-danger" onClick={() => manejarAccion("cancelar", sub.idSuscripcion)}>
                    Cancelar
                  </button>
                )}
                {sub.estado === "pausada" && (
                  <button className="btn-primary" onClick={() => manejarAccion("reactivar", sub.idSuscripcion)}>
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
