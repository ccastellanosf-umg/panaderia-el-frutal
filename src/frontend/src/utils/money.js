// Formato de moneda para Quetzales (Q).
export function formatQ(valor) {
  const numero = Number(valor) || 0;
  return `Q ${numero.toFixed(2)}`;
}

// Redondea a 2 decimales evitando errores de punto flotante
// (p. ej. 3 * 12.33 debe dar exactamente 36.99).
export function redondear2(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}
