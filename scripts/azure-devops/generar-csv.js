// scripts/azure-devops/generar-csv.js
// Genera los CSV de importación para Azure DevOps (E5) a partir de las
// fuentes reales del repositorio:
//   - CP-01..CP-30: diseño del documento de la Fase 1 (E3)
//   - CP-31..CP-40: tests/e2e/README.md
//   - Resultados:   docs/defectos/ejecucion-{1,2}-junit.xml
//   - Bugs:         docs/defectos/defectos.md
// Uso: node scripts/azure-devops/generar-csv.js
const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
const salida = path.join(raiz, "docs/azure-devops");
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

const PRIORIDAD = { Alta: 1, Media: 2, Baja: 3 };
const SEVERIDAD = {
  Bloqueante: "1 - Critical",
  "Crítica": "2 - High",
  Mayor: "3 - Medium",
  Menor: "4 - Low",
};

// Diseño de CP-01..CP-30 tal como está en el entregable E3.
const CASOS_DOCUMENTO = [
  ["CP-01", "RF-21", "Partición de Equivalencia", "Servicio /auth/registro activo.", "Correo no registrado, nombre válido, clave 'Password123!'", "Enviar POST a /auth/registro.", "Código HTTP 201 Created y usuario registrado en PostgreSQL.", "Alta"],
  ["CP-02", "RF-21", "Partición de Equivalencia", "Usuario existente en BD.", "Correo ya registrado previamente en BD.", "Enviar POST a /auth/registro con correo duplicado.", "Código HTTP 400 Bad Request con mensaje 'Correo en uso'.", "Alta"],
  ["CP-03", "RF-21", "Análisis de Valores Límite", "Formulario de registro abierto.", "Clave de 7 caracteres ('Pass12!').", "Enviar registro con clave < 8 caracteres.", "Validación rechaza la clave por longitud insuficiente.", "Alta"],
  ["CP-04", "RF-21", "Análisis de Valores Límite", "Formulario de registro abierto.", "Clave exactamente de 8 caracteres ('Pass1234').", "Enviar registro con clave de 8 caracteres.", "Validación exitosa y clave procesada por bcrypt.", "Media"],
  ["CP-05", "RF-21", "Tabla de Decisión", "Endpoint /auth/login disponible.", "Correo válido y clave correcta.", "Enviar POST a /auth/login con credenciales válidas.", "Código HTTP 200 OK y entrega de token JWT firmado.", "Alta"],
  ["CP-06", "RF-21", "Tabla de Decisión", "Endpoint /auth/login disponible.", "Correo válido y clave incorrecta.", "Enviar POST a /auth/login con clave errónea.", "Código HTTP 401 Unauthorized y login rechazado.", "Alta"],
  ["CP-07", "RF-20", "Tabla de Decisión", "Token JWT con rol cliente.", "Token enviado en header Authorization Bearer.", "Solicitar POST a /productos (creación).", "Código HTTP 403 Forbidden por falta de permisos.", "Alta"],
  ["CP-08", "RF-20", "Tabla de Decisión", "Token JWT con rol administrador.", "Token enviado en header Authorization Bearer.", "Solicitar POST a /productos (creación).", "Código HTTP 201 Created y producto registrado.", "Alta"],
  ["CP-09", "RF-01", "Partición de Equivalencia", "Admin autenticado.", "Precio del producto = 15.50 (positivo).", "Crear producto con precio válido.", "Producto guardado exitosamente en BD.", "Alta"],
  ["CP-10", "RF-01", "Análisis de Valores Límite", "Admin autenticado.", "Precio del producto = 0.00 (límite).", "Crear producto con precio 0.", "Producto aceptado (promoción/muestra).", "Media"],
  ["CP-11", "RF-01", "Análisis de Valores Límite", "Admin autenticado.", "Precio del producto = -0.01 (inválido).", "Crear producto con precio negativo.", "Rechazado por regla del negocio precio >= 0.", "Alta"],
  ["CP-12", "RF-02", "Transición de Estados", "Producto disponible (disponibilidad = true).", "ID de producto existente.", "Cambiar disponibilidad a false.", "Estado actualizado y oculto en catálogo público.", "Alta"],
  ["CP-13", "RF-03", "Partición de Equivalencia", "Productos disponibles y no disponibles en BD.", "Ninguna (acceso público).", "GET a /productos.", "Retorna solo productos con disponibilidad = true.", "Alta"],
  ["CP-14", "RF-04", "Partición de Equivalencia", "Cliente autenticado.", "Carrito con 3 productos válidos.", "POST a /pedidos con datos completos.", "Pedido creado en estado recibido.", "Alta"],
  ["CP-15", "RF-04", "Análisis de Valores Límite", "Cliente autenticado.", "Carrito vacío (0 productos).", "POST a /pedidos con arreglo de ítems vacío.", "Código HTTP 400 Bad Request ('Pedido vacío').", "Alta"],
  ["CP-16", "RF-05", "Transición de Estados", "Pedido en estado recibido.", "ID de pedido válido.", "Cambiar estado a en_preparacion.", "Transición permitida y estado actualizado.", "Alta"],
  ["CP-17", "RF-05", "Transición de Estados", "Pedido en estado recibido.", "ID de pedido válido.", "Intentar cambiar estado directo a entregado.", "El disparador trg_validar_secuencia_estado bloquea el cambio.", "Alta"],
  ["CP-18", "RF-05", "Transición de Estados", "Pedido en estado entregado.", "ID de pedido válido.", "Intentar cambiar estado a en_preparacion.", "Transición inválida rechazada por la BD.", "Alta"],
  ["CP-19", "RF-06", "Tabla de Decisión", "Pedido cambia de estado.", "Cliente con teléfono válido.", "Actualizar estado de pedido.", "Notificación registrada en tabla notificaciones.", "Media"],
  ["CP-20", "RF-08", "Transición de Estados", "Pedido en estado recibido.", "Cliente titular del pedido.", "Cancelar pedido desde perfil.", "Pedido pasa a estado cancelado.", "Alta"],
  ["CP-21", "RF-08", "Transición de Estados", "Pedido en estado en_preparacion.", "Cliente titular del pedido.", "Intentar cancelar pedido.", "Cancelación rechazada por estar en preparación.", "Alta"],
  ["CP-22", "RF-10", "Partición de Equivalencia", "Insumo con 100 kg disponibles.", "Receta de producto requiere 0.5 kg por unidad.", "Confirmar pedido de 10 unidades.", "Inventario de insumo se reduce a 95 kg.", "Alta"],
  ["CP-23", "RF-11", "Análisis de Valores Límite", "Insumo con nivel mínimo = 10 kg.", "Existencia actual = 10.5 kg. Consumo = 1.0 kg.", "Descontar inventario dejando existencia en 9.5 kg.", "Se activa alerta en vw_inventario_critico.", "Alta"],
  ["CP-24", "RF-13", "Partición de Equivalencia", "Cliente autenticado.", "Plan 'tres_semanales' seleccionado.", "POST a /suscripciones.", "Suscripción registrada en estado activa.", "Alta"],
  ["CP-25", "RF-15", "Tabla de Decisión", "Suscripción activa.", "Pasarela de pago responde 'Aprobado'.", "Ejecutar sp_procesar_cobro_suscripcion.", "Pago registrado y fechaCobro actualizada.", "Alta"],
  ["CP-26", "RF-15", "Tabla de Decisión", "Suscripción activa.", "Pasarela de pago responde 'Rechazado'.", "Ejecutar sp_procesar_cobro_suscripcion.", "Suscripción cambia a estado pausada.", "Alta"],
  ["CP-27", "RF-16", "Análisis de Valores Límite", "Suscripción activa con cobro en 72 horas.", "Cliente solicita cancelación.", "Cancelar suscripción con 72 horas de anticipación.", "Suscripción pasa a estado cancelada.", "Media"],
  ["CP-28", "RF-16", "Análisis de Valores Límite", "Suscripción activa con cobro en 12 horas.", "Cliente solicita cancelación.", "Cancelar suscripción con menos de 48 horas de anticipación.", "El sistema rechaza la cancelación (norma RN-03).", "Media"],
  ["CP-29", "RF-17", "Partición de Equivalencia", "Ventas registradas en BD.", "Rango de fechas válido.", "Solicitar reporte de ventas.", "Retorna la vista vw_reporte_ventas_producto.", "Media"],
  ["CP-30", "RF-19", "Partición de Equivalencia", "Historial de ventas de 30 días.", "Fórmula de sugerencia activa.", "Solicitar sugerencia de horneado.", "Retorna sugerencias estimadas por producto.", "Baja"],
];

