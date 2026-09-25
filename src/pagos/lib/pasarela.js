// src/pagos/lib/pasarela.js
// Pasarela de pago simulada por defecto (PASARELA_MODO=simulada, RF-15).
// En modo simulado, el llamador puede forzar el resultado vía
// simularRespuesta ('aprobado' | 'rechazado'); si no se especifica,
// se asume aprobado. El modo real queda fuera del alcance académico
// de este proyecto (no hay integración con Recurrente/Visanet aún);
// de estar configurado, se comporta igual que el simulado para no
// romper el flujo (deviación documentada en el reporte final).
function procesarCobro(simularRespuesta) {
  const modo = process.env.PASARELA_MODO || "simulada";

  if (modo === "simulada" && simularRespuesta === "rechazado") {
    return "rechazado";
  }
  return "aprobado";
}

module.exports = { procesarCobro };
