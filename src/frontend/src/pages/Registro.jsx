import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registro } from "../api/auth";
import Alerta from "../components/Alerta";

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Registro() {
  const [form, setForm] = useState({ nombre: "", correo: "", telefono: "", contrasena: "" });
  const [erroresCampo, setErroresCampo] = useState({});
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [cargando, setCargando] = useState(false);
  const navegar = useNavigate();

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function validar() {
    const errores = {};
    if (!form.nombre.trim()) errores.nombre = "El nombre es obligatorio.";
    if (!REGEX_CORREO.test(form.correo)) errores.correo = "El correo no tiene un formato válido.";
    if (form.contrasena.length < 8) errores.contrasena = "La contraseña debe tener al menos 8 caracteres.";
    setErroresCampo(errores);
    return Object.keys(errores).length === 0;
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    setExito("");
    if (!validar()) return;

    setCargando(true);
    try {
      await registro(form);
      setExito("Registro exitoso. Ya puedes iniciar sesión.");
      setTimeout(() => navegar("/login"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-masa-800">Crear cuenta</h1>
      <form onSubmit={manejarEnvio} className="card space-y-4" noValidate>
        <Alerta tipo="error">{error}</Alerta>
        <Alerta tipo="exito">{exito}</Alerta>

        <div>
          <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-masa-700">
            Nombre completo
          </label>
          <input
            id="nombre"
            className="input"
            value={form.nombre}
            onChange={(e) => actualizarCampo("nombre", e.target.value)}
          />
          {erroresCampo.nombre && <p className="mt-1 text-xs text-red-600">{erroresCampo.nombre}</p>}
        </div>

        <div>
          <label htmlFor="correo" className="mb-1 block text-sm font-medium text-masa-700">
            Correo electrónico
          </label>
          <input
            id="correo"
            className="input"
            value={form.correo}
            onChange={(e) => actualizarCampo("correo", e.target.value)}
          />
          {erroresCampo.correo && <p className="mt-1 text-xs text-red-600">{erroresCampo.correo}</p>}
        </div>

        <div>
          <label htmlFor="telefono" className="mb-1 block text-sm font-medium text-masa-700">
            Teléfono (opcional)
          </label>
          <input
            id="telefono"
            className="input"
            value={form.telefono}
            onChange={(e) => actualizarCampo("telefono", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="contrasena" className="mb-1 block text-sm font-medium text-masa-700">
            Contraseña
          </label>
          <input
            id="contrasena"
            type="password"
            className="input"
            value={form.contrasena}
            onChange={(e) => actualizarCampo("contrasena", e.target.value)}
          />
          {erroresCampo.contrasena && (
            <p className="mt-1 text-xs text-red-600">{erroresCampo.contrasena}</p>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={cargando}>
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-masa-600">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-medium text-masa-700 underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
