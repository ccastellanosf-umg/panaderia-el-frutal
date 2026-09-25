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

## Control de versiones

El equipo trabaja con **GitHub Flow**: la rama `main` se mantiene siempre desplegable; cada historia de usuario se desarrolla en una rama `feature/<historia>-<descripcion-breve>` y se integra mediante Pull Request, el cual dispara automáticamente las etapas de Build y Test del pipeline (`azure-pipelines.yml`).

## Azure DevOps

- **Azure Boards**: backlog organizado en Epics → Features → User Stories.
- **Azure Repos**: repositorio espejo, sincronizado con este repositorio de GitHub.
- **Azure Pipelines**: `azure-pipelines.yml`, con las etapas Build, Test y Deploy.
- **Azure Test Plans**: casos de prueba manual complementarios a las pruebas automáticas.

## Licencia y uso académico

Proyecto desarrollado con fines académicos para el Seminario de Trabajo de Graduación de la Universidad Mariano Gálvez de Guatemala. No distribuido con fines comerciales.
