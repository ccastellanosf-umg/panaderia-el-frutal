# SonarCloud — estado inicial (línea base de la Fase 2)

- Proyecto: `ccastellanosf-umg_panaderia-el-frutal` (https://sonarcloud.io/project/overview?id=ccastellanosf-umg_panaderia-el-frutal)
- Análisis: 2026-10-17 14:00 UTC, rama `main`, commit `bc2575f`, análisis automático de SonarCloud
- Extraído de la API pública de SonarCloud el 2026-10-24, antes de cualquier remediación
- Datos completos: `medidas.json`, `quality-gate.json` y `hallazgos.json` en esta carpeta

## Métricas generales

| Métrica | Valor |
|---|---|
| Líneas de código | 8715 |
| Bugs | 0 (Reliability A) |
| Vulnerabilidades | 42 (Security **E**) |
| Code smells | 182 (Maintainability A) |
| Security hotspots | 0 |
| Duplicación | 8.1 % (34 bloques) |
| Deuda técnica | 4333 min (≈ 72 h; ratio 1.7 %) |
| Quality gate | **Failed** |

## Hallazgos abiertos: 224

| Severidad | Cantidad |
|---|---|
| Blocker | 58 |
| Critical | 20 |
| Major | 59 |
| Minor | 87 |

## Blocker y Critical por regla

| Regla | Severidad | Tipo | Cant. | Archivo |
|---|---|---|---|---|
| `plsql:QuotedIdentifiersCheck` — identificadores entre comillas | Blocker | Code smell | 54 | `db/01_schema.sql` |
| `secrets:S8215` — hashes de contraseñas expuestos | Blocker | Vulnerabilidad | 4 | `db/02_seed.sql` |
| `plsql:S1192` — literales repetidos | Critical | Code smell | 11 | `db/01_schema.sql` (10), `db/roles/usuario_app.sql` (1) |
| `groovydre:S134` — anidamiento excesivo | Critical | Code smell | 5 | `Jenkinsfile` |
| `groovydre:S1192` — literales repetidos | Critical | Code smell | 2 | `Jenkinsfile` |
| `shelldre:S131` — `case` sin rama `*)` | Critical | Code smell | 2 | `scripts/azure-config.sh`, `scripts/ci/deploy-staging.sh` |

## Condiciones del quality gate (código nuevo)

| Condición | Umbral | Valor | Estado |
|---|---|---|---|
| Security rating | A | E | Failed |
| Duplicación | ≤ 3 % | 8.3 % | Failed |
| Reliability rating | A | A | OK |
| Maintainability rating | A | A | OK |
| Security hotspots revisados | 100 % | 100 % | OK |
