import { useEffect, useState } from "react";
import { listarProductos } from "../api/catalogo";
import { useCart } from "../context/CartContext";
import { formatQ } from "../utils/money";
import Alerta from "../components/Alerta";

export default function Catalogo() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [agregado, setAgregado] = useState("");
  const { agregar } = useCart();

  useEffect(() => {
    listarProductos()
      .then(setProductos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  function manejarAgregar(producto) {
    agregar(producto, 1);
    setAgregado(`"${producto.nombre}" se agregó al carrito.`);
    setTimeout(() => setAgregado(""), 2000);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-masa-800">Nuestro catálogo</h1>
      <p className="mb-4 text-sm text-masa-600">Pan y repostería recién horneados en Villa Nueva.</p>

      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{agregado}</Alerta>
      </div>

      {cargando && <p className="text-masa-600">Cargando productos…</p>}

      {!cargando && productos.length === 0 && !error && (
        <p className="text-masa-600">No hay productos disponibles por el momento.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {productos.map((producto) => (
          <article key={producto.idProducto} className="card flex flex-col">
            <div className="mb-3 aspect-video w-full overflow-hidden rounded-md bg-trigo-100">
              {producto.fotoUrl ? (
                <img
                  src={producto.fotoUrl}
                  alt={producto.nombre}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl">🍞</div>
              )}
            </div>
            <h2 className="font-semibold text-masa-800">{producto.nombre}</h2>
            <p className="mb-3 flex-1 text-sm text-masa-600">{producto.descripcion}</p>
            <div className="flex items-center justify-between">
              <span className="font-bold text-masa-700">{formatQ(producto.precio)}</span>
              <button className="btn-primary" onClick={() => manejarAgregar(producto)}>
                Agregar
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
