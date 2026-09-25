# Reporte de defectos — Panadería El Frutal

**Alcance:** pruebas exploratorias de caja negra/gris contra el stack Docker local (auth :3001, catalogo :3002, pedidos :3003, pagos :3004) en la rama `feature/fase1-app-completa`, ejecutadas el 2026-09-25. Todos los defectos listados fueron **reproducidos con peticiones HTTP reales** contra los servicios en ejecución; la evidencia cruda (comandos y respuestas exactas) está en `docs/defectos/evidencia/DEF-XX.txt`.

**Probes ejecutados:** ~55 peticiones HTTP dirigidas (autenticación, control de acceso por rol/área, límites de validación de pedidos/productos/insumos/suscripciones, IDOR, inyección, máquina de estados, regla de 48h, filtros de reportes, manejo de errores) más inspección de esquema/triggers en `db/01_schema.sql` y logs de los 4 contenedores.

## Resumen de defectos

| ID | Título | Módulo | Requerimiento | Severidad | Prioridad | Caso de prueba | Estado |
|----|--------|--------|----------------|-----------|-----------|-----------------|--------|
| DEF-01 | `precio:"Infinity"` tumba el microservicio catálogo | catalogo | RF-01 | Bloqueante | Alta | CP-31 | Cerrado |
| DEF-02 | Fecha inválida en reportes tumba el microservicio pedidos (y todo /inventario, /pedidos) | pedidos | RF-17 | Bloqueante | Alta | CP-32 | Cerrado |
| DEF-03 | El logout no invalida la sesión en catalogo, pedidos ni pagos | auth / catalogo / pedidos / pagos | RF-21, RNF-02 | Crítica | Alta | CP-33 | Abierto |
| DEF-04 | Se puede cobrar una suscripción ya cancelada | pagos | RF-16 | Crítica | Alta | CP-34 | Cerrado |
| DEF-05 | Pedidos aceptados y descontados pese a stock insuficiente (clamp a 0) | pedidos | RF-10, RF-11 | Mayor | Alta | CP-35 | Abierto |
| DEF-06 | Registro duplicado con el mismo correo en distinta capitalización | auth | RF-20/RF-21 | Mayor | Media | CP-36 | Cerrado |
| DEF-07 | Nombre > 100 caracteres responde 404 engañoso en vez de error de validación | catalogo | RF-01 | Menor | Media | CP-37 | Abierto |
| DEF-08 | `precio:null` crea producto gratuito (Q0.00) sin validación | catalogo | RF-01 | Menor | Media | CP-38 | Cerrado |
| DEF-09 | JSON malformado responde HTML en vez de error JSON | auth / catalogo / pedidos / pagos | — (consistencia de API) | Menor | Baja | CP-39 | Cerrado |
| DEF-10 | `fechaEntrega` en el pasado aceptada sin validación | pedidos | RF-04 | Menor | Baja | CP-40 | Abierto |

## Ejecuciones

Dos corridas reales y completas de la suite E2E (`tests/e2e/casos-prueba.e2e.test.js`, CP-01..CP-40), contra el stack Docker local reconstruido con `docker compose up -d --build`. Resultados extraídos de `docs/defectos/ejecucion-{1,2}-junit.xml` (JUnit) y `docs/defectos/ejecucion-{1,2}-resumen.txt` (consola de Jest).

| Ejecución | Momento | Casos ejecutados | Aprobados | Fallidos | Tasa de aprobación |
|-----------|---------|-------------------|-----------|----------|----------------------|
| 1 (antes de la corrección) | previa a aplicar los fixes de DEF-01,02,04,06,08,09 | 41 | 31 | 10 | 75.6% |
| 2 (después de la corrección) | tras aplicar los fixes y reconstruir los 4 contenedores | 41 | 37 | 4 | 90.2% |

En la ejecución 2, los 4 casos que siguen fallando son exactamente los 4 defectos dejados abiertos a propósito: CP-33 (DEF-03), CP-35 (DEF-05), CP-37 (DEF-07) y CP-40 (DEF-10). Los 6 casos CP-31, CP-32, CP-34, CP-36, CP-38, CP-39 (DEF-01, 02, 04, 06, 08, 09) pasan a estar en verde.

Las pruebas unitarias por servicio (`tests/<svc>.test.js`, con Prisma/Redis/`lib/db` mockeados) pasan en su totalidad tras las correcciones: auth 15/15, catalogo 13/13, pedidos 18/18, pagos 14/14 (60/60).

