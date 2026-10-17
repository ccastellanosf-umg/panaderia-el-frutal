# Pruebas de carga — Panadería El Frutal

Pruebas ejecutadas con k6 contra el ambiente desplegado en Microsoft Azure
(`app-elfrutal-*-g3`, North Central US) el 16 de octubre de 2026.

- **Script:** `tests/carga/carga.k6.js` (se ejecuta con `npm run test:carga:azure`).
- **Escenario:** rampa de 0 a 50 usuarios virtuales en 1 minuto, 50 usuarios sostenidos
  durante 5 minutos y descenso en 30 segundos (6 min 30 s en total).
- **Endpoints críticos:**
  - `GET /productos`: catálogo público, servicio catalogo.
  - `GET /pedidos/mios`: historial de pedidos del cliente, servicio pedidos, con JWT.
- **Criterios (requerimientos no funcionales):**
  - RNF-01: las páginas principales cargan en un máximo de 3 s → percentil 95 < 3000 ms.
  - RNF-04: disponibilidad mínima del 99 % → tasa de error < 1 %.

## Resultados

| Métrica | Antes (commit 707f05d) | Después (commit 1e14a53) |
|---|---|---|
| `GET /pedidos/mios`: promedio / p95 | 2132 ms / 4938 ms | 275 ms / 1108 ms |
| `GET /productos`: promedio / p95 | 113 ms / 187 ms | 158 ms / 522 ms |
| Global: promedio / p95 | 1122 ms / 3448 ms | 216 ms / 796 ms |
| Solicitudes | 8151 | 14 183 |
| Throughput | 20.8 req/s | 36.2 req/s |
| Tasa de error | 0.00 % | 0.00 % |
| RNF-01 (p95 < 3 s) | No cumple (`/pedidos/mios` y global) | Cumple |
| RNF-04 (error < 1 %) | Cumple | Cumple |

Archivos de cada corrida:

- `antes-2026-10-16/resumen.md`: transcripción del resumen de k6.
- `despues-2026-10-16/`:
  - `resumen.md` y `resumen.json`;
  - `reporte.html`, el dashboard de k6 con las gráficas.

## Análisis

En la primera corrida, `GET /pedidos/mios` no cumplió RNF-01. El cliente de prueba tenía
59 pedidos y cada solicitud ejecutaba 1 + 2N consultas (119): una por pedido para sus
datos y otra para su detalle. Además filtraba con `fn_cliente_de_pedido()` en cada fila, y
el pool de 10 conexiones del servicio hacía esperar a las solicitudes.

La corrección (PR #9) resuelve el historial con dos consultas fijas: un JOIN para
identificar al cliente y una sola consulta para el detalle de todos los pedidos. También
agrega índices sobre las llaves foráneas que usa el historial
(`db/migrations/2026-10-17_indices_historial_pedidos.sql`). La forma de la respuesta no
cambió.

El percentil 95 del catálogo subió de 187 ms a 522 ms porque, al dejar de bloquearse el
historial, el sistema atendió un 74 % más de solicitudes en el mismo tiempo. Sigue muy por
debajo del límite de 3 s.

## Conclusión

Con 50 usuarios virtuales sostenidos durante 5 minutos sobre el plan B1 de App Service y
PostgreSQL B1ms, después de la optimización **se cumplen RNF-01 y RNF-04 en los dos
endpoints críticos**:

- percentil 95 global de 796 ms;
- 36.2 solicitudes por segundo;
- 0 % de errores;
- 28 364 verificaciones aprobadas de 28 364.

Persisten máximos aislados (9.6 s) que no afectan el percentil 95. Su causa no se
investigó; una hipótesis es el nivel Burstable de la base de datos. Si la carga real
creciera, los siguientes pasos serían paginar el historial y evaluar un nivel de cómputo
mayor.
