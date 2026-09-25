# Suite E2E — Fase 1 (`casos-prueba.e2e.test.js`)

Ejecuta un test por cada caso de prueba (CP-01 a CP-40) del documento
de QA, contra los cuatro microservicios **en ejecución** (por defecto
`docker compose up`, o Azure más adelante vía las variables de
entorno). CP-31..CP-40 verifican el comportamiento CORRECTO esperado
para cada uno de los defectos DEF-01..DEF-10 documentados en
`docs/defectos/defectos.md`.

```bash
npm run test:e2e
```

## Variables de entorno

| Variable        | Default                 | Uso                                   |
|-----------------|--------------------------|----------------------------------------|
| `AUTH_URL`      | `http://localhost:3001`  | Microservicio de autenticación         |
| `CATALOGO_URL`  | `http://localhost:3002`  | Microservicio de catálogo              |
| `PEDIDOS_URL`   | `http://localhost:3003`  | Microservicio de pedidos e inventario  |
| `PAGOS_URL`     | `http://localhost:3004`  | Microservicio de pagos y suscripciones |
| `DATABASE_URL`  | *(ninguno)*               | Habilita CP-19, CP-22, CP-23, CP-27, CP-28 (requieren manipular la BD para el setup); sin ella esos casos se marcan `skipped`. |

Requiere que la base de datos ya tenga cargados `db/01_schema.sql` y
`db/02_seed.sql` (usuarios semilla admin/ventas/producción y al menos
el producto `idProducto=1`).

## Mapa CP → endpoint

| Caso  | Endpoint                                              | Servicio  |
|-------|--------------------------------------------------------|-----------|
| CP-01 | `POST /auth/registro`                                   | auth      |
| CP-02 | `POST /auth/registro` (correo duplicado)                 | auth      |
| CP-03 | `POST /auth/registro` (contraseña < 8)                    | auth      |
| CP-04 | `POST /auth/registro` (contraseña = 8)                    | auth      |
| CP-05 | `POST /auth/login`                                       | auth      |
| CP-06 | `POST /auth/login` (credenciales inválidas)                | auth      |
| CP-07 | `POST /productos` (cliente → 403)                       | catalogo  |
| CP-08 | `POST /productos` (administrador → 201)                 | catalogo  |
| CP-09 | `POST /productos` (precio 15.50)                        | catalogo  |
| CP-10 | `POST /productos` (precio 0)                             | catalogo  |
| CP-11 | `POST /productos` (precio -0.01 → 400)                    | catalogo  |
| CP-12 | `PATCH /productos/:id/disponibilidad`                   | catalogo  |
| CP-13 | `GET /productos`                                         | catalogo  |
| CP-14 | `POST /pedidos`                                          | pedidos   |
| CP-15 | `POST /pedidos` (items vacío → 400)                        | pedidos   |
| CP-16 | `PATCH /pedidos/:id/estado` (recibido→en_preparacion)     | pedidos   |
| CP-17 | `PATCH /pedidos/:id/estado` (recibido→entregado → 409)     | pedidos   |
| CP-18 | `PATCH /pedidos/:id/estado` (entregado→en_preparacion → 409) | pedidos |
| CP-19 | notificación tras `PATCH /pedidos/:id/estado`             | pedidos   |
| CP-20 | `PATCH /pedidos/:id/cancelar` (desde recibido)             | pedidos   |
| CP-21 | `PATCH /pedidos/:id/cancelar` (desde en_preparacion → 409)  | pedidos   |
| CP-22 | descuento de inventario (`trg_descontar_inventario`)      | pedidos   |
| CP-23 | `GET /inventario/alertas`                                 | pedidos   |
| CP-24 | `POST /suscripciones`                                    | pagos     |
| CP-25 | `POST /suscripciones/:id/cobrar` (aprobado)               | pagos     |
| CP-26 | `POST /suscripciones/:id/cobrar` (rechazado)               | pagos     |
| CP-27 | `PATCH /suscripciones/:id/cancelar` (72h → 200)            | pagos     |
| CP-28 | `PATCH /suscripciones/:id/cancelar` (12h → 409)             | pagos     |
| CP-29 | `GET /reportes/ventas`                                    | pedidos   |
| CP-30 | `GET /reportes/sugerencia-produccion`                     | pedidos   |