// Casos agregados para cubrir de forma directa RF-12, RF-18, RF-07, RF-09 y RF-14.
const CASOS_COBERTURA = [
  ["CP-41", "RF-12", "Partición de Equivalencia", "Operador de producción autenticado.", "idProducto 1, fecha de hoy, cantidadProducida 40.", "Registrar la producción diaria (POST /inventario/produccion) y consultar el listado del día.", "Código HTTP 201 y el registro aparece en el listado de producción del día.", "Media"],
  ["CP-42", "RF-18", "Partición de Equivalencia", "Administrador autenticado; producción registrada en el período.", "Rango desde = hasta = fecha de hoy.", "Solicitar el reporte de inventario (GET /reportes/inventario).", "Código HTTP 200 con insumos, insumos críticos y mermas (merma = producido − vendido).", "Media"],
  ["CP-43", "RF-07", "Partición de Equivalencia", "Cliente autenticado con un pedido registrado.", "Pedido de 3 unidades del producto 1.", "Consultar el historial de pedidos (GET /pedidos/mios).", "Código HTTP 200 con el pedido del cliente y el detalle de sus ítems.", "Media"],
  ["CP-44", "RF-09", "Partición de Equivalencia", "Operador de producción autenticado.", "Insumo nuevo: cantidad 25, nivel mínimo 5, unidad kg.", "Registrar el insumo (POST /inventario/insumos) y consultar el listado.", "Código HTTP 201 con los datos del insumo, que aparece en el listado.", "Media"],
  ["CP-45", "RF-14", "Partición de Equivalencia", "Cliente autenticado.", "Plan 2 con surtido: producto 1 × 6 y producto 2 × 4.", "Contratar la suscripción y consultar las suscripciones del cliente.", "Código HTTP 201 y la suscripción conserva exactamente el surtido elegido.", "Media"],
];

