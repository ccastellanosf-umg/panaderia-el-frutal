#!/usr/bin/env bash
# ============================================================
# scripts/deploy-azure.sh
# Manual deployment of the full Fase 1 stack to Azure (E6):
#   4 microservices on App Service + frontend on Static Web Apps.
#
# Usage (from the repository root):
#   ./scripts/deploy-azure.sh                        # build, push and deploy
#   ./scripts/deploy-azure.sh --reset-db             # also recreate the DB schema + seed
#   ./scripts/deploy-azure.sh --rotate-app-password  # new password for the app DB role
#
# Least privilege: the 4 App Services connect as the DB role "elfrutal_app"
# (DML only, no DDL; see db/roles/usuario_app.sql). The ADMIN connection string
# is never stored in the apps; it is only used here, for migrations and roles:
#   - first deploy (auth app does not exist yet): ADMIN_DATABASE_URL and
#     JWT_SECRET are required. scripts/bootstrap-azure.sh writes them to
#     ~/.elfrutal/azure-<suffix>.secrets:
#       source ~/.elfrutal/azure-g3.secrets && ./scripts/deploy-azure.sh
#   - later runs: export ADMIN_DATABASE_URL="postgresql://admin:...@host:5432/db?sslmode=require"
#     (needed for migrations, --reset-db and --rotate-app-password). Without it
#     the DB steps are skipped and the apps keep their current DATABASE_URL.
#
# Names, subscription and region come from scripts/azure-config.sh.
# Run scripts/bootstrap-azure.sh first on a fresh subscription.
#
# Requirements: az (logged in), docker with buildx, psql, openssl, python3, node/npm.
# ============================================================
set -euo pipefail

# shellcheck source=scripts/azure-config.sh
source "$(dirname "${BASH_SOURCE[0]}")/azure-config.sh"
TAG="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M)"
RESET_DB=false
ROTATE_APP_PASSWORD=false
for arg in "$@"; do
  case "$arg" in
    --reset-db) RESET_DB=true ;;
    --rotate-app-password) ROTATE_APP_PASSWORD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done
APP_ROLE="elfrutal_app"
step() { printf '\n==> %s\n' "$*"; }

az account set --subscription "$SUBSCRIPTION_ID"

# The only allowed browser origin is the Static Web App's default hostname.
SWA_HOST="$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv)"
[[ -n "$SWA_HOST" ]] || { echo "Static Web App $SWA not found: run scripts/bootstrap-azure.sh first"; exit 1; }
CORS_ORIGINS="https://${SWA_HOST}"

# Secrets never live in the repo. If the auth app exists they are read from it;
# on the first deploy they must come from the environment (bootstrap secrets file).
if az webapp show -g "$RG" -n "$(app_name auth)" --query name -o tsv >/dev/null 2>&1; then
  CURRENT_DATABASE_URL="$(az webapp config appsettings list -g "$RG" -n "$(app_name auth)" \
    --query "[?name=='DATABASE_URL'].value" -o tsv)"
  APP_JWT_SECRET="$(az webapp config appsettings list -g "$RG" -n "$(app_name auth)" \
    --query "[?name=='JWT_SECRET'].value" -o tsv)"
  JWT_SECRET="${JWT_SECRET:-$APP_JWT_SECRET}"
  unset APP_JWT_SECRET
  [[ -n "$CURRENT_DATABASE_URL" && -n "$JWT_SECRET" ]] || { echo "Missing DATABASE_URL/JWT_SECRET on $(app_name auth)"; exit 1; }
else
  [[ -n "${ADMIN_DATABASE_URL:-}" && -n "${JWT_SECRET:-}" ]] || {
    echo "First deploy: ADMIN_DATABASE_URL and JWT_SECRET are required."
    echo "Run: source ~/.elfrutal/azure-${SUFFIX}.secrets  (created by scripts/bootstrap-azure.sh)"
    exit 1
  }
  # The role step below creates $APP_ROLE, so the apps never get the admin URL.
  CURRENT_DATABASE_URL="$ADMIN_DATABASE_URL"
fi

url_user() { local r="${1#*://}"; r="${r%%@*}"; echo "${r%%:*}"; }

# Admin URL: explicit env var, or the auth app's URL while it still holds the
# admin credentials. Never echoed.
ADMIN_URL="${ADMIN_DATABASE_URL:-}"
if [[ -z "$ADMIN_URL" && "$(url_user "$CURRENT_DATABASE_URL")" != "$APP_ROLE" ]]; then
  ADMIN_URL="$CURRENT_DATABASE_URL"
fi
# The DB URL the apps get: unchanged unless the role step below replaces it.
APP_DATABASE_URL="$CURRENT_DATABASE_URL"

# ------------------------------------------------------------
# 1. Database (optional, destructive) + migrations + app role
# ------------------------------------------------------------
if [[ -z "$ADMIN_URL" ]]; then
  echo "WARNING: ADMIN_DATABASE_URL not set and the apps already use $APP_ROLE:"
  echo "         skipping migrations, --reset-db and role rotation."
  $RESET_DB && { echo "--reset-db needs ADMIN_DATABASE_URL"; exit 1; }
  $ROTATE_APP_PASSWORD && { echo "--rotate-app-password needs ADMIN_DATABASE_URL"; exit 1; }