## CP-31..CP-40 — defectos DEF-01..DEF-10

| CP    | RF/RNF                        | Técnica de prueba                | Datos de prueba                                                        | Resultado esperado                                                    | DEF asociado |
|-------|--------------------------------|-----------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|--------------|
| CP-31 | RF-01                          | Partición de equivalencia (valores no numéricos/no finitos) | `POST /productos` con `precio:"Infinity"`                              | 400 y catalogo permanece operativo (`GET /health` = 200 tras el sondeo) | DEF-01 (Cerrado) |
| CP-32 | RF-17                          | Partición de equivalencia (formato de fecha inválido)       | `GET /reportes/ventas?desde=no-es-fecha&hasta=2026-12-31`               | 400 y pedidos permanece operativo (`GET /health` = 200 tras el sondeo) | DEF-02 (Cerrado) |
| CP-33 | RF-21, RNF-02                  | Transición de estados (sesión activa -> cerrada)             | login admin, `POST /auth/logout`, reutilizar el mismo token en catalogo/pedidos/pagos | 401 en los tres servicios (igual que en auth)                          | DEF-03 (Abierto) |
| CP-34 | RF-16                          | Transición de estados (suscripción cancelada)                 | `POST /suscripciones/:id/cobrar` sobre una suscripción con `estado='cancelada'` | 409 y no se inserta un nuevo registro en `pagos`                       | DEF-04 (Cerrado) |
| CP-35 | RF-10, RF-11                   | Análisis de valores límite (stock insuficiente para 1 unidad) | insumo con `cantidadDisponible=0.5`, receta requiere 1; `POST /pedidos` de 1 unidad | 409 y `cantidadDisponible` permanece en 0.5 (no se descuenta)          | DEF-05 (Abierto) |
| CP-36 | unicidad de correo (RF-20/21)  | Partición de equivalencia (formato/capitalización de correo)  | registrar un correo, luego registrar la misma dirección con distinta capitalización | 400 `"Correo en uso"` en el segundo registro                           | DEF-06 (Cerrado) |
| CP-37 | RF-01                          | Análisis de valores límite (longitud de `nombre`, límite 100) | `PUT /productos/:id` con `nombre` de 101 caracteres                    | 400 de validación (nunca 404/500)                                      | DEF-07 (Abierto) |
| CP-38 | RF-01                          | Partición de equivalencia (precio ausente/null)                | `POST /productos` con `precio:null`                                    | 400                                                                       | DEF-08 (Cerrado) |
| CP-39 | consistencia del contrato de API | Tabla de decisión (Content-Type × validez del cuerpo)         | `POST /pedidos` con cuerpo `'{"items":['` (JSON incompleto)             | 400 con cuerpo JSON `{"error": "..."}` (nunca HTML)                    | DEF-09 (Cerrado) |
| CP-40 | RF-04                          | Análisis de valores límite (fechaEntrega pasada vs. hoy)       | `POST /pedidos` con `fechaEntrega:"2020-01-01"`                         | 400                                                                       | DEF-10 (Abierto) |

## CP-41..CP-42 — cobertura directa de RF-12 y RF-18

| CP    | RF    | Técnica de prueba          | Datos de prueba | Resultado esperado |
|-------|-------|-----------------------------|-----------------|--------------------|
| CP-41 | RF-12 | Partición de equivalencia (registro válido) | operador de producción; `POST /inventario/produccion` con `idProducto:1`, fecha de hoy, `cantidadProducida:40` | 201 y el registro aparece en `GET /inventario/produccion` del día |
| CP-42 | RF-18 | Partición de equivalencia (rango de fechas válido) | administrador; `GET /reportes/inventario` con desde = hasta = hoy | 200 con insumos, críticos y mermas; merma = producido − vendido |

El resultado también se exporta a `test-results/e2e-junit.xml`
(formato JUnit) para subirlo a Azure Test Plans.
