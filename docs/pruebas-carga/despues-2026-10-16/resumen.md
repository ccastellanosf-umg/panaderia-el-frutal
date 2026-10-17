# Prueba de carga — Panadería El Frutal (Azure)

Fecha: 2026-10-17T05:24:36.418Z
Usuarios virtuales máximos: 50

| Endpoint | Promedio | Percentil 95 | Máximo |
|---|---|---|---|
| Global | 216 ms | 796 ms | 9573 ms |
| GET /productos | 158 ms | 522 ms | 2106 ms |
| GET /pedidos/mios | 275 ms | 1108 ms | 9573 ms |

Solicitudes: 14183 · Throughput: 36.15 req/s · Tasa de error: 0.00 %

| Métrica | Umbral | Resultado |
|---|---|---|
| http_req_failed | rate<0.01 | Cumple |
| http_req_duration{endpoint:pedidos} | p(95)<3000 | Cumple |
| http_req_duration{endpoint:catalogo} | p(95)<3000 | Cumple |
| http_req_duration | p(95)<3000 | Cumple |
