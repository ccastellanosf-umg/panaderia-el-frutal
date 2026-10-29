// src/auth/lib/log.js
// Evita la inyección en logs (CWE-117): los valores controlados por el
// usuario no pueden introducir saltos de línea ni otros caracteres de
// control que falsifiquen entradas. Copia por servicio (docker build
// solo copia src/<svc>).
const LONGITUD_MAXIMA = 200;

// Controles C0/C1 (incluye CR, LF, tab, NUL), DEL y separadores Unicode de línea.
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

function sanitizarLog(valor, maximo = LONGITUD_MAXIMA) {
  return String(valor).replace(CARACTERES_DE_CONTROL, " ").slice(0, maximo);
}

module.exports = { sanitizarLog };
