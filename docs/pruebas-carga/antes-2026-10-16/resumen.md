# Prueba de carga — Panadería El Frutal (Azure)

> Transcripción del resumen que k6 imprimió al terminar la corrida (commit 707f05d,
> antes de la optimización del historial). El `resumen.json` y el `reporte.html` de esta
> corrida se sobrescribieron con la corrida siguiente; los mismos valores constan en el
> PR #9.

Fecha: 2026-10-17T04:35:23.421Z
Usuarios virtuales máximos: 50

| Endpoint | Promedio | Percentil 95 | Máximo |
|---|---|---|---|
| Global | 1122 ms | 3448 ms | 20081 ms |
| GET /productos | 113 ms | 187 ms | 746 ms |
| GET /pedidos/mios | 2132 ms | 4938 ms | 20081 ms |

Solicitudes: 8151 · Throughput: 20.82 req/s · Tasa de error: 0.00 %

| Métrica | Umbral | Resultado |
|---|---|---|
| http_req_failed | rate<0.01 | Cumple |
| http_req_duration{endpoint:pedidos} | p(95)<3000 | No cumple |
| http_req_duration | p(95)<3000 | No cumple |
| http_req_duration{endpoint:catalogo} | p(95)<3000 | Cumple |