---

## DEF-01 — `precio:"Infinity"` tumba el microservicio catálogo completo

- **Módulo:** catálogo
- **Requerimiento afectado:** RF-01 (validación de precio)
- **Severidad:** Bloqueante
- **Prioridad:** Alta
- **Precondiciones:** sesión con token de administrador válido.
- **Pasos de reproducción:**
  1. `POST /productos` con `{"nombre":"QA precio infinito","precio":"Infinity"}` y el token de admin.
- **Resultado esperado:** 400 "El precio debe ser un número mayor o igual a 0." (o similar), servicio permanece operativo.
- **Resultado obtenido:** la conexión se cierra sin respuesta (curl: "Empty reply from server"); el contenedor `elfrutal_catalogo` muere con una `PrismaClientValidationError` no capturada y Docker lo reinicia automáticamente (confirmado con `docker ps`).
- **Evidencia:** `docs/defectos/evidencia/DEF-01.txt`
- **Causa raíz:** `src/catalogo/routes/catalogo.routes.js:66-73` — `Number("Infinity")` pasa la validación (`>= 0` y no `NaN`), y el `prisma.producto.create(...)` de la línea 71-73 no está envuelto en `try/catch` (a diferencia de `PUT /:id` y `PATCH /:id/disponibilidad`), por lo que la excepción de Prisma se convierte en una promesa rechazada no controlada que mata el proceso Node.
- **Estado:** Cerrado.
- **Corrección:** `src/catalogo/routes/catalogo.routes.js` (nueva función `precioValido`: exige un número finito, >= 0, con máximo 2 decimales, aplicada en `POST /productos` y `PUT /productos/:id`); `src/catalogo/lib/asyncErrors.js` + `src/catalogo/app.js` (parche de `express-router` para reenviar rechazos de promesas a `next(err)`, más un middleware de error final que responde 500 JSON en vez de tumbar el proceso). El mismo patrón de `lib/asyncErrors.js` + middleware final se replicó en `src/auth`, `src/pedidos` y `src/pagos` (crash-proofing general, no solo para este defecto).
- **Verificación:** unitaria en `tests/catalogo.test.js` ("DEF-01: precio 'Infinity' responde 400..."); CP-31 pasa en ejecución 2.

## DEF-02 — Fecha inválida en `/reportes/ventas` tumba el microservicio pedidos completo

- **Módulo:** pedidos (reportes)
- **Requerimiento afectado:** RF-17 (reporte de ventas); afecta transitivamente RF-04..RF-12 al caer todo el servicio.
- **Severidad:** Bloqueante
- **Prioridad:** Alta
- **Precondiciones:** sesión con token de administrador válido.
- **Pasos de reproducción:**
  1. `GET /reportes/ventas?desde=no-es-fecha&hasta=2026-12-31` con token de admin.
- **Resultado esperado:** 400 "Fecha inválida" o similar, servicio permanece operativo.
- **Resultado obtenido:** conexión cerrada sin respuesta; `docker logs elfrutal_pedidos` muestra dos crashes consecutivos (`DateTimeParseError`, código Postgres `22007`) y dos reinicios del contenedor.
- **Evidencia:** `docs/defectos/evidencia/DEF-02.txt`
- **Causa raíz:** `src/pedidos/routes/reportes.routes.js:11-17` (`rangoFechas`) no valida el formato de `desde`/`hasta`, y el handler `GET /reportes/ventas` (líneas 52-59) no tiene `try/catch`. El mismo patrón se repite en el resto de `reportes.routes.js` (no se volvió a probar individualmente para no derribar el servicio innecesariamente; ver Observaciones).
- **Impacto adicional:** este microservicio también aloja `/pedidos`, `/pedidos/:id/estado`, `/pedidos/:id/cancelar` e `/inventario/*` — su caída interrumpe la operación completa de pedidos e inventario, no solo reportes.
- **Estado:** Cerrado.
- **Corrección:** `src/pedidos/routes/reportes.routes.js` (`rangoFechas` ahora valida formato `YYYY-MM-DD`, fecha calendario real y `desde <= hasta`, aplicado en `GET /reportes/ventas`, `/ventas/excel` e `/inventario`); `src/pedidos/routes/inventario.routes.js` (misma validación en `GET /inventario/produccion`); `src/pedidos/lib/asyncErrors.js` + `src/pedidos/app.js` (red de seguridad general, igual patrón que DEF-01).
- **Verificación:** unitaria en `tests/pedidos.test.js` ("DEF-02: fecha 'desde' inválida...", "fecha calendario inexistente..."); CP-32 pasa en ejecución 2.

