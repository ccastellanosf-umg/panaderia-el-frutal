// src/pedidos/lib/notificaciones.js
// Módulo de notificaciones WhatsApp (RF-06). Modo simulado por
// defecto (WHATSAPP_API_URL sin definir): registra el mensaje en la
// tabla notificaciones con estado 'enviada' y lo imprime en consola.
// En modo real, hace POST con timeout de 3s; ante cualquier fallo
// registra estado 'fallida' pero NUNCA bloquea la operación que la
// originó (DEF-07).
const { query } = require("./db");
const { sanitizarLog } = require("./log");

async function enviarWhatsapp(mensaje, destino) {
  const url = process.env.WHATSAPP_API_URL;
  if (!url) {
    console.log(`[WhatsApp simulado] Para ${sanitizarLog(destino)}: ${sanitizarLog(mensaje)}`);
    return "enviada";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destino, mensaje }),
      signal: controller.signal,
    });
    return respuesta.ok ? "enviada" : "fallida";
  } catch (_err) {
    return "fallida";
  } finally {
    clearTimeout(timeout);
  }
}

// Notifica sobre un pedido (cambio de estado, etc.) — RF-06, CP-19
async function notificarPedido(idPedido, mensaje) {
  const estado = await enviarWhatsapp(mensaje, `pedido:${idPedido}`);
  try {
    await query(
      `INSERT INTO notificaciones ("idPedido", "canal", "mensaje", "tipo", "estado")
       VALUES ($1, 'whatsapp', $2, 'estado_pedido', $3)`,
      [idPedido, mensaje, estado]
    );
  } catch (err) {
    console.warn("No fue posible registrar la notificación:", err.message);
  }
  return estado;
}

// Notifica a un cliente directamente (p. ej. alerta de inventario)
async function notificarCliente(idCliente, mensaje, tipo = "alerta") {
  const estado = await enviarWhatsapp(mensaje, `cliente:${idCliente}`);
  try {
    await query(
      `INSERT INTO notificaciones ("idCliente", "canal", "mensaje", "tipo", "estado")
       VALUES ($1, 'whatsapp', $2, $3, $4)`,
      [idCliente, mensaje, tipo, estado]
    );
  } catch (err) {
    console.warn("No fue posible registrar la notificación:", err.message);
  }
  return estado;
}

module.exports = { enviarWhatsapp, notificarPedido, notificarCliente };
