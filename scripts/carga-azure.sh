#!/usr/bin/env bash
# ============================================================
# scripts/carga-azure.sh
# Runs the k6 load test (tests/carga/carga.k6.js) against the Azure
# deployment: 0 -> 50 virtual users in 1 min, 50 users for 5 min,
# ramp down in 30 s. Only sends HTTP requests: it never deploys.
#
# Usage (from the repository root, with a client account of the app):
#   K6_CORREO=... K6_CONTRASENA=... npm run test:carga:azure
#
# Each run writes to its own folder, test-results/carga/<YYYYMMDD-HHMMSS>/:
# resumen.md, resumen.json and reporte.html (k6 web dashboard charts).
# If the dashboard (http://127.0.0.1:5665) is open in a browser, k6 waits
# for that tab to be closed before printing the summary.
# Requires: k6 (brew install k6), curl.
# ============================================================
set -euo pipefail

# shellcheck source=scripts/azure-config.sh
source "$(dirname "${BASH_SOURCE[0]}")/azure-config.sh"

# Default to the production seed client from the local secrets file.
SECRETS_FILE="${SECRETS_FILE:-$HOME/.elfrutal/azure-g3.secrets}"
# shellcheck disable=SC1090
[[ -f "$SECRETS_FILE" ]] && source "$SECRETS_FILE"
if [[ -z "${K6_CORREO:-}" && -n "${SEED_CLIENTE_PASSWORD:-}" ]]; then
  K6_CORREO="cliente@elfrutal.com"
  K6_CONTRASENA="$SEED_CLIENTE_PASSWORD"
fi
export K6_CORREO K6_CONTRASENA

[[ -n "${K6_CORREO:-}" && -n "${K6_CONTRASENA:-}" ]] || {
  echo "K6_CORREO and K6_CONTRASENA (a client account) are required."
  exit 1
}

AUTH_URL="https://$(app_name auth).azurewebsites.net"
CATALOGO_URL="https://$(app_name catalogo).azurewebsites.net"
PEDIDOS_URL="https://$(app_name pedidos).azurewebsites.net"
# One folder per run so a new run never overwrites the previous evidence.
RESULTADOS_DIR="test-results/carga/$(date +%Y%m%d-%H%M%S)"
export AUTH_URL CATALOGO_URL PEDIDOS_URL RESULTADOS_DIR
mkdir -p "$RESULTADOS_DIR"

# Wake up the App Services first so a cold start is not measured as load.
for url in "$AUTH_URL" "$CATALOGO_URL" "$PEDIDOS_URL"; do
  curl -s -o /dev/null --max-time 90 "$url/health" || true
done

# A failed threshold makes k6 exit non-zero; the reports are written anyway.
status=0
K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_EXPORT="$RESULTADOS_DIR/reporte.html" \
  k6 run tests/carga/carga.k6.js || status=$?
echo "Summary: $RESULTADOS_DIR/resumen.md"
echo "HTML report: $RESULTADOS_DIR/reporte.html"
exit "$status"