## DEF-03 — El logout no invalida la sesión en catalogo, pedidos ni pagos

- **Módulo:** auth / catalogo / pedidos / pagos
- **Requerimiento afectado:** RF-21 (logout con lista negra), RNF-02 (seguridad de sesión)
- **Severidad:** Crítica
- **Prioridad:** Alta
- **Precondiciones:** sesión de administrador activa.
- **Pasos de reproducción:**
  1. Login como admin, confirmar sesión con `GET /auth/me` (200).
  2. `POST /auth/logout` (200).
  3. Repetir `GET /auth/me` con el mismo token → 401 correcto.
  4. Repetir con el **mismo token** contra `GET /productos/todos` (catalogo), `GET /pedidos` (pedidos) y `GET /pagos` (pagos).
- **Resultado esperado:** 401 en los tres servicios, igual que en auth.
- **Resultado obtenido:** 200 en los tres — acceso administrativo completo concedido pese al logout, durante toda la vigencia del token (hasta 8h).
- **Evidencia:** `docs/defectos/evidencia/DEF-03.txt`
- **Causa raíz:** `src/catalogo/middlewares/verificarToken.js`, `src/pedidos/middlewares/verificarToken.js` y `src/pagos/middlewares/verificarToken.js` solo verifican firma/expiración JWT; únicamente `src/auth/middlewares/verificarToken.js:33-45` consulta la lista negra `blacklist:<jti>` en Redis.
- **Estado:** Abierto (fuera del alcance de esta corrección; CP-33 debe seguir fallando).

## DEF-04 — Se puede cobrar una suscripción ya cancelada

- **Módulo:** pagos (suscripciones)
- **Requerimiento afectado:** RF-16 (cancelación de suscripciones)
- **Severidad:** Crítica
- **Prioridad:** Alta
- **Precondiciones:** suscripción semilla `idSuscripcion=4` en estado `cancelada`; token de administrador.
- **Pasos de reproducción:**
  1. Confirmar en BD que `idSuscripcion=4` tiene `estado='cancelada'`.
  2. `POST /suscripciones/4/cobrar` con `{"simularRespuesta":"aprobado"}` y token admin.
- **Resultado esperado:** rechazo (409/400) — no se debe poder cobrar una suscripción cancelada.
- **Resultado obtenido:** 200 `{"resultado":"aprobado", "suscripcion": {... "estado":"cancelada" ...}}`; se insertó un pago real de Q450.00 (`idPago=36`) y `fechaCobro` avanzó, sin cambiar el estado cancelado.
- **Evidencia:** `docs/defectos/evidencia/DEF-04.txt`
- **Causa raíz:** `src/pagos/routes/suscripciones.routes.js:102-129` no valida el `estado` de la suscripción antes de llamar a `sp_procesar_cobro_suscripcion`; y `db/01_schema.sql:465-516` (el procedimiento) tampoco valida `estado='activa'` antes de insertar el pago.
- **Estado:** Cerrado.
- **Corrección:** `src/pagos/routes/suscripciones.routes.js` (`POST /suscripciones/:id/cobrar` ahora obtiene la suscripción antes de cobrar y responde 409 si `estado !== 'activa'`); `db/01_schema.sql` y `db/migrations/2026-09-25_fix_defectos.sql` (`sp_procesar_cobro_suscripcion` con `RAISE EXCEPTION` si el estado no es `'activa'`, defensa en profundidad); `src/pagos/lib/db.js` (`mapearErrorDb` mapea ese `RAISE EXCEPTION` a 409); `src/pagos/lib/asyncErrors.js` + `src/pagos/app.js` (red de seguridad general).
- **Verificación:** unitaria en `tests/pagos.test.js` ("DEF-04: cobrar una suscripción cancelada...", "...pausada..."); CP-34 pasa en ejecución 2.

## DEF-05 — Pedidos aceptados y descontados pese a stock insuficiente (clamp a 0)

