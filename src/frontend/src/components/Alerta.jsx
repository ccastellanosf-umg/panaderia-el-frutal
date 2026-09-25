export default function Alerta({ tipo = "error", children }) {
  if (!children) return null;
  const estilos = {
    error: "bg-red-50 text-red-700 border-red-200",
    exito: "bg-green-50 text-green-700 border-green-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${estilos[tipo]}`}>
      {children}
    </div>
  );
}
