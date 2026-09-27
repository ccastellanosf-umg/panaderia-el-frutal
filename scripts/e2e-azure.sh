#!/usr/bin/env bash
# ============================================================
# scripts/e2e-azure.sh
# Runs the full E2E suite (CP-01..CP-45) against the Azure
# deployment and writes the JUnit and HTML reports to
# test-results/. Only sends HTTP requests: it never deploys.
# Requires `az login` (DATABASE_URL is read from the auth app).
# Extra arguments are passed to Jest, e.g. -t "CP-33".
# ============================================================
set -euo pipefail

RG="rg-elfrutal-transformacion-digital"
export AUTH_URL="https://app-elfrutal-auth-cc.azurewebsites.net"
export CATALOGO_URL="https://app-elfrutal-catalogo-cc.azurewebsites.net"
export PEDIDOS_URL="https://app-elfrutal-pedidos-cc.azurewebsites.net"
export PAGOS_URL="https://app-elfrutal-pagos-cc.azurewebsites.net"
DATABASE_URL="$(az webapp config appsettings list -g "$RG" -n app-elfrutal-auth-cc \
  --query "[?name=='DATABASE_URL'].value" -o tsv)"
export DATABASE_URL

# Wake up the App Services first: a cold start can exceed the test timeout.
for url in "$AUTH_URL" "$CATALOGO_URL" "$PEDIDOS_URL" "$PAGOS_URL"; do
  curl -s -o /dev/null --max-time 90 "$url/health" || true
done

# Failing cases (the open defects) make Jest exit non-zero; still print
# where the reports are, then propagate the exit code.
status=0
npx jest --config tests/e2e/jest.e2e.config.js "$@" || status=$?
echo "HTML report: test-results/html/reporte-e2e.html"
echo "JUnit report: test-results/e2e-junit.xml"
exit "$status"