- **Módulo:** pedidos / inventario
- **Requerimiento afectado:** RF-10 (descuento automático por receta), RF-11 (alerta de nivel mínimo)
- **Severidad:** Mayor
- **Prioridad:** Alta
- **Precondiciones:** insumo "Harina" con `cantidadDisponible=0.5kg`, receta de "Pan francés" requiere 1kg de Harina por unidad.
- **Pasos de reproducción:**
  1. Verificar receta e insumo (`GET /inventario/recetas/1`, `GET /inventario/insumos`).
  2. `POST /pedidos` con 1 unidad de "Pan francés" (cliente).
  3. Verificar insumos tras el pedido.
- **Resultado esperado:** el pedido debería rechazarse o, como mínimo, señalar el faltante real (déficit de 0.5kg) en vez de ocultarlo.
- **Resultado obtenido:** 201 Created; Harina queda en `cantidadDisponible: 0` (en vez de -0.5), ocultando la magnitud real del faltante; el pedido se acepta sin ninguna advertencia.
- **Evidencia:** `docs/defectos/evidencia/DEF-05.txt`
- **Causa raíz:** `db/01_schema.sql:317-337` (`trg_fn_descontar_inventario`) usa `GREATEST(0, cantidadDisponible - requerido*cantidad)`, y ningún endpoint de `pedidos.routes.js` valida disponibilidad de insumos antes de confirmar el pedido.
- **Estado:** Abierto (fuera del alcance de esta corrección; CP-35 debe seguir fallando).

## DEF-06 — Registro duplicado con el mismo correo en distinta capitalización

- **Módulo:** auth
- **Requerimiento afectado:** unicidad de correo (soporte de RF-20/RF-21, control de identidad)
- **Severidad:** Mayor
- **Prioridad:** Media
- **Pasos de reproducción:**
  1. `POST /auth/registro` con `correo: "qa.tester2@elfrutal-test.com"` → 201 (`idUsuario=66`).
  2. `POST /auth/registro` con `correo: "QA.Tester2@elfrutal-test.com"` (mismo correo, distinta capitalización) → 201 (`idUsuario=67`).
  3. Ambas cuentas inician sesión de forma independiente, cada una con su propio `idCliente`.
- **Resultado esperado:** 400 "Correo en uso" en el segundo registro.
- **Resultado obtenido:** dos cuentas/clientes completamente distintos para lo que el negocio considera el mismo correo.
- **Evidencia:** `docs/defectos/evidencia/DEF-06.txt`
- **Causa raíz:** `src/auth/routes/auth.routes.js:32` usa `findUnique({ where: { correo } })` con comparación exacta case-sensitive; no hay normalización a minúsculas ni restricción `UNIQUE` case-insensitive en `db/01_schema.sql`.
- **Estado:** Cerrado.
- **Corrección:** `src/auth/routes/auth.routes.js` (`/auth/registro` y `/auth/login` normalizan el correo con `trim()` + `toLowerCase()` antes de buscar/guardar); `db/01_schema.sql` y `db/migrations/2026-09-25_fix_defectos.sql` (`CREATE UNIQUE INDEX ... ON usuarios (LOWER("correo"))` como garantía a nivel de BD).
- **Verificación:** unitaria en `tests/auth.test.js` ("DEF-06: correo que difiere solo en mayúsculas..."); CP-36 pasa en ejecución 2. Nota: en el contenedor de base de datos local ya en ejecución, el índice único no pudo crearse en la primera pasada porque ya existían dos pares de cuentas de prueba con el mismo correo en distinta capitalización (evidencia original DEF-06 e datos generados por CP-36 en la ejecución 1); requiere depurar esos duplicados antes de poder crear el índice ahí (ver informe final).

## DEF-07 — Nombre > 100 caracteres responde 404 engañoso en vez de error de validación

- **Módulo:** catálogo
- **Requerimiento afectado:** RF-01 (nombre del producto)
- **Severidad:** Menor
- **Prioridad:** Media
- **Precondiciones:** producto existente (`idProducto=29`).
- **Pasos de reproducción:**
  1. `PUT /productos/29` con nombre normal → 200 (confirma que el producto existe).
  2. `PUT /productos/29` con un nombre de 300 caracteres → 404 `{"error":"Producto no encontrado."}`.
