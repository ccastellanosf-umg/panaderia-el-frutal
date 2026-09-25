# Suite E2E — Fase 1 (`casos-prueba.e2e.test.js`)

Ejecuta un test por cada caso de prueba (CP-01 a CP-30) del documento
de QA, contra los cuatro microservicios **en ejecución** (por defecto
`docker compose up`, o Azure más adelante vía las variables de
entorno).

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

El resultado también se exporta a `test-results/e2e-junit.xml`
(formato JUnit) para subirlo a Azure Test Plans.
