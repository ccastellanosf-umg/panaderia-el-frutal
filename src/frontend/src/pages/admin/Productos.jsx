import { useEffect, useState } from "react";
import { listarProductosTodos, crearProducto, actualizarProducto, cambiarDisponibilidad } from "../../api/catalogo";
import { formatQ } from "../../utils/money";
import Alerta from "../../components/Alerta";

const FORM_VACIO = { nombre: "", descripcion: "", precio: "", fotoUrl: "" };

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState(null);
  const [errorPrecio, setErrorPrecio] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  function cargar() {
    listarProductosTodos()
      .then(setProductos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
  }, []);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function editar(producto) {
    setEditando(producto.idProducto);
    setForm({
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: String(producto.precio),
      fotoUrl: producto.fotoUrl || "",
    });
  }

  function cancelarEdicion() {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrorPrecio("");
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    setErrorPrecio("");

    const precioNum = Number(form.precio);
    if (form.precio === "" || Number.isNaN(precioNum) || precioNum < 0) {
      setErrorPrecio("El precio debe ser un número mayor o igual a 0.");
      return;
    }

    const payload = { ...form, precio: precioNum };
    try {
      if (editando) {
        await actualizarProducto(editando, payload);
        setMensaje("Producto actualizado.");
      } else {
        await crearProducto(payload);
        setMensaje("Producto creado.");
      }
      cancelarEdicion();
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function alternarDisponibilidad(producto) {
    setError("");
    try {
      await cambiarDisponibilidad(producto.idProducto, !producto.disponibilidad);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-masa-800">Productos</h1>
      <div className="mb-4 space-y-2">
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{mensaje}</Alerta>
      </div>

      <form onSubmit={guardar} className="card mb-6 space-y-3">
        <h2 className="font-semibold text-masa-800">{editando ? "Editar producto" : "Nuevo producto"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-masa-700">
              Nombre
            </label>
            <input
              id="nombre"
              className="input"
              required
              value={form.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="precio" className="mb-1 block text-sm font-medium text-masa-700">
              Precio (Q)
            </label>
            <input
              id="precio"
              type="number"
              step="0.01"
              className="input"
              value={form.precio}
              onChange={(e) => actualizarCampo("precio", e.target.value)}
            />
            {errorPrecio && <p className="mt-1 text-xs text-red-600">{errorPrecio}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="descripcion" className="mb-1 block text-sm font-medium text-masa-700">
            Descripción
          </label>
          <textarea
            id="descripcion"
            className="input"
            rows={2}
            value={form.descripcion}
            onChange={(e) => actualizarCampo("descripcion", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fotoUrl" className="mb-1 block text-sm font-medium text-masa-700">
            URL de la foto
          </label>
          <input
            id="fotoUrl"
            className="input"
            value={form.fotoUrl}
            onChange={(e) => actualizarCampo("fotoUrl", e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editando ? "Guardar cambios" : "Crear producto"}
          </button>
          {editando && (
            <button type="button" className="btn-secondary" onClick={cancelarEdicion}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {productos.map((producto) => (
          <div key={producto.idProducto} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-masa-800">{producto.nombre}</p>
              <p className="text-sm text-masa-600">{formatQ(producto.precio)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${producto.disponibilidad ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>
                {producto.disponibilidad ? "Disponible" : "No disponible"}
              </span>
              <button className="btn-secondary" onClick={() => editar(producto)}>
                Editar
              </button>
              <button className="btn-secondary" onClick={() => alternarDisponibilidad(producto)}>
                {producto.disponibilidad ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
