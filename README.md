# Transformación Digital para Panadería El Frutal

Proyecto de Seminario de Trabajo de Graduación — Universidad Mariano Gálvez de Guatemala
Facultad de Ingeniería en Sistemas de Información — Grupo 3

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Walter Estuardo Elías Ochoa |
| Scrum Master | Osman Ronaldo Cumes Jimenez |
| Development Team | Cristian René Castellanos Farfán |
| Development Team | Kleiver Jedidias García Guarcas |

## Arquitectura

El backend se implementa como un conjunto de **microservicios** independientes, cada uno con su propio Dockerfile:

| Microservicio | Puerto | Estado | Sprint |
|---|---|---|---|
| `auth` | 3001 | Implementado | Sprint 1 |
| `catalogo` | 3002 | Implementado | Sprint 1 |
| `pedidos` | 3003 | Scaffolding (solo `/health`) | Sprint 2 |
| `pagos` | 3004 | Scaffolding (solo `/health`) | Sprint 3 |

El frontend (React) no se contenedoriza: se despliega directamente en **Azure Static Web Apps**. La base de datos es **PostgreSQL 16**, y **Redis** se usa para caché de lecturas del catálogo y control de sesiones del servicio de autenticación.

Ver el detalle completo de la arquitectura en [`/docs/DevOps1_Panaderia_El_Frutal.pdf`](./docs/DevOps1_Panaderia_El_Frutal.pdf).

## Estructura del repositorio

```
panaderia-el-frutal/
├── src/
│   ├── auth/            # Microservicio de autenticación (Node.js/Express + Prisma)
│   ├── catalogo/         # Microservicio de catálogo digital
│   ├── pedidos/          # Microservicio de pedidos (scaffolding, Sprint 2)
│   ├── pagos/            # Microservicio de pagos (scaffolding, Sprint 3)
│   └── frontend/         # Cliente Web (React)
├── docker/
│   ├── auth/Dockerfile
│   ├── catalogo/Dockerfile
│   ├── pedidos/Dockerfile
│   └── pagos/Dockerfile
├── docs/                 # Documentación del proyecto (UML, base de datos, DevOps)
├── tests/                # Pruebas unitarias e de integración (Jest)
├── docker-compose.yml
├── azure-pipelines.yml
├── db/
│   ├── 01_schema.sql     # antes panaderia_el_frutal_script.sql
│   └── 02_seed.sql       # datos semilla (usuarios, catálogo, insumos)
├── .gitignore
├── .env.example
└── README.md
```

## Cómo levantar el entorno local

1. Clonar el repositorio y copiar la plantilla de variables de entorno:
   ```bash
   cp .env.example .env
   ```
   Completar `.env` con una contraseña de base de datos y un `JWT_SECRET` propios.

2. Levantar todos los servicios (PostgreSQL, Redis y los cuatro microservicios):
   ```bash
   docker compose up --build
   ```

3. Verificar que cada servicio responde:
   ```bash
   curl http://localhost:3001/health   # auth
   curl http://localhost:3002/health   # catalogo
   curl http://localhost:3003/health   # pedidos
   curl http://localhost:3004/health   # pagos
   ```

4. La base de datos se inicializa automáticamente con `db/01_schema.sql` (tablas, funciones,
   disparadores, procedimientos y vistas) y `db/02_seed.sql` (usuarios, catálogo, insumos,
   planes e historial de ventas) la primera vez que se crea el contenedor `db`. Credenciales
   semilla: `admin@elfrutal.com` / `Admin1234`, `ventas@elfrutal.com` / `Ventas1234`,
   `produccion@elfrutal.com` / `Produccion1234`, `cliente@elfrutal.com` / `Cliente1234`.
   Estas contraseñas son solo del entorno local. En Azure son distintas: se guardan como
   `SEED_<ROL>_PASSWORD` en `~/.elfrutal/azure-g3.secrets`, que el equipo comparte por un
   canal privado, y `scripts/e2e-azure.sh` y `scripts/carga-azure.sh` las leen de ahí.

5. Pruebas end-to-end contra el stack ya levantado:
   ```bash
   npm run test:e2e
   ```
   Ver `tests/e2e/README.md` para el mapeo de casos de prueba (CP-01..CP-30) a endpoints.

