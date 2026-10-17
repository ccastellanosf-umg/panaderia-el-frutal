#!/usr/bin/env bash
# ============================================================
# scripts/bootstrap-azure.sh
# One-time (idempotent) provisioning of the Azure infrastructure:
# resource providers, resource group, PostgreSQL Flexible Server,
# ACR, App Service plan, Static Web App and monitoring (Log Analytics,
# Application Insights, alert action group). Then loads the schema
# and seed into an EMPTY database.
#
# Usage (from the repository root, after `az login`):
#   ./scripts/bootstrap-azure.sh
#   source ~/.elfrutal/azure-g3.secrets && ./scripts/deploy-azure.sh
#
# Secrets (ADMIN_DATABASE_URL, JWT_SECRET) are written to
# $SECRETS_FILE (outside the repo, mode 600) and never printed.
# Re-running reuses the values already stored there.
#
# Requirements: az (logged in), psql, openssl, python3, curl.
# ============================================================
set -euo pipefail

# shellcheck source=scripts/azure-config.sh
source "$(dirname "${BASH_SOURCE[0]}")/azure-config.sh"

step() { printf '\n==> %s\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
write_secrets() {
  ( umask 077
    {
      printf 'export ADMIN_DATABASE_URL=%q\n' "$ADMIN_DATABASE_URL"
      printf 'export JWT_SECRET=%q\n' "$JWT_SECRET"
    } > "$SECRETS_FILE" )
  chmod 600 "$SECRETS_FILE"
}

PG_LOCATION="${PG_LOCATION:-$LOCATION}"

step "Selecting subscription $SUBSCRIPTION_ID"
az account set --subscription "$SUBSCRIPTION_ID"
state="$(az account show --query state -o tsv)"
[[ "$state" == "Enabled" ]] || die "Subscription $SUBSCRIPTION_ID is '$state', expected 'Enabled'."

# ------------------------------------------------------------
# Resource providers (NotRegistered on a fresh subscription)
# ------------------------------------------------------------
step "Registering resource providers"
PROVIDERS=(Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.ContainerRegistry Microsoft.Insights Microsoft.OperationalInsights)
for p in "${PROVIDERS[@]}"; do
  az provider register --namespace "$p" -o none
done
for p in "${PROVIDERS[@]}"; do
  for _ in $(seq 1 60); do
    reg="$(az provider show --namespace "$p" --query registrationState -o tsv)"
    [[ "$reg" == "Registered" ]] && break
    sleep 10
  done
  [[ "$reg" == "Registered" ]] || die "Provider $p is still '$reg' after 10 minutes."
  echo "$p: Registered"
done

# ------------------------------------------------------------
# Secrets file (reuse if it already exists)
# ------------------------------------------------------------
SECRETS_DIR="$(dirname "$SECRETS_FILE")"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-}"
JWT_SECRET="${JWT_SECRET:-}"
if [[ -f "$SECRETS_FILE" ]]; then
  step "Reusing values from $SECRETS_FILE"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
PG_ADMIN_PASSWORD=""
# JWT secret (generated once, kept in the secrets file)
if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '/+=\n')"
fi

# ------------------------------------------------------------
# Resource group
# ------------------------------------------------------------
if [[ "$(az group exists -n "$RG")" != "true" ]]; then
  step "Creating resource group $RG in $LOCATION"
  az group create -n "$RG" -l "$LOCATION" -o none
else
  echo "Resource group $RG already exists."
fi

# ------------------------------------------------------------
# PostgreSQL Flexible Server
# ------------------------------------------------------------
if az postgres flexible-server show -g "$RG" -n "$PG_SERVER" --query name -o tsv >/dev/null 2>&1; then
  echo "PostgreSQL server $PG_SERVER already exists."
else
  avail="$(az rest --method post \
    --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.DBforPostgreSQL/checkNameAvailability?api-version=2022-12-01" \
    --body "{\"name\":\"${PG_SERVER}\",\"type\":\"Microsoft.DBforPostgreSQL/flexibleServers\"}" \
    --query nameAvailable -o tsv)"
  [[ "$avail" == "true" ]] || die "PostgreSQL server name '$PG_SERVER' is already taken. Re-run with another PG_SERVER or SUFFIX."

  step "Creating PostgreSQL server $PG_SERVER (this takes several minutes)"
  PG_ADMIN_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=')"
  az postgres flexible-server create -g "$RG" -n "$PG_SERVER" -l "$PG_LOCATION" \
    --version 16 --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
    --backup-retention 7 --geo-redundant-backup Disabled \
    --admin-user "$PG_ADMIN_USER" --admin-password "$PG_ADMIN_PASSWORD" \
    --public-access None --yes -o none
  # Persist the admin URL right away so the password is never lost.
  PG_HOST="$(az postgres flexible-server show -g "$RG" -n "$PG_SERVER" --query fullyQualifiedDomainName -o tsv)"
  enc_pw="$(python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1], safe=""))' "$PG_ADMIN_PASSWORD")"
  ADMIN_DATABASE_URL="postgresql://${PG_ADMIN_USER}:${enc_pw}@${PG_HOST}:5432/${PG_DB}?sslmode=require"
  unset enc_pw PG_ADMIN_PASSWORD
  write_secrets
fi

# TLS is required by default on Flexible Server; enforce it explicitly.
az postgres flexible-server parameter set -g "$RG" -s "$PG_SERVER" \
  --name require_secure_transport --value on -o none

