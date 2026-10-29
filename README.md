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

**Ramas y ambientes.** Usamos tres ramas fijas y cada una representa un ambiente:

| Rama | Ambiente | Qué contiene |
|---|---|---|
| `dev` | Integración | Donde se junta el trabajo de todos. Recibe los PR de las ramas de trabajo. |
| `qa` | Validación | Solo lo que ya se integró en `dev`. Aquí se valida antes de pasar a producción. |
| `main` | Producción (Azure) | Lo que se fusiona aquí se despliega a Azure. |

**Flujo de promoción.** Cada cambio se hace en una rama de trabajo que sale de `dev` (`feature/*`, `fix/*`, `ci/*`, `test/*`, `docs/*`) y vuelve a `dev` por Pull Request. Cuando `dev` está estable se abre un PR de `dev` a `qa`, y cuando `qa` está validada, un PR de `qa` a `main`. No se hace push directo a ninguna de las tres ramas.

**Qué exige cada paso.** Las reglas de GitHub (rulesets "PROD (main)" y "QA y DEV") piden lo mismo para fusionar en `dev`, `qa` y `main`:

| Requisito | Por qué |
|---|---|
| Pull Request obligatorio | Todo cambio queda revisado y con historial. |
| 1 aprobación del otro integrante | Nadie aprueba su propio trabajo. |
| Si llegan commits nuevos, la aprobación anterior se descarta | Lo que se aprobó tiene que ser lo que se fusiona. |
| Conversaciones resueltas | Cada comentario de la revisión se contesta antes de fusionar. |
| Pipeline en verde (check `ccastellanosf-umg.panaderia-el-frutal` de Azure Pipelines) | No entra código que no compila, rompe pruebas o no pasa el quality gate. |
| Sin borrado de la rama ni force-push | El historial no se reescribe. |

**Qué corre el pipeline en cada caso.** El plan gratuito de SonarCloud solo analiza `main` y los Pull Requests, así que la etapa CalidadSonar no corre en los pushes a `dev` y `qa`:

| Evento | Etapas que corren |
|---|---|
| PR hacia `dev`, `qa` o `main` | Build, Test (pruebas unitarias con cobertura), CalidadSonar (análisis estático y quality gate de SonarCloud) y PruebasAPI (Postman con Newman). |
| Push a `dev` o `qa` (al fusionar un PR) | Build, Test y PruebasAPI. CalidadSonar se omite: ese código ya pasó el quality gate en su PR. |
| Push a `main` (al fusionar el PR de `qa`) | Todas las etapas, incluido Deploy a Azure. |

Si una etapa falla, incluido el quality gate, las siguientes no corren y no se despliega.

**Método de merge.** Siempre *Create a merge commit*, nunca Squash ni Rebase. Así cada commit conserva su autor y en el historial se ve qué PR trajo cada cambio. Los dos rulesets tienen "Allowed merge methods" limitado a Merge, así que GitHub no ofrece Squash ni Rebase.

## Azure DevOps

- **Azure Boards**: backlog organizado en Epics → Features → User Stories.
- **Azure Repos**: repositorio espejo, sincronizado con este repositorio de GitHub.
- **Azure Pipelines**: `azure-pipelines.yml`, con las etapas Build, Test, CalidadSonar, PruebasAPI y Deploy (ver "Calidad: pruebas, análisis estático y pipeline").
- **Azure Test Plans**: casos de prueba manual complementarios a las pruebas automáticas.

## Despliegue en Azure

Los nombres, la suscripción y la región se definen en `scripts/azure-config.sh` (sobrescribibles con variables de entorno).