else
  if $RESET_DB; then
    step "Recreating schema on Azure PostgreSQL (ALL DATA WILL BE LOST)"
    read -r -p "Type SI to continue: " answer
    [[ "$answer" == "SI" ]] || { echo "Aborted."; exit 1; }
    psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -f db/01_schema.sql
    psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -f db/02_seed.sql
    psql "$ADMIN_URL" -t -c "SELECT count(*) AS productos FROM productos;"
    ROTATE_APP_PASSWORD=true # the DROP SCHEMA removed the role's grants
  else
    # Incremental, idempotent migrations keep existing data.
    # db/roles/*.sql (needs a password) is deliberately NOT in this loop.
    step "Applying database migrations"
    for m in db/migrations/*.sql; do
      echo "$m"
      psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -f "$m"
    done
  fi

  # Least-privilege role: created on the first run, or re-keyed on demand.
  ROLE_EXISTS="$(psql "$ADMIN_URL" -tA -c "SELECT 1 FROM pg_roles WHERE rolname='$APP_ROLE'")"
  if [[ "$ROLE_EXISTS" != "1" || "$ROTATE_APP_PASSWORD" == "true" ]]; then
    step "Applying db/roles/usuario_app.sql ($APP_ROLE) with a new random password"
    APP_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=')"
    psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -v app_password="$APP_PASSWORD" -f db/roles/usuario_app.sql
    # Same host/port/database as the admin URL, other user, TLS required.
    rest="${ADMIN_URL#*://}"
    host_db="${rest#*@}"; host_db="${host_db%%\?*}"
    encoded="$(python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1], safe=""))' "$APP_PASSWORD")"
    APP_DATABASE_URL="postgresql://${APP_ROLE}:${encoded}@${host_db}?sslmode=require"
    unset APP_PASSWORD encoded
  fi
fi

# ------------------------------------------------------------
# 2. Images (linux/amd64, required by App Service)
# ------------------------------------------------------------
step "Building and pushing images with tag $TAG"
az acr login --name "$ACR"
for s in "${SERVICES[@]}"; do
  docker buildx build --platform linux/amd64 -f "docker/${s}/Dockerfile" \
    -t "${ACR}.azurecr.io/elfrutal-${s}:${TAG}" \
    -t "${ACR}.azurecr.io/elfrutal-${s}:latest" --push .
done

# ------------------------------------------------------------
# 3. App Services (creates pedidos/pagos if missing)
# ------------------------------------------------------------
ACR_ID="$(az acr show -n "$ACR" --query id -o tsv)"
for s in "${SERVICES[@]}"; do
  app="$(app_name "$s")"
  port="$(port_of "$s")"
  image="${ACR}.azurecr.io/elfrutal-${s}:${TAG}"

  if ! az webapp show -g "$RG" -n "$app" --query name -o tsv >/dev/null 2>&1; then
    step "Creating $app"
    az webapp create -g "$RG" -p "$PLAN" -n "$app" \
      --container-image-name "$image" --assign-identity '[system]' -o none
    principal="$(az webapp identity show -g "$RG" -n "$app" --query principalId -o tsv)"
    az role assignment create --assignee-object-id "$principal" \
      --assignee-principal-type ServicePrincipal --role AcrPull --scope "$ACR_ID" -o none
  fi

  step "Configuring $app"
  az webapp config set -g "$RG" -n "$app" \
    --generic-configurations '{"acrUseManagedIdentityCreds": true}' -o none
  az webapp config appsettings set -g "$RG" -n "$app" -o none --settings \
    DATABASE_URL="$APP_DATABASE_URL" JWT_SECRET="$JWT_SECRET" \
    PORT="$port" WEBSITES_PORT="$port" WEBSITES_ENABLE_APP_SERVICE_STORAGE=false \
    PASARELA_MODO=simulada NODE_ENV=production CORS_ORIGINS="$CORS_ORIGINS"
  # HTTP -> HTTPS redirect handled by App Service.
  az webapp update -g "$RG" -n "$app" --https-only true -o none
  # There is no Redis in Azure: without REDIS_URL the services read straight
  # from PostgreSQL (CU-03 alternate flow) instead of retrying a dead host.
  az webapp config appsettings delete -g "$RG" -n "$app" --setting-names REDIS_URL -o none
  az webapp config container set -g "$RG" -n "$app" -o none \
    --container-image-name "$image" \
    --container-registry-url "https://${ACR}.azurecr.io"
  az webapp restart -g "$RG" -n "$app" -o none
done

# ------------------------------------------------------------
# 4. Frontend (Static Web Apps)
# ------------------------------------------------------------
step "Building and deploying the frontend"
(
  cd src/frontend
  npm ci
  VITE_AUTH_URL="https://$(app_name auth).azurewebsites.net" \
  VITE_CATALOGO_URL="https://$(app_name catalogo).azurewebsites.net" \
  VITE_PEDIDOS_URL="https://$(app_name pedidos).azurewebsites.net" \
  VITE_PAGOS_URL="https://$(app_name pagos).azurewebsites.net" \
    npm run build
)
SWA_TOKEN="$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query properties.apiKey -o tsv)"
npx --yes @azure/static-web-apps-cli deploy src/frontend/build \
  --deployment-token "$SWA_TOKEN" --env production
echo "Frontend: https://${SWA_HOST}"

# ------------------------------------------------------------
# 5. Health checks (containers may take ~2 min to start)
# ------------------------------------------------------------
step "Waiting for /health on every service"
for s in "${SERVICES[@]}"; do
  url="https://$(app_name "$s").azurewebsites.net/health"
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
    [[ "$code" == "200" ]] && break
    sleep 10
  done
  echo "$s: $url -> $code"
done

cat <<EOF

Done. Frontend: https://${SWA_HOST}
Run the 30 test cases against Azure (reads DATABASE_URL from the auth app) with:
  npm run test:e2e:azure
EOF
