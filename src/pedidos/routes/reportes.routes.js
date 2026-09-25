// src/pedidos/routes/reportes.routes.js
// Implementa RF-17, RF-18, RF-19 — solo administrador.
const express = require("express");
const ExcelJS = require("exceljs");
const verificarToken = require("../middlewares/verificarToken");
const { query } = require("../lib/db");

const router = express.Router();
const soloAdmin = verificarToken(["administrador"]);

function rangoFechas(req) {
  const { desde, hasta } = req.query;
  return {
    desde: desde || "1900-01-01",
    hasta: hasta || "2999-12-31",
  };
}

async function ventasPorProducto(desde, hasta) {
  const { rows } = await query(
    `SELECT pr."idProducto", pr."nombre",
            SUM(dp."cantidad")::INT AS "unidadesVendidas",
            SUM(dp."subtotal") AS "totalVendido"
     FROM detalle_pedido dp
     JOIN pedidos p ON p."idPedido" = dp."idPedido"
     JOIN productos pr ON pr."idProducto" = dp."idProducto"
     WHERE p."estado" <> 'cancelado'
       AND p."fecha" BETWEEN $1 AND $2
     GROUP BY pr."idProducto", pr."nombre"
     ORDER BY "totalVendido" DESC`,
    [desde, hasta]
  );
  return rows.map((r) => ({ ...r, totalVendido: Number(r.totalVendido) }));
}

async function ventasPorCanal(desde, hasta) {
  const { rows } = await query(
    `SELECT p."tipo" AS "canal",
            SUM(dp."cantidad")::INT AS "unidadesVendidas",
            SUM(dp."subtotal") AS "totalVendido"
     FROM detalle_pedido dp
     JOIN pedidos p ON p."idPedido" = dp."idPedido"
     WHERE p."estado" <> 'cancelado'
       AND p."fecha" BETWEEN $1 AND $2
     GROUP BY p."tipo"`,
    [desde, hasta]
  );
  return rows.map((r) => ({ ...r, totalVendido: Number(r.totalVendido) }));
}

// GET /reportes/ventas — RF-17, CP-29
router.get("/ventas", soloAdmin, async (req, res) => {
  const { desde, hasta } = rangoFechas(req);
  const [porProducto, porCanal] = await Promise.all([
    ventasPorProducto(desde, hasta),
    ventasPorCanal(desde, hasta),
  ]);
  res.status(200).json({ porProducto, porCanal });
});

// GET /reportes/ventas/excel — RF-17
router.get("/ventas/excel", soloAdmin, async (req, res) => {
  const { desde, hasta } = rangoFechas(req);
  const porProducto = await ventasPorProducto(desde, hasta);

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Ventas por producto");
  hoja.columns = [
    { header: "Producto", key: "nombre", width: 30 },
    { header: "Unidades vendidas", key: "unidadesVendidas", width: 20 },
    { header: "Total vendido (Q)", key: "totalVendido", width: 20 },
  ];
  porProducto.forEach((fila) => hoja.addRow(fila));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=reporte-ventas.xlsx");
  await libro.xlsx.write(res);
  res.end();
});

// GET /reportes/inventario — RF-18
router.get("/inventario", soloAdmin, async (req, res) => {
  const { desde, hasta } = rangoFechas(req);
  const [insumos, criticos, produccion, vendido] = await Promise.all([
    query(`SELECT * FROM insumos ORDER BY "idInsumo"`),
    query(`SELECT * FROM vw_inventario_critico ORDER BY "idInsumo"`),
    query(
      `SELECT "idProducto", SUM("cantidadProducida")::INT AS "producido"
       FROM produccion_diaria WHERE "fecha" BETWEEN $1 AND $2 GROUP BY "idProducto"`,
      [desde, hasta]
    ),
    query(
      `SELECT dp."idProducto", SUM(dp."cantidad")::INT AS "vendido"
       FROM detalle_pedido dp JOIN pedidos p ON p."idPedido" = dp."idPedido"
       WHERE p."estado" <> 'cancelado' AND p."fecha" BETWEEN $1 AND $2
       GROUP BY dp."idProducto"`,
      [desde, hasta]
    ),
  ]);

  const producidoPorProducto = Object.fromEntries(
    produccion.rows.map((r) => [r.idProducto, r.producido])
  );
  const vendidoPorProducto = Object.fromEntries(vendido.rows.map((r) => [r.idProducto, r.vendido]));
  const mermas = Object.keys(producidoPorProducto).map((idProducto) => ({
    idProducto: Number(idProducto),
    producido: producidoPorProducto[idProducto],
    vendido: vendidoPorProducto[idProducto] || 0,
    merma: producidoPorProducto[idProducto] - (vendidoPorProducto[idProducto] || 0),
  }));

  res.status(200).json({
    insumos: insumos.rows.map((i) => ({
      ...i,
      cantidadDisponible: Number(i.cantidadDisponible),
      nivelMinimo: Number(i.nivelMinimo),
    })),
    criticos: criticos.rows,
    mermas,
  });
});

// GET /reportes/sugerencia-produccion — RF-19, CP-30
router.get("/sugerencia-produccion", soloAdmin, async (_req, res) => {
  const { rows: productos } = await query(`SELECT "idProducto", "nombre" FROM productos`);
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0=domingo..6=sábado

  const sugerencias = [];
  for (const producto of productos) {
    const { rows } = await query(
      `SELECT dp."idPedido", dp."cantidad", p."fecha"
       FROM detalle_pedido dp
       JOIN pedidos p ON p."idPedido" = dp."idPedido"
       WHERE dp."idProducto" = $1
         AND p."estado" <> 'cancelado'
         AND p."fecha" >= CURRENT_DATE - INTERVAL '30 day'
         AND EXTRACT(DOW FROM p."fecha") = $2`,
      [producto.idProducto, diaSemana]
    );

    const fechasUnicas = new Set(rows.map((r) => r.fecha.toISOString().slice(0, 10)));
    const totalUnidades = rows.reduce((acc, r) => acc + Number(r.cantidad), 0);
    const diasConsiderados = Math.max(fechasUnicas.size, 1);
    const promedio = totalUnidades / diasConsiderados;
    const sugerido = Math.ceil(promedio * 1.1);

    sugerencias.push({
      idProducto: producto.idProducto,
      nombre: producto.nombre,
      promedioVendido: Number(promedio.toFixed(2)),
      cantidadSugerida: sugerido,
    });
  }

  res.status(200).json(sugerencias);
});

module.exports = router;
