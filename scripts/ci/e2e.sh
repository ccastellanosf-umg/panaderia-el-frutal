#!/usr/bin/env bash
# ============================================================
# scripts/ci/e2e.sh
# Brings up the docker-compose stack (CI override) with no
# published ports, runs the E2E suite (tests/e2e) inside the
# compose network as a named container, copies the reports out,
# and always tears the stack down afterwards.
#
# Env:
#   COMPOSE_PROJECT_NAME  Compose project name (default: elfrutal-ci-local).
#                         Jenkins sets this to something unique per
#                         build so parallel/other stacks never collide.
#   JWT_SECRET, DB_PASSWORD  Required by docker-compose.yml (no defaults).
#
# Exit codes (the Jenkinsfile maps them to build results):
#   0  all E2E cases passed
#   1  the suite ran and some cases failed (EXPECTED right now: 4 open
#      defects — DEF-03/05/07/10 — fail on purpose) -> UNSTABLE
#   2  infrastructure problem (stack did not start, runner crashed,
#      no JUnit report produced) -> FAILED
# ============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-elfrutal-ci-local}"
export COMPOSE_PROJECT_NAME

# --profile e2e is needed for `run e2e` below: the e2e service is
# behind that profile so a plain `up` never starts it by accident.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ci.yml --profile e2e)
E2E_CONTAINER="${COMPOSE_PROJECT_NAME}-e2e"

cleanup() {
  echo "== Cleaning up (${COMPOSE_PROJECT_NAME}) =="
  "${COMPOSE[@]}" logs --tail=100 auth catalogo pedidos pagos || true
  docker rm -f "${E2E_CONTAINER}" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap cleanup EXIT

echo "== Building and starting the stack (${COMPOSE_PROJECT_NAME}) =="
if ! "${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 \
  db redis auth catalogo pedidos pagos; then
  echo "== Infrastructure failure: the stack did not become healthy =="
  exit 2
fi

echo "== Running the E2E suite (${E2E_CONTAINER}) =="
mkdir -p test-results
status=0
"${COMPOSE[@]}" run --name "${E2E_CONTAINER}" e2e || status=$?

echo "== Copying test-results out of ${E2E_CONTAINER} =="
docker cp "${E2E_CONTAINER}:/app/test-results/." "./test-results/" || true

# Jest exits with 1 when test cases fail; anything else, or a missing
# JUnit report, means the suite could not run properly.
if [[ "${status}" -ne 0 && ( "${status}" -ne 1 || ! -f test-results/e2e-junit.xml ) ]]; then
  echo "== Infrastructure failure: E2E runner exited with ${status} =="
  exit 2
fi

echo "== E2E summary =="
echo "Project:   ${COMPOSE_PROJECT_NAME}"
echo "Exit code: ${status}"
echo "JUnit:     test-results/e2e-junit.xml"
echo "HTML:      test-results/html/reporte-e2e.html"
echo "(Non-zero is expected: DEF-03/05/07/10 are open defects that intentionally fail — see tests/e2e/casos-prueba.e2e.test.js)"

exit "${status}"