- **Resultado esperado:** 400 indicando que el nombre excede la longitud permitida.
- **Resultado obtenido:** 404, mensaje incorrecto que sugiere que el producto no existe (confirmado vía `docker logs`: el error real de Prisma es `P2000`, "value too long for the column's type"; la columna es `VARCHAR(100)`, `db/01_schema.sql:61`).
- **Evidencia:** `docs/defectos/evidencia/DEF-07.txt`
- **Causa raíz:** `src/catalogo/routes/catalogo.routes.js:79-100` no valida longitud de `nombre` y el `catch` (línea 97-98) mapea cualquier error de Prisma a 404, sin distinguir "no encontrado" de "dato inválido".
- **Estado:** Abierto (fuera del alcance de esta corrección; CP-37 debe seguir fallando).

## DEF-08 — `precio:null` crea producto gratuito (Q0.00) sin validación

- **Módulo:** catálogo
- **Requerimiento afectado:** RF-01 (precio ≥ 0, obligatorio)
- **Severidad:** Menor
- **Prioridad:** Media
- **Pasos de reproducción:**
  1. `POST /productos` con `{"nombre":"QA precio null","precio":null}` y token admin.
- **Resultado esperado:** 400 "El precio debe ser un número mayor o igual a 0." (mismo tratamiento que `precio` ausente).
- **Resultado obtenido:** 201 Created, producto creado con `precio: 0`.
- **Evidencia:** `docs/defectos/evidencia/DEF-08.txt`
- **Causa raíz:** `src/catalogo/routes/catalogo.routes.js:66-69` solo excluye `precio === undefined`, no `null`; `Number(null)` es `0`, que pasa la validación (mismo defecto en `PUT /:id`, línea 85-88).
- **Estado:** Cerrado.
- **Corrección:** `src/catalogo/routes/catalogo.routes.js` (misma función `precioValido` de DEF-01: trata `null`/`undefined`/`""` como ausente, aplicada en `POST /productos` y `PUT /productos/:id`).
- **Verificación:** unitaria en `tests/catalogo.test.js` ("DEF-08: precio null responde 400..."); CP-38 pasa en ejecución 2.

## DEF-09 — JSON malformado responde HTML en vez de error JSON

- **Módulo:** auth / catalogo / pedidos / pagos (transversal)
- **Requerimiento afectado:** consistencia del contrato de API (no ligado a un RF específico)
- **Severidad:** Menor
- **Prioridad:** Baja
- **Pasos de reproducción:**
  1. `POST /pedidos` (o `/productos`, `/auth/login`, etc.) con un cuerpo JSON incompleto, p. ej. `{"items":[`.
- **Resultado esperado:** 400 con cuerpo JSON `{"error": "..."}`, igual que el resto de la API.
- **Resultado obtenido:** 400 con `Content-Type: text/html`, cuerpo HTML por defecto de Express (`<pre>Bad Request</pre>`).
- **Evidencia:** `docs/defectos/evidencia/DEF-09.txt`
- **Causa raíz:** ninguno de los `app.js` de los 4 microservicios registra un middleware de manejo de errores para `express.json()`; se usa el manejador de error por defecto de Express.
- **Estado:** Cerrado.
- **Corrección:** `src/auth/app.js`, `src/catalogo/app.js`, `src/pedidos/app.js`, `src/pagos/app.js` — middleware de error añadido en los 4 (`err.type === "entity.parse.failed"` → 400 JSON `{"error": "JSON inválido"}`), seguido de la red de seguridad general de 500 JSON.
- **Verificación:** unitaria en `tests/auth.test.js`, `tests/catalogo.test.js`, `tests/pedidos.test.js`, `tests/pagos.test.js` ("DEF-09: cuerpo JSON malformado..." en cada uno); CP-39 pasa en ejecución 2.

## DEF-10 — `fechaEntrega` en el pasado aceptada sin validación

- **Módulo:** pedidos
- **Requerimiento afectado:** RF-04 (registro de pedidos, fechaEntrega)
- **Severidad:** Menor
- **Prioridad:** Baja
- **Pasos de reproducción:**
  1. `POST /pedidos` con `fechaEntrega: "2020-01-01"` (fecha del servidor: 2026) y token de cliente.
- **Resultado esperado:** 400, la fecha de entrega debe ser igual o posterior a hoy.
- **Resultado obtenido:** 201 Created, pedido registrado con fecha de entrega en el pasado.
- **Evidencia:** `docs/defectos/evidencia/DEF-10.txt`
- **Causa raíz:** `src/pedidos/routes/pedidos.routes.js:37-92` no valida `fechaEntrega`; no hay `CHECK` en la columna en `db/01_schema.sql`.
- **Estado:** Abierto (fuera del alcance de esta corrección; CP-40 debe seguir fallando).