1. `az login` y, una sola vez por suscripción: `./scripts/bootstrap-azure.sh`. Registra los proveedores, crea el grupo de recursos, PostgreSQL, ACR, el plan de App Service, la Static Web App y el monitoreo (Log Analytics, Application Insights y un grupo de acciones por correo; `ALERT_EMAILS` los destinatarios), y carga el esquema y los datos semilla. Los secretos se guardan fuera del repositorio, en `~/.elfrutal/azure-g3.secrets`.
2. `source ~/.elfrutal/azure-g3.secrets && ./scripts/deploy-azure.sh`: construye y publica las imágenes, crea o actualiza las App Services y despliega el frontend. Requiere psql 15 o superior: `--reset-db` y el bootstrap aplican las contraseñas de producción de los usuarios semilla con `\getenv`.
3. En Azure DevOps, crear la conexión de servicio `Conexion-ElFrutal-G3` y actualizar la variable secreta `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. `npm run test:e2e:azure` ejecuta las pruebas E2E contra el despliegue.

**Monitoreo.** Cada microservicio envía telemetría a Application Insights cuando existe `APPLICATIONINSIGHTS_CONNECTION_STRING` (el despliegue la configura; en local y en CI queda desactivada). `deploy-azure.sh` activa además el Health check de App Service sobre `/health` y una alerta por servicio (`HealthCheckStatus` < 100 durante 5 min) que avisa por correo. Costo: se usa la ingesta gratuita de 5 GB/mes con un tope diario de 0.1 GB y retención de 30 días; no se crean pruebas web de disponibilidad de Application Insights para evitar unos USD 40/mes.

## Calidad: pruebas, análisis estático y pipeline

### Pruebas unitarias y cobertura

Backend (Jest + supertest; las pruebas viven en `tests/` y se ejecutan desde cada servicio, que aporta sus dependencias):

```bash
npm ci                                # una vez, en la raíz: herramientas compartidas de pruebas
cd src/auth && npm ci                 # dependencias del servicio (auth y catalogo: luego npx prisma generate)
JWT_SECRET=clave-de-pruebas-no-productiva npx jest auth.test.js --roots ../../tests
```

Para los otros servicios, reemplazar `auth` por `catalogo`, `pedidos` o `pagos`. Las pruebas no necesitan base de datos: PostgreSQL, las notificaciones y los servicios externos se reemplazan por dobles de prueba.

Frontend (Vitest + Testing Library): `cd src/frontend && npm ci && npm test`.

Cobertura: agregar `--coverage` al comando de Jest, o `npm run test:coverage` en el frontend. Cada servicio mide `app.js`, `lib/`, `middlewares/` y `routes/` (configurado en `src/<servicio>/jest.config.js`; se excluye `index.js`, que solo arranca el servidor). El reporte queda en `coverage/` (texto en consola y `lcov.info`).

### Análisis estático (SonarCloud)

El proyecto se analiza en SonarCloud: https://sonarcloud.io/project/overview?id=ccastellanosf-umg_panaderia-el-frutal. La configuración está en `sonar-project.properties` y el análisis corre dentro del pipeline (etapa CalidadSonar) en los Pull Requests y en `main`; recibe la cobertura de la etapa de pruebas y, si el quality gate no se cumple, el pipeline falla y no se despliega.

### Pipeline (Azure Pipelines)

Etapas en orden: Build → Test (pruebas unitarias con cobertura) → CalidadSonar → PruebasAPI (Postman + Newman sobre un stack desechable de docker compose) → Deploy (solo `main`). Se ejecuta automáticamente en cada Pull Request y en cada push a `dev`, `qa` y `main`; también se puede lanzar a mano desde Azure DevOps → Pipelines → *Run pipeline*. En los pushes a `dev` y `qa` se omite CalidadSonar (el plan gratuito de SonarCloud solo analiza `main` y los Pull Requests): ese código ya pasó el quality gate en su PR.

El agente es self-hosted (pool `Default`) y necesita Java 17 (escáner de SonarCloud, con `JAVA_HOME` en el `.env` del agente), Docker Desktop en ejecución (etapa PruebasAPI) y acceso a internet: Node.js 20 no hace falta instalarlo, porque la tarea `UseNode@1` lo descarga a la caché de herramientas del agente. Las tareas de SonarCloud están fijadas en la versión 3.4.3 (`SonarCloudPrepare@3.4.3`, etc.), así que una versión nueva de la extensión no cambia el análisis sin revisión: actualizarlas es manual, y una versión nueva del escáner puede exigir otra versión de Java.

### Pruebas de carga (k6)

`npm run test:carga:azure` ejecuta `tests/carga/carga.k6.js` contra Azure: rampa a 50 usuarios virtuales en 1 minuto, 5 minutos sostenidos, sobre `GET /productos` y `GET /pedidos/mios`. Requiere k6 y `az login`; toma las credenciales del cliente semilla de `~/.elfrutal/azure-g3.secrets`. Cada corrida deja `resumen.md`, `resumen.json` y `reporte.html` en su propia carpeta de `test-results/carga/`.

Para medir el rendimiento en condiciones normales (RNF-01) se usa el mismo script con un solo usuario durante 1 minuto: `k6 run --vus 1 --duration 1m tests/carga/carga.k6.js`, con las mismas variables de entorno que exporta `scripts/carga-azure.sh` (`AUTH_URL`, `CATALOGO_URL`, `PEDIDOS_URL`, `K6_CORREO` y `K6_CONTRASENA`). En k6, `--vus` y `--duration` reemplazan los `stages` del script.

## Licencia y uso académico

Proyecto desarrollado con fines académicos para el Seminario de Trabajo de Graduación de la Universidad Mariano Gálvez de Guatemala. No distribuido con fines comerciales.
