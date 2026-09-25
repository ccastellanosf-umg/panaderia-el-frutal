import { useEffect, useState } from "react";
import { listarProductos } from "../../api/catalogo";
import { listarProduccion, registrarProduccion } from "../../api/inventario";
import Alerta from "../../components/Alerta";
import SubTabs from "../../components/SubTabs";

const TABS_PRODUCCION = [
  { to: "/produccion/insumos", label: "Insumos" },
  { to: "/produccion/recetas", label: "Recetas" },
  { to: "/produccion/diaria", label: "Producción diaria" },
];

export default function ProduccionDiaria() {
  const [productos, setProductos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [idProducto, setIdProducto] = useState("");
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  function cargar() {
    listarProduccion()
      .then(setRegistros)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    listarProductos()
      .then(setProductos)
      .catch((err) => setError(err.message));
    cargar();
  }, []);

  async function registrar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    if (!idProducto || cantidad === "") return setError("Producto y cantidad son obligatorios.");

    try {
      await registrarProduccion({
        idProducto: Number(idProducto),
        fecha: fecha || undefined,
        cantidadProducida: Number(cantidad),
      });
      setMensaje("Producción registrada.");
      setCantidad("");
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <SubTabs tabs={TABS_PRODUCCION} />
      <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Producción diaria</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <form onSubmit={registrar} className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="productoProd" className="mb-1 block text-sm font-medium text-masa-700">
            Producto
          </label>
          <select id="productoProd" className="input w-48" value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
            <option value="">Selecciona…</option>
            {productos.map((p) => (
              <option key={p.idProducto} value={p.idProducto}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fechaProd" className="mb-1 block text-sm font-medium text-masa-700">
            Fecha
          </label>
          <input id="fechaProd" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cantidadProd" className="mb-1 block text-sm font-medium text-masa-700">
            Cantidad producida
          </label>
          <input
            id="cantidadProd"
            type="number"
            min={0}
            className="input w-32"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Registrar
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-masa-200 text-left text-masa-600">
              <th className="py-2 pr-4">Producto</th>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={`${r.idProducto}-${r.fecha}`} className="border-b border-masa-100">
                <td className="py-2 pr-4">{r.producto}</td>
                <td className="py-2 pr-4">{new Date(r.fecha).toLocaleDateString("es-GT")}</td>
                <td className="py-2 pr-4">{r.cantidadProducida}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
