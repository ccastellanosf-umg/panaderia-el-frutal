#!/usr/bin/env bash
# ============================================================
# scripts/ci/deploy-staging.sh
# Deploys/updates the persistent local staging stack
# (project name: elfrutal-staging) and smoke-tests the four
# microservices' /health endpoints on their published ports
# (4001-4004). Run by the Jenkinsfile's "Deploy Staging" stage
# only on the `main` branch; Azure production deploys stay in
# azure-pipelines.yml and are unaffected by this.
#
# Env:
#   JWT_SECRET, DB_PASSWORD  Required by docker-compose.yml (no defaults).
#   STAGING_HOST             Host to smoke-test against (default: localhost).
#                            Jenkins uses host.docker.internal to reach the
#                            published ports from inside its own container.
# ============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

STAGING_HOST="${STAGING_HOST:-localhost}"
PROJECT_NAME="elfrutal-staging"

COMPOSE=(docker compose -p "${PROJECT_NAME}" -f docker-compose.yml -f docker-compose.staging.yml)

echo "== Building and starting the staging stack (${PROJECT_NAME}) =="
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 \
  db redis auth catalogo pedidos pagos

# Not an associative array: the default /bin/bash on macOS is
# 3.2, which does not support `declare -A`.
service_port() {
  case "$1" in
    auth) echo 4001 ;;
    catalogo) echo 4002 ;;
    pedidos) echo 4003 ;;
    pagos) echo 4004 ;;
  esac
}

echo "== Smoke-testing /health on ${STAGING_HOST} =="
failed=0
for service in auth catalogo pedidos pagos; do
  port="$(service_port "${service}")"
  url="http://${STAGING_HOST}:${port}/health"
  ok=0
  for attempt in $(seq 1 10); do
    if curl -sf --max-time 5 "${url}" >/dev/null; then
      ok=1
      break
    fi
    echo "  ${service} (${url}) not ready yet, attempt ${attempt}/10..."
    sleep 3
  done
  if [ "${ok}" -eq 1 ]; then
    echo "  OK   ${service}: ${url}"
  else
    echo "  FAIL ${service}: ${url} never returned healthy"
    failed=1
  fi
done

if [ "${failed}" -ne 0 ]; then
  echo "== Staging deploy FAILED: one or more services are unhealthy =="
  exit 1
fi

echo "== Staging deploy OK =="
echo "auth:     http://${STAGING_HOST}:4001"
echo "catalogo: http://${STAGING_HOST}:4002"
echo "pedidos:  http://${STAGING_HOST}:4003"
echo "pagos:    http://${STAGING_HOST}:4004"
