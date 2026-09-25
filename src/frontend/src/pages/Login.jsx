import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Alerta from "../components/Alerta";

export default function Login() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { login } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);
    try {
      const usuario = await login(correo, contrasena);
      const destino = ubicacion.state?.desde || rutaPorRol(usuario.rol);
      navegar(destino, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function rutaPorRol(rol) {
    if (rol === "administrador") return "/admin/productos";
    if (rol === "operador") return "/";
    return "/";
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-masa-800">Iniciar sesión</h1>
      <form onSubmit={manejarEnvio} className="card space-y-4">
        <Alerta tipo="error">{error}</Alerta>

        <div>
          <label htmlFor="correo" className="mb-1 block text-sm font-medium text-masa-700">
            Correo electrónico
          </label>
          <input
            id="correo"
            type="email"
            required
            className="input"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="contrasena" className="mb-1 block text-sm font-medium text-masa-700">
            Contraseña
          </label>
          <input
            id="contrasena"
            type="password"
            required
            className="input"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>

        <p className="text-center text-sm text-masa-600">
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="font-medium text-masa-700 underline">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}