// CP-31..CP-40: tabla "CP-31..CP-40" de tests/e2e/README.md.
function casosDeDefectos(defectos) {
  const filas = leer("tests/e2e/README.md")
    .split("\n")
    .filter((l) => /^\| CP-(3[1-9]|40) /.test(l));
  return filas.map((l) => {
    const [cp, rf, tecnica, datos, esperado, def] = l
      .split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, ""));
    const idDef = def.match(/DEF-\d+/)[0];
    const d = defectos.find((x) => x.id === idDef);
    return [cp, rf, tecnica, d.precondiciones, datos, datos, esperado, d.prioridad];
  });
}

// Resultado por caso a partir del JUnit: "Aprobado" | "Fallido" | "Omitido".
function resultados(rel) {
  const xml = leer(rel);
  const mapa = {};
  const re = /<testcase[^>]*name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const cp = (m[1].match(/CP-\d{2}/) || [])[0];
    if (!cp) continue;
    const cuerpo = m[3] || "";
    mapa[cp] = /<failure/.test(cuerpo) ? "Fallido" : /<skipped/.test(cuerpo) ? "Omitido" : "Aprobado";
  }
  return mapa;
}

// Secciones "## DEF-XX — título" de docs/defectos/defectos.md.
function leerDefectos() {
  const md = leer("docs/defectos/defectos.md");
  const secciones = md.split(/^## (?=DEF-\d+ )/m).slice(1);
  return secciones.map((s) => {
    const [cabecera] = s.split("\n");
    const campo = (nombre) => {
      const m = s.match(new RegExp(`\\*\\*${nombre}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n## |\\n---|$)`));
      return m ? m[1].trim() : "";
    };
    return {
      id: cabecera.match(/DEF-\d+/)[0],
      titulo: cabecera.replace(/^DEF-\d+ — /, "").replace(/`/g, "").trim(),
      modulo: campo("Módulo"),
      requerimiento: campo("Requerimiento afectado"),
      severidad: campo("Severidad"),
      prioridad: campo("Prioridad"),
      precondiciones: campo("Precondiciones").replace(/`/g, ""),
      pasos: campo("Pasos de reproducción"),
      esperado: campo("Resultado esperado"),
      obtenido: campo("Resultado obtenido"),
      evidencia: campo("Evidencia").replace(/`/g, ""),
      estado: campo("Estado").replace(/\.$/, "").split(" ")[0],
      correccion: campo("Corrección"),
    };
  });
}

const csv = (filas) =>
  "﻿" + filas.map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
const html = (texto) => texto.replace(/`/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");

const defectos = leerDefectos();
const casos = [...CASOS_DOCUMENTO, ...casosDeDefectos(defectos), ...CASOS_COBERTURA];
const ejec1 = resultados("docs/defectos/ejecucion-1-junit.xml");
const ejec2 = resultados("docs/defectos/ejecucion-2-junit.xml");
const ejec4 = resultados("docs/defectos/ejecucion-4-azure-junit.xml");
const ejec5 = resultados("docs/defectos/ejecucion-5-azure-junit.xml");
fs.mkdirSync(salida, { recursive: true });

// 1. Casos de prueba (Test Plans / Boards: un caso con 2 pasos).
const filasCasos = [["ID", "Work Item Type", "Title", "Test Step", "Step Action", "Step Expected", "Priority", "Tags"]];
for (const [cp, rf, tecnica, pre, datos, pasos, esperado, prio] of casos) {
  filasCasos.push(["", "Test Case", `${cp} ${pasos}`.slice(0, 250), "1",
    `Precondición: ${pre}`, "", PRIORIDAD[prio] || 2, `${cp}; ${rf}; ${tecnica}`]);
  filasCasos.push(["", "", "", "2", `${pasos} Datos: ${datos}`, esperado, "", ""]);
}
fs.writeFileSync(path.join(salida, "casos-prueba.csv"), csv(filasCasos));

// 2. Bugs (Boards > Import work items).
const filasBugs = [["Work Item Type", "Title", "Severity", "Priority", "Tags", "Repro Steps"]];
for (const d of defectos) {
  const cp = casos.find((c) => c.includes(d.id) || c[0] === `CP-${30 + Number(d.id.slice(4))}`)[0];
  const repro = [
    ["Módulo", d.modulo], ["Requerimiento", d.requerimiento],
    ["Caso de prueba", cp], ["Precondiciones", d.precondiciones],
    ["Pasos", "\n" + d.pasos], ["Resultado esperado", d.esperado],
    ["Resultado obtenido", d.obtenido], ["Evidencia", d.evidencia],
    ["Estado final", d.estado + (d.correccion ? ` — Corrección: ${d.correccion}` : "")],
  ].map(([etiqueta, valor]) => `<b>${etiqueta}:</b> ${html(valor)}`).join("<br><br>");
  filasBugs.push(["Bug", `${d.id} ${d.titulo}`, SEVERIDAD[d.severidad], PRIORIDAD[d.prioridad],
    `${d.id}; ${cp}; ${d.estado}`, repro]);
}
fs.writeFileSync(path.join(salida, "bugs.csv"), csv(filasBugs));

// 3. Resultados de las dos ejecuciones (para registrar en Test Plans).
const filasRes = [["Caso", "Requerimiento", "Técnica", "Ejecución 1", "Ejecución 2", "Ejecución 4 (Azure)", "Ejecución 5 (Azure)", "Defecto"]];
for (const [cp, rf, tecnica] of casos) {
  const n = Number(cp.slice(3));
  filasRes.push([cp, rf, tecnica, ejec1[cp] || "No existía", ejec2[cp] || "No existía", ejec4[cp] || "No existía", ejec5[cp] || "", n > 30 && n <= 40 ? `DEF-${String(n - 30).padStart(2, "0")}` : ""]);
}
fs.writeFileSync(path.join(salida, "resultados-ejecuciones.csv"), csv(filasRes));

const cuenta = (m, v) => Object.values(m).filter((x) => x === v).length;
console.log(`casos: ${casos.length}, bugs: ${defectos.length}`);
console.log(`ejecución 1: ${cuenta(ejec1, "Aprobado")} aprobados, ${cuenta(ejec1, "Fallido")} fallidos`);
console.log(`ejecución 5: ${cuenta(ejec5, "Aprobado")} aprobados, ${cuenta(ejec5, "Fallido")} fallidos`);
console.log(`ejecución 4: ${cuenta(ejec4, "Aprobado")} aprobados, ${cuenta(ejec4, "Fallido")} fallidos`);
console.log(`ejecución 2: ${cuenta(ejec2, "Aprobado")} aprobados, ${cuenta(ejec2, "Fallido")} fallidos`);
