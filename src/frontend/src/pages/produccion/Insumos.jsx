import { useEffect, useState } from "react";
import { listarInsumos, crearInsumo, actualizarInsumo, listarAlertas } from "../../api/inventario";
import Alerta from "../../components/Alerta";
import SubTabs from "../../components/SubTabs";

const TABS_PRODUCCION = [
  { to: "/produccion/insumos", label: "Insumos" },
  { to: "/produccion/recetas", label: "Recetas" },
  { to: "/produccion/diaria", label: "Producción diaria" },
];

const FORM_VACIO = { nombre: "", cantidadDisponible: "", nivelMinimo: "", unidadMedida: "" };

export default function Insumos() {
  const [insumos, setInsumos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [restock, setRestock] = useState({});
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  function cargar() {
    setError("");
    Promise.all([listarInsumos(), listarAlertas()])
      .then(([i, a]) => {
        setInsumos(i);
        setAlertas(a);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
  }, []);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function crear(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    try {
      await crearInsumo({
        nombre: form.nombre,
        unidadMedida: form.unidadMedida,
        cantidadDisponible: Number(form.cantidadDisponible || 0),
        nivelMinimo: Number(form.nivelMinimo || 0),
      });
      setMensaje("Insumo creado.");
      setForm(FORM_VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function aplicarRestock(idInsumo) {
    setError("");
    setMensaje("");
    const cantidad = restock[idInsumo];
    if (!cantidad) return;
    try {
      await actualizarInsumo(idInsumo, { cantidadDisponible: Number(cantidad) });
      setMensaje(`Existencias de insumo #${idInsumo} actualizadas.`);
      setRestock((prev) => ({ ...prev, [idInsumo]: "" }));
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <SubTabs tabs={TABS_PRODUCCION} />
      <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Insumos</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      {alertas.length > 0 && (
        <section className="card mb-6 border-red-200 bg-red-50">
          <h2 className="mb-2 font-semibold text-red-800">Alertas de inventario crítico</h2>
          <ul className="space-y-1 text-sm text-red-700">
            {alertas.map((a) => (
              <li key={a.idInsumo}>
                {a.nombre}: {a.cantidadDisponible} {a.unidadMedida} (mínimo {a.nivelMinimo})
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={crear} className="card mb-6 space-y-3">
        <h2 className="font-semibold text-masa-800">Nuevo insumo</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nombreInsumo" className="mb-1 block text-sm font-medium text-masa-700">
              Nombre
            </label>
            <input
              id="nombreInsumo"
              className="input"
              value={form.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="unidadMedida" className="mb-1 block text-sm font-medium text-masa-700">
              Unidad de medida
            </label>
            <input
              id="unidadMedida"
              className="input"
              value={form.unidadMedida}
              onChange={(e) => actualizarCampo("unidadMedida", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cantidadDisponible" className="mb-1 block text-sm font-medium text-masa-700">
              Cantidad disponible
            </label>
            <input
              id="cantidadDisponible"
              type="number"
              min={0}
              className="input"
              value={form.cantidadDisponible}
              onChange={(e) => actualizarCampo("cantidadDisponible", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="nivelMinimo" className="mb-1 block text-sm font-medium text-masa-700">
              Nivel mínimo
            </label>
            <input
              id="nivelMinimo"
              type="number"
              min={0}
              className="input"
              value={form.nivelMinimo}
              onChange={(e) => actualizarCampo("nivelMinimo", e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary">
          Crear insumo
        </button>
      </form>

      <section>
        <h2 className="mb-2 font-semibold text-masa-800">Existencias</h2>
        <div className="space-y-2">
          {insumos.map((insumo) => (
            <div key={insumo.idInsumo} className="card flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-masa-800">{insumo.nombre}</p>
                <p className="text-sm text-masa-600">
                  {insumo.cantidadDisponible} {insumo.unidadMedida} (mínimo {insumo.nivelMinimo})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="input w-28"
                  placeholder="Restock"
                  aria-label={`Nueva cantidad para ${insumo.nombre}`}
                  value={restock[insumo.idInsumo] || ""}
                  onChange={(e) => setRestock((prev) => ({ ...prev, [insumo.idInsumo]: e.target.value }))}
                />
                <button className="btn-secondary" onClick={() => aplicarRestock(insumo.idInsumo)}>
                  Actualizar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
