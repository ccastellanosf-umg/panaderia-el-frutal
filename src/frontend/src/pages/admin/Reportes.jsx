import { useEffect, useState } from "react";
import { reporteVentas, reporteInventario, sugerenciaProduccion, descargarVentasExcel } from "../../api/reportes";
import { formatQ } from "../../utils/money";
import Alerta from "../../components/Alerta";

export default function Reportes() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ventas, setVentas] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [sugerencias, setSugerencias] = useState([]);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);

  function cargarReportes() {
    setError("");
    Promise.all([reporteVentas(desde, hasta), reporteInventario(desde, hasta), sugerenciaProduccion()])
      .then(([v, i, s]) => {
        setVentas(v);
        setInventario(i);
        setSugerencias(s);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargarReportes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportarExcel() {
    setError("");
    setExportando(true);
    try {
      const blob = await descargarVentasExcel(desde, hasta);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "reporte-ventas.xlsx";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Reportes</h1>
      <Alerta tipo="error">{error}</Alerta>

      <div className="card my-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="desde" className="mb-1 block text-sm font-medium text-masa-700">
            Desde
          </label>
          <input id="desde" type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-sm font-medium text-masa-700">
            Hasta
          </label>
          <input id="hasta" type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button className="btn-secondary" onClick={cargarReportes}>
          Filtrar
        </button>
        <button className="btn-primary" onClick={exportarExcel} disabled={exportando}>
          {exportando ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-masa-800">Ventas por producto</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-masa-200 text-left text-masa-600">
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4">Unidades</th>
                <th className="py-2 pr-4">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {ventas?.porProducto?.map((fila) => (
                <tr key={fila.idProducto} className="border-b border-masa-100">
                  <td className="py-2 pr-4">{fila.nombre}</td>
                  <td className="py-2 pr-4">{fila.unidadesVendidas}</td>
                  <td className="py-2 pr-4">{formatQ(fila.totalVendido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-masa-800">Ventas por canal</h2>
        <div className="flex flex-wrap gap-3">
          {ventas?.porCanal?.map((fila) => (
            <div key={fila.canal} className="card">
              <p className="text-sm text-masa-600">{fila.canal}</p>
              <p className="font-bold text-masa-800">{formatQ(fila.totalVendido)}</p>
              <p className="text-xs text-masa-500">{fila.unidadesVendidas} unidades</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-masa-800">Inventario crítico</h2>
        {inventario?.criticos?.length ? (
          <ul className="space-y-1 text-sm">
            {inventario.criticos.map((i) => (
              <li key={i.idInsumo} className="card">
                {i.nombre}: {i.cantidadDisponible} {i.unidadMedida} (mínimo {i.nivelMinimo})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-masa-600">Sin alertas de inventario en este rango.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-masa-800">Sugerencia de producción</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-masa-200 text-left text-masa-600">
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4">Promedio vendido</th>
                <th className="py-2 pr-4">Cantidad sugerida</th>
              </tr>
            </thead>
            <tbody>
              {sugerencias.map((s) => (
                <tr key={s.idProducto} className="border-b border-masa-100">
                  <td className="py-2 pr-4">{s.nombre}</td>
                  <td className="py-2 pr-4">{s.promedioVendido}</td>
                  <td className="py-2 pr-4">{s.cantidadSugerida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
