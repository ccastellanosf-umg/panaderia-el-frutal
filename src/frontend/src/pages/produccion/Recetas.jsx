import { useEffect, useState } from "react";
import { listarProductos } from "../../api/catalogo";
import { listarInsumos, obtenerReceta, guardarReceta } from "../../api/inventario";
import Alerta from "../../components/Alerta";
import SubTabs from "../../components/SubTabs";

const TABS_PRODUCCION = [
  { to: "/produccion/insumos", label: "Insumos" },
  { to: "/produccion/recetas", label: "Recetas" },
  { to: "/produccion/diaria", label: "Producción diaria" },
];

export default function Recetas() {
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [idProducto, setIdProducto] = useState("");
  const [cantidades, setCantidades] = useState({});
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    Promise.all([listarProductos(), listarInsumos()])
      .then(([p, i]) => {
        setProductos(p);
        setInsumos(i);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!idProducto) {
      setCantidades({});
      return;
    }
    obtenerReceta(idProducto)
      .then((receta) => {
        const mapa = {};
        receta.forEach((r) => {
          mapa[r.idInsumo] = r.cantidadRequerida;
        });
        setCantidades(mapa);
      })
      .catch((err) => setError(err.message));
  }, [idProducto]);

  function actualizarCantidad(idInsumo, valor) {
    setCantidades((prev) => ({ ...prev, [idInsumo]: valor }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    if (!idProducto) return setError("Selecciona un producto.");

    const receta = Object.entries(cantidades)
      .filter(([, cantidad]) => Number(cantidad) > 0)
      .map(([idInsumo, cantidad]) => ({ idInsumo: Number(idInsumo), cantidadRequerida: Number(cantidad) }));

    try {
      await guardarReceta(idProducto, receta);
      setMensaje("Receta guardada.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <SubTabs tabs={TABS_PRODUCCION} />
      <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Recetas</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <form onSubmit={guardar} className="card space-y-4">
        <div>
          <label htmlFor="producto" className="mb-1 block text-sm font-medium text-masa-700">
            Producto
          </label>
          <select id="producto" className="input" value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
            <option value="">Selecciona un producto…</option>
            {productos.map((p) => (
              <option key={p.idProducto} value={p.idProducto}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {idProducto && (
          <div className="space-y-2">
            {insumos.map((insumo) => (
              <label key={insumo.idInsumo} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {insumo.nombre} ({insumo.unidadMedida})
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input w-28"
                  value={cantidades[insumo.idInsumo] || ""}
                  onChange={(e) => actualizarCantidad(insumo.idInsumo, e.target.value)}
                />
              </label>
            ))}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={!idProducto}>
          Guardar receta
        </button>
      </form>
      </div>
    </div>
  );
}
