import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { puedeAcceder } from "../utils/permisos";

export default function RouteGuard({ roles = [], areas = [], children }) {
  const { usuario, autenticado } = useAuth();

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }
  if (!puedeAcceder(usuario, roles, areas)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