# Created with --public-access None so no permissive default rule is added;
# public access is then enabled and restricted by the firewall rules below.
if [[ "$(az postgres flexible-server show -g "$RG" -n "$PG_SERVER" --query network.publicNetworkAccess -o tsv)" != "Enabled" ]]; then
  step "Enabling public access (restricted by firewall) on $PG_SERVER"
  az postgres flexible-server update -g "$RG" -n "$PG_SERVER" --public-access Enabled -o none
fi

step "Configuring PostgreSQL firewall"
MY_IP="$(curl -s --max-time 15 https://api.ipify.org || true)"
[[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Could not detect the public IP address."
# create is an upsert for firewall rules, so re-running updates the IP.
az postgres flexible-server firewall-rule create -g "$RG" -s "$PG_SERVER" \
  --name AllowMiMac --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" -o none
az postgres flexible-server firewall-rule create -g "$RG" -s "$PG_SERVER" \
  --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none

if ! az postgres flexible-server db show -g "$RG" -s "$PG_SERVER" -n "$PG_DB" --query name -o tsv >/dev/null 2>&1; then
  step "Creating database $PG_DB"
  az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -n "$PG_DB" -o none
fi

# ------------------------------------------------------------
# Write the secrets file
# ------------------------------------------------------------
[[ -n "$ADMIN_DATABASE_URL" ]] || die "The server exists but $SECRETS_FILE has no ADMIN_DATABASE_URL. Restore it or delete the server and re-run."
write_secrets
echo "Secrets stored in $SECRETS_FILE"

# ------------------------------------------------------------
# ACR, App Service plan, Static Web App
# ------------------------------------------------------------
if ! az acr show -n "$ACR" --query name -o tsv >/dev/null 2>&1; then
  step "Creating container registry $ACR"
  az acr create -g "$RG" -n "$ACR" -l "$LOCATION" --sku Basic --admin-enabled false -o none
else
  echo "ACR $ACR already exists."
fi

if ! az appservice plan show -g "$RG" -n "$PLAN" --query name -o tsv >/dev/null 2>&1; then
  step "Creating App Service plan $PLAN (Linux, B1)"
  az appservice plan create -g "$RG" -n "$PLAN" -l "$LOCATION" --is-linux --sku B1 -o none
else
  echo "App Service plan $PLAN already exists."
fi

if ! az staticwebapp show -g "$RG" -n "$SWA" --query name -o tsv >/dev/null 2>&1; then
  step "Creating Static Web App $SWA in $SWA_LOCATION (Free)"
  az staticwebapp create -g "$RG" -n "$SWA" -l "$SWA_LOCATION" --sku Free -o none
else
  echo "Static Web App $SWA already exists."
fi

# ------------------------------------------------------------
# Monitoring: Log Analytics + Application Insights + alert action group
# Cost control: PerGB2018 with a 0.1 GB/day cap and 30-day retention stays
# inside the free 5 GB/month ingestion.
# ------------------------------------------------------------
if ! az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query name -o tsv >/dev/null 2>&1; then
  step "Creating Log Analytics workspace $LAW (PerGB2018, 0.1 GB/day cap, 30 days)"
  az monitor log-analytics workspace create -g "$RG" -n "$LAW" -l "$LOCATION" \
    --sku PerGB2018 --quota 0.1 --retention-time 30 -o none
else
  echo "Log Analytics workspace $LAW already exists."
fi

# The 'monitor app-insights' commands come from a CLI extension.
az extension add --name application-insights --upgrade -y --only-show-errors
if ! az monitor app-insights component show -g "$RG" --app "$APPI" --query name -o tsv >/dev/null 2>&1; then
  step "Creating Application Insights $APPI (workspace-based)"
  LAW_ID="$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query id -o tsv)"
  az monitor app-insights component create -g "$RG" --app "$APPI" -l "$LOCATION" \
    --workspace "$LAW_ID" --kind web --application-type Node.JS -o none
else
  echo "Application Insights $APPI already exists."
fi

if ! az monitor action-group show -g "$RG" -n "$ACTION_GROUP" --query name -o tsv >/dev/null 2>&1; then
  step "Creating action group $ACTION_GROUP (email: $ALERT_EMAILS)"
  receivers=()
  i=0
  for email in $ALERT_EMAILS; do
    i=$((i + 1))
    receivers+=(--action email "admin${i}" "$email")
  done
  [[ ${#receivers[@]} -gt 0 ]] || die "ALERT_EMAILS is empty: the action group needs at least one address."
  az monitor action-group create -g "$RG" -n "$ACTION_GROUP" --short-name ElFrutal \
    "${receivers[@]}" -o none
else
  echo "Action group $ACTION_GROUP already exists."
fi

# ------------------------------------------------------------
# Schema + seed, only into an empty database
# ------------------------------------------------------------
step "Checking the database schema"
TABLES="$(psql "$ADMIN_DATABASE_URL" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
if [[ "$TABLES" == "0" ]]; then
  echo "Empty database: loading schema and seed"
  psql "$ADMIN_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/01_schema.sql
  psql "$ADMIN_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/02_seed.sql
else
  echo "Database already has $TABLES tables: schema/seed skipped."
fi

cat <<EOF

Bootstrap finished. Next steps:

1. Deploy the services and the frontend:
     source $SECRETS_FILE && ./scripts/deploy-azure.sh

2. Azure DevOps (manual, in the UI):
   a. Project settings > Service connections > New > Azure Resource Manager.
      Name it exactly 'Conexion-ElFrutal-G3', subscription $SUBSCRIPTION_ID,
      scope level: resource group $RG.
   b. Update the secret pipeline variable AZURE_STATIC_WEB_APPS_API_TOKEN with the
      new Static Web App token. Get it yourself (it is not printed here) with:
        az staticwebapp secrets list -n $SWA -g $RG --query properties.apiKey -o tsv
EOF
