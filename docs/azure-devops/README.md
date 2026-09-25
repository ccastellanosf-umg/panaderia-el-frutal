# Importación a Azure DevOps (E5)

Archivos generados con `node scripts/azure-devops/generar-csv.js` a partir de las fuentes reales del repositorio (diseño E3, `tests/e2e/README.md`, `docs/defectos/defectos.md` y los reportes JUnit de las dos ejecuciones). Si alguna fuente cambia, se vuelve a ejecutar el script.

| Archivo | Contenido |
|---|---|
| `casos-prueba.csv` | 40 casos de prueba (CP-01 a CP-40) con precondición, datos, pasos, resultado esperado, prioridad y etiquetas de requerimiento y técnica |
| `bugs.csv` | 10 defectos (DEF-01 a DEF-10) con severidad, prioridad, pasos de reproducción, resultado esperado, resultado obtenido y evidencia |
| `resultados-ejecuciones.csv` | Resultado de cada caso en la ejecución 1 (antes de las correcciones) y en la ejecución 2 (después de las correcciones) |

## 1. Casos de prueba

1. **Test Plans** → crear el plan *Fase 1 — Panadería El Frutal* y una suite estática.
2. En la suite: **⋯ → Import test cases** → seleccionar `casos-prueba.csv` → revisar el mapeo de columnas → importar.
3. Alternativa: **Boards → Work items → Import Work Items** con el mismo archivo y luego agregar los casos existentes a la suite.

## 2. Bugs

1. **Boards → Work items → Import Work Items** → `bugs.csv`.
2. Los bugs se crean en estado *New*. Luego se editan en bloque:
   - DEF-01, DEF-02, DEF-04, DEF-06, DEF-08 y DEF-09 → *Closed* (corregidos en el commit `ba82dcd`).
   - DEF-03, DEF-05, DEF-07 y DEF-10 → *Active*.
3. Adjuntar a cada bug su evidencia: `docs/defectos/evidencia/DEF-XX.txt`.
4. Vincular cada bug con su caso de prueba (*Add link → Tested By*): DEF-01 ↔ CP-31, …, DEF-10 ↔ CP-40.

## 3. Ejecuciones

Registrar dos ejecuciones en **Test Plans → Execute**, marcando cada caso como *Passed* o *Failed* según `resultados-ejecuciones.csv`:

| Ejecución | Aprobados | Fallidos | Tasa de aprobación |
|---|---|---|---|
| 1 (antes de las correcciones) | 30 | 10 | 75.0 % |
| 2 (después de las correcciones) | 36 | 4 | 90.0 % |

Adjuntar a cada ejecución su reporte JUnit: `docs/defectos/ejecucion-1-junit.xml` y `docs/defectos/ejecucion-2-junit.xml`.

> Los reportes JUnit contienen además la prueba DEF-09 de formato de correo (41 pruebas en total); por eso `docs/defectos/defectos.md` reporta 41 ejecutadas (31/10 y 37/4). En Test Plans se registran solo los 40 casos formales.

## Carga automática

Todo lo anterior se puede hacer con un solo comando (plan, 40 casos, 10 bugs con evidencia y enlace *Tested By*, y las tres ejecuciones con su reporte JUnit adjunto):

```bash
AZURE_DEVOPS_TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv) node scripts/azure-devops/cargar-azure-devops.js
```

El script se detiene si el plan ya existe, para no duplicar elementos. La carga del 25/09/2026 creó el plan 63 (ejecuciones 2, 4 y 6).
