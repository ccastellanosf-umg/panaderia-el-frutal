const COLORES = {
  recibido: "bg-blue-100 text-blue-800",
  en_preparacion: "bg-amber-100 text-amber-800",
  listo: "bg-purple-100 text-purple-800",
  entregado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
  activa: "bg-green-100 text-green-800",
  pausada: "bg-amber-100 text-amber-800",
  cancelada: "bg-red-100 text-red-800",
  aprobado: "bg-green-100 text-green-800",
  rechazado: "bg-red-100 text-red-800",
  pendiente: "bg-amber-100 text-amber-800",
};

const ETIQUETAS = {
  recibido: "Recibido",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado",
  activa: "Activa",
  pausada: "Pausada",
  cancelada: "Cancelada",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  pendiente: "Pendiente",
};

export default function EstadoBadge({ estado }) {
  const clase = COLORES[estado] || "bg-gray-100 text-gray-800";
  const texto = ETIQUETAS[estado] || estado;
  return <span className={`badge ${clase}`}>{texto}</span>;
}
