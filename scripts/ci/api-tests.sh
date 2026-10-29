#!/usr/bin/env bash
# ============================================================
# scripts/ci/api-tests.sh
# Pruebas de API (Postman + Newman). Levanta un stack desechable de
# docker-compose (override de CI, sin puertos publicados), espera los
# 4 /health, ejecuta la colección con Newman DENTRO de la red de
# compose, copia el reporte JUnit al host y siempre destruye el stack.
#
# Variables de entorno:
#   COMPOSE_PROJECT_NAME  Nombre del proyecto compose (por defecto único
#                         por ejecución: elfrutal-api-<epoch>-<pid>).
#   JWT_SECRET, DB_PASSWORD  Requeridos por docker-compose.yml. Si no se
#                         definen se generan al azar: el stack y su base
#                         de datos son desechables.
#
# Código de salida: el de Newman (0 = todas las aserciones pasaron);
# 2 si la infraestructura no levantó.
# ============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-elfrutal-api-$(date +%s)-$$}"
export COMPOSE_PROJECT_NAME
export JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
export DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 16)}"

NEWMAN_IMAGE="postman/newman:6.1.3-alpine"
NEWMAN_CONTAINER="${COMPOSE_PROJECT_NAME}-newman"
NETWORK="${COMPOSE_PROJECT_NAME}_default"
REPORT_DIR="test-results/api"
REPORT_FILE="${REPORT_DIR}/newman-junit.xml"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ci.yml)

cleanup() {
  echo "== Limpiando (${COMPOSE_PROJECT_NAME}) =="
  docker rm -f "${NEWMAN_CONTAINER}" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap cleanup EXIT

echo "== Construyendo y levantando el stack (${COMPOSE_PROJECT_NAME}) =="
if ! "${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 \
  db redis auth catalogo pedidos pagos; then
  echo "== Falla de infraestructura: el stack no quedó saludable =="
  "${COMPOSE[@]}" logs --tail=100 auth catalogo pedidos pagos || true
  exit 2
fi

# --wait ya espera los healthchecks de compose; se confirman además los
# 4 /health desde la red, que es lo que consumirá Newman.
echo "== Esperando los /health de los 4 servicios =="
for servicio in "auth:3001" "catalogo:3002" "pedidos:3003" "pagos:3004"; do
  ok=0
  for _ in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T "${servicio%%:*}" \
      node -e "fetch('http://localhost:${servicio##*:}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 2
  done
  if [[ "${ok}" -ne 1 ]]; then
    echo "== Falla de infraestructura: ${servicio%%:*} no responde en /health =="
    exit 2
  fi
  echo "   ${servicio%%:*}: ok"
done

echo "== Ejecutando Newman (${NEWMAN_CONTAINER}) =="
mkdir -p "${REPORT_DIR}"
# Sin bind mounts (el daemon puede estar en otra VM): la colección se
# copia al contenedor con `docker cp` y el reporte se copia de vuelta.
docker create --name "${NEWMAN_CONTAINER}" --network "${NETWORK}" "${NEWMAN_IMAGE}" \
  run /api/elfrutal.postman_collection.json \
  -e /api/ci.postman_environment.json \
  --reporters cli,junit \
  --reporter-junit-export /out/newman-junit.xml >/dev/null
docker cp tests/api "${NEWMAN_CONTAINER}:/api"
status=0
docker start -a "${NEWMAN_CONTAINER}" || status=$?

docker cp "${NEWMAN_CONTAINER}:/out/newman-junit.xml" "${REPORT_FILE}" || true

# Newman sale con 1 cuando fallan aserciones; sin reporte, no corrió bien.
if [[ ! -f "${REPORT_FILE}" ]]; then
  echo "== Falla de infraestructura: Newman no generó el reporte JUnit =="
  [[ "${status}" -eq 0 ]] && status=2
fi

echo "== Resumen =="
echo "Proyecto:   ${COMPOSE_PROJECT_NAME}"
echo "Newman:     código de salida ${status}"
echo "Reporte:    ${REPORT_FILE}"
exit "${status}"
