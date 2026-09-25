import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { obtenerUsuario, obtenerToken, limpiarSesion } from "../api/client";
import { login as apiLogin, logout as apiLogout } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => obtenerUsuario());

  const login = useCallback(async (correo, contrasena) => {
    const usuarioLogueado = await apiLogin(correo, contrasena);
    setUsuario(usuarioLogueado);
    return usuarioLogueado;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (_err) {
      limpiarSesion();
    } finally {
      setUsuario(null);
    }
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      autenticado: Boolean(usuario && obtenerToken()),
      login,
      logout,
    }),
    [usuario, login, logout]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return contexto;
}