---

## Observaciones (no defectos)

Comportamientos que no constituyen un defecto confirmado (no observados como incorrectos, riesgo teórico, o comportamiento aceptable/idempotente), documentados para trazabilidad:

1. **Esquema de Authorization no validado estrictamente.** Los tres middlewares `verificarToken` hacen `authHeader.split(" ")[1]` sin comprobar que la primera palabra sea literalmente `Bearer` — un header `Authorization: Bearrer <token>` (typo) o `Authorization: Foo <token>` es aceptado igual, siempre que el JWT sea válido. No es una vulnerabilidad de autorización (sigue exigiendo un JWT válido y firmado), solo una desviación menor del estándar RFC 6750.
2. **Cancelar un pedido ya cancelado es idempotente.** `PATCH /pedidos/:id/cancelar` sobre un pedido ya `cancelado` responde 200 sin error (el trigger de BD permite la auto-transición `cancelado -> cancelado`). Esto genera un envío de notificación duplicado en cada llamada, pero no corrompe datos ni cambia el estado. Se considera comportamiento aceptable/idempotente, no un defecto.
3. **Mismo patrón de "reportes sin validar fecha + sin try/catch" en otros endpoints.** `GET /reportes/inventario`, `GET /reportes/ventas/excel` y el resto de `reportes.routes.js` comparten el código de `rangoFechas()` y carecen de `try/catch`, por lo que muy probablemente son vulnerables al mismo crash que DEF-02. No se volvieron a probar individualmente para evitar caídas de servicio innecesarias durante la sesión de pruebas; se recomienda que el equipo de desarrollo lo trate junto con DEF-02 como una sola corrección sistémica (agregar validación de fecha + manejo de errores global).
4. **`rangoFechas` con `desde > hasta`** simplemente retorna listas vacías (sin error), lo cual es un comportamiento razonable, no un defecto.
5. **Redondeo de precios a 2 decimales.** `precio: 1.239` se redondea silenciosamente a `1.24` (columna `DECIMAL(10,2)`). Es el comportamiento esperado para una columna monetaria; no se probó a fondo la UI del frontend (cálculo de carrito, redondeo visual) por estar fuera del alcance de esta sesión centrada en el API.
6. **Producto con precio extremadamente alto (`1e20`)** no se llegó a probar tras el hallazgo de DEF-01 (se prefirió no seguir enviando valores no finitos al endpoint sin `try/catch` para no generar caídas adicionales innecesarias del servicio).
7. **No se probó concurrencia real** (10 pedidos simultáneos contra el mismo insumo, cancelación en paralelo con cambio de estado) por límite de tiempo de la sesión; dado que cada operación de escritura relevante corre dentro de una transacción de Postgres con el trigger de descuento a nivel de fila, el riesgo de condición de carrera es bajo pero no fue verificado empíricamente.
8. **No se probó el frontend (`src/frontend`)** de forma interactiva (cálculo de carrito, persistencia, redondeo visual) — el alcance de esta sesión se centró en los 4 microservicios backend, donde se hallaron suficientes defectos reproducibles como para priorizar esa capa primero.

---

## Métricas

### Por severidad
| Severidad | Cantidad |
|---|---|
| Bloqueante | 2 |
| Crítica | 2 |
| Mayor | 2 |
| Menor | 4 |
| **Total** | **10** |

### Por módulo
| Módulo | Cantidad |
|---|---|
| catálogo | 3 (DEF-01, DEF-07, DEF-08) |
| pedidos | 3 (DEF-02, DEF-05, DEF-10) |
| auth | 1 (DEF-06) — más 1 transversal (DEF-03) y 1 transversal (DEF-09) |
| pagos | 1 (DEF-04) — más comparte DEF-03 |
| transversal (auth+catalogo+pedidos+pagos) | 2 (DEF-03, DEF-09) |

Nota: DEF-03 y DEF-09 afectan a los 4 microservicios simultáneamente por compartir el mismo patrón de código copiado (`verificarToken.js` y ausencia de manejador de errores JSON, respectivamente); se contabilizan una vez cada uno en la tabla de severidad y se listan en todos los módulos afectados en la tabla "por módulo" para trazabilidad.