6. Levantar el frontend (React + Vite) en modo desarrollo, con el stack de microservicios
   ya corriendo:
   ```bash
   cd src/frontend && npm install && npm run dev
   ```
   Por defecto consume `http://localhost:3001..3004`; para apuntar a otras URLs, copiar
   `src/frontend/.env.example` como `.env` y ajustar `VITE_AUTH_URL`, `VITE_CATALOGO_URL`,
   `VITE_PEDIDOS_URL` y `VITE_PAGOS_URL`. Credenciales semilla para iniciar sesión:
   `admin@elfrutal.com` / `Admin1234`, `ventas@elfrutal.com` / `Ventas1234`,
   `produccion@elfrutal.com` / `Produccion1234`, `cliente@elfrutal.com` / `Cliente1234`.

## Pruebas de API (Postman + Newman)

La colección `tests/api/elfrutal.postman_collection.json` (21 requests, 63 aserciones) valida código de estado, esquema JSON y contenido de cada respuesta. Cubre: salud de los 4 servicios, un flujo de negocio encadenado con variables de colección (registro de un cliente nuevo, login, catálogo, pedido, historial, cambios de estado por ventas, logout y token revocado) y casos negativos (401, 403 y contraseña incorrecta). Cada ejecución registra un cliente con correo único, por lo que es repetible.

Ejecución local contra `docker compose up` (puertos 3001..3004 publicados):

```bash
npm run test:api   # usa npx newman@6.1.3 y tests/api/local.postman_environment.json
```

Sin dependencias locales, con un stack desechable (igual que el pipeline): `bash scripts/ci/api-tests.sh` (genera `test-results/api/newman-junit.xml`).

El pipeline las ejecuta en la etapa `PruebasAPI` (entre `CalidadSonar` y `Deploy`) y publica el reporte JUnit.

## Control de versiones

El equipo trabaja con **GitHub Flow**: la rama `main` se mantiene siempre desplegable; cada historia de usuario se desarrolla en una rama `feature/<historia>-<descripcion-breve>` y se integra mediante Pull Request, el cual dispara automáticamente las etapas de Build y Test del pipeline (`azure-pipelines.yml`).

## Azure DevOps

- **Azure Boards**: backlog organizado en Epics → Features → User Stories.
- **Azure Repos**: repositorio espejo, sincronizado con este repositorio de GitHub.
- **Azure Pipelines**: `azure-pipelines.yml`, con las etapas Build, Test y Deploy.
- **Azure Test Plans**: casos de prueba manual complementarios a las pruebas automáticas.

## Despliegue en Azure

Los nombres, la suscripción y la región se definen en `scripts/azure-config.sh` (sobrescribibles con variables de entorno).

1. `az login` y, una sola vez por suscripción: `./scripts/bootstrap-azure.sh`. Registra los proveedores, crea el grupo de recursos, PostgreSQL, ACR, el plan de App Service, la Static Web App y el monitoreo (Log Analytics, Application Insights y un grupo de acciones por correo; `ALERT_EMAILS` los destinatarios), y carga el esquema y los datos semilla. Los secretos se guardan fuera del repositorio, en `~/.elfrutal/azure-g3.secrets`.
2. `source ~/.elfrutal/azure-g3.secrets && ./scripts/deploy-azure.sh`: construye y publica las imágenes, crea o actualiza las App Services y despliega el frontend.
3. En Azure DevOps, crear la conexión de servicio `Conexion-ElFrutal-G3` y actualizar la variable secreta `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. `npm run test:e2e:azure` ejecuta las pruebas E2E contra el despliegue.

**Monitoreo.** Cada microservicio envía telemetría a Application Insights cuando existe `APPLICATIONINSIGHTS_CONNECTION_STRING` (el despliegue la configura; en local y en CI queda desactivada). `deploy-azure.sh` activa además el Health check de App Service sobre `/health` y una alerta por servicio (`HealthCheckStatus` < 100 durante 5 min) que avisa por correo. Costo: se usa la ingesta gratuita de 5 GB/mes con un tope diario de 0.1 GB y retención de 30 días; no se crean pruebas web de disponibilidad de Application Insights para evitar unos USD 40/mes.

## Licencia y uso académico

Proyecto desarrollado con fines académicos para el Seminario de Trabajo de Graduación de la Universidad Mariano Gálvez de Guatemala. No distribuido con fines comerciales.
