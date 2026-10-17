#!/usr/bin/env bash
# ============================================================
# scripts/azure-config.sh
# Single source of truth for every Azure name used by the
# bootstrap, deploy and e2e scripts. Meant to be sourced:
#   source scripts/azure-config.sh
# Every value can be overridden with an environment variable,
# e.g. SUFFIX=g4 SUBSCRIPTION_ID=... to target another subscription.
# ============================================================

SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-180c48ab-fc61-44d3-8c52-6349badadc42}"
# PostgreSQL Flexible Server is offer-restricted for this subscription in
# southcentralus and eastus2, so compute and database live in northcentralus.
LOCATION="${LOCATION:-northcentralus}"
# Azure Static Web Apps is not offered in every region.
SWA_LOCATION="${SWA_LOCATION:-eastus2}"
SUFFIX="${SUFFIX:-g3}"

RG="${RG:-rg-elfrutal-transformacion-digital}"
PLAN="${PLAN:-plan-elfrutal}"
ACR="${ACR:-acrelfrutal${SUFFIX}}"
SWA="${SWA:-swa-elfrutal-frontend-${SUFFIX}}"
PG_SERVER="${PG_SERVER:-pg-elfrutal${SUFFIX}}"
PG_DB="${PG_DB:-elfrutal}"
PG_ADMIN_USER="${PG_ADMIN_USER:-elfrutaladmin}"

# Per-user file with ADMIN_DATABASE_URL and JWT_SECRET (kept outside the repo).
SECRETS_FILE="${SECRETS_FILE:-$HOME/.elfrutal/azure-${SUFFIX}.secrets}"

if [[ -z "${SERVICES+x}" ]]; then
  SERVICES=(auth catalogo pedidos pagos)
fi

app_name() { echo "app-elfrutal-$1-${SUFFIX}"; }
port_of() {
  case "$1" in auth) echo 3001 ;; catalogo) echo 3002 ;; pedidos) echo 3003 ;; pagos) echo 3004 ;; esac
}
