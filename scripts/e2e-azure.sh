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

# shellcheck source=scripts/azure-config.sh
source "$(dirname "${BASH_SOURCE[0]}")/azure-config.sh"
az account set --subscription "$SUBSCRIPTION_ID"

AUTH_URL="https://$(app_name auth).azurewebsites.net"
CATALOGO_URL="https://$(app_name catalogo).azurewebsites.net"
PEDIDOS_URL="https://$(app_name pedidos).azurewebsites.net"
PAGOS_URL="https://$(app_name pagos).azurewebsites.net"
export AUTH_URL CATALOGO_URL PEDIDOS_URL PAGOS_URL
DATABASE_URL="$(az webapp config appsettings list -g "$RG" -n "$(app_name auth)" \
  --query "[?name=='DATABASE_URL'].value" -o tsv)"
export DATABASE_URL
# SEC-03 checks CORS against the origin the services actually allow.
CORS_PERMITIDO="https://$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv)"
export CORS_PERMITIDO

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
