#!/usr/bin/env bash
# ============================================================
# scripts/deploy-azure.sh
# Manual deployment of the full Fase 1 stack to Azure (E6):
#   4 microservices on App Service + frontend on Static Web Apps.
#
# Usage (from the repository root):
#   ./scripts/deploy-azure.sh             # build, push and deploy
#   ./scripts/deploy-azure.sh --reset-db  # also recreate the DB schema + seed
#
# Requirements: az (logged in), docker with buildx, psql, node/npm.
# ============================================================
set -euo pipefail

RG="rg-elfrutal-transformacion-digital"
PLAN="plan-elfrutal"
ACR="acrelfrutalcc"
SWA="swa-elfrutal-frontend-cc"
SERVICES=(auth catalogo pedidos pagos)
TAG="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M)"
RESET_DB=false
[[ "${1:-}" == "--reset-db" ]] && RESET_DB=true

app_name() { echo "app-elfrutal-$1-cc"; }
port_of() {
  case "$1" in auth) echo 3001 ;; catalogo) echo 3002 ;; pedidos) echo 3003 ;; pagos) echo 3004 ;; esac
}
step() { printf '\n==> %s\n' "$*"; }

# Secrets are read from the existing auth app so they never live in the repo.
DATABASE_URL="$(az webapp config appsettings list -g "$RG" -n "$(app_name auth)" \
  --query "[?name=='DATABASE_URL'].value" -o tsv)"
JWT_SECRET="$(az webapp config appsettings list -g "$RG" -n "$(app_name auth)" \
  --query "[?name=='JWT_SECRET'].value" -o tsv)"
[[ -n "$DATABASE_URL" && -n "$JWT_SECRET" ]] || { echo "Missing DATABASE_URL/JWT_SECRET on $(app_name auth)"; exit 1; }

# ------------------------------------------------------------
# 1. Database (optional, destructive)
# ------------------------------------------------------------
if $RESET_DB; then
  step "Recreating schema on Azure PostgreSQL (ALL DATA WILL BE LOST)"
  read -r -p "Type SI to continue: " answer
  [[ "$answer" == "SI" ]] || { echo "Aborted."; exit 1; }
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/01_schema.sql
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/02_seed.sql
  psql "$DATABASE_URL" -t -c "SELECT count(*) AS productos FROM productos;"
else
  # Incremental, idempotent migrations keep existing data.
  step "Applying database migrations"
  for m in db/migrations/*.sql; do
    echo "$m"
    psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$m"
  done
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
    DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" \
    PORT="$port" WEBSITES_PORT="$port" WEBSITES_ENABLE_APP_SERVICE_STORAGE=false \
    PASARELA_MODO=simulada NODE_ENV=production
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
echo "Frontend: https://$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv)"

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

Done. Run the 30 test cases against Azure with:
  AUTH_URL=https://$(app_name auth).azurewebsites.net \\
  CATALOGO_URL=https://$(app_name catalogo).azurewebsites.net \\
  PEDIDOS_URL=https://$(app_name pedidos).azurewebsites.net \\
  PAGOS_URL=https://$(app_name pagos).azurewebsites.net \\
  DATABASE_URL="\$(az webapp config appsettings list -g $RG -n $(app_name auth) --query "[?name=='DATABASE_URL'].value" -o tsv)" \\
  npm run test:e2e
EOF
