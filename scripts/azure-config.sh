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

# Monitoring: Log Analytics workspace + workspace-based Application Insights.
LAW="${LAW:-law-elfrutal-${SUFFIX}}"
APPI="${APPI:-appi-elfrutal-${SUFFIX}}"
ACTION_GROUP="${ACTION_GROUP:-ag-elfrutal-${SUFFIX}}"
# Space-separated list of addresses notified by the availability alerts.
ALERT_EMAILS="${ALERT_EMAILS:-ccastellanosf@miumg.edu.gt kgarciag26@miumg.edu.gt}"

# Per-user file with ADMIN_DATABASE_URL and JWT_SECRET (kept outside the repo).
SECRETS_FILE="${SECRETS_FILE:-$HOME/.elfrutal/azure-${SUFFIX}.secrets}"

if [[ -z "${SERVICES+x}" ]]; then
  SERVICES=(auth catalogo pedidos pagos)
fi

app_name() { echo "app-elfrutal-$1-${SUFFIX}"; }

# Production passwords of the seed users (db/02_seed.sql keeps the local
# README values). Kept as SEED_<ROLE>_PASSWORD in $SECRETS_FILE.
SEED_ROLES=(admin ventas produccion cliente)
seed_var() { echo "SEED_$(echo "$1" | tr '[:lower:]' '[:upper:]')_PASSWORD"; }

# Loads $SECRETS_FILE if needed and fails listing every missing variable.
require_seed_passwords() {
  local r v missing=()
  # shellcheck disable=SC1090
  [[ -f "$SECRETS_FILE" ]] && source "$SECRETS_FILE"
  for r in "${SEED_ROLES[@]}"; do
    v="$(seed_var "$r")"
    [[ -n "${!v:-}" ]] || missing+=("$v")
  done
  if (( ${#missing[@]} )); then
    echo "Missing production seed passwords (see $SECRETS_FILE): ${missing[*]}" >&2
    return 1
  fi
}

# Appends random seed passwords for any role that has none (never overwrites).
ensure_seed_passwords() {
  local r v
  # shellcheck disable=SC1090
  [[ -f "$SECRETS_FILE" ]] && source "$SECRETS_FILE"
  for r in "${SEED_ROLES[@]}"; do
    v="$(seed_var "$r")"
    if [[ -z "${!v:-}" ]]; then
      printf -v "$v" '%s' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 20)"
      ( umask 077; printf 'export %s=%q\n' "$v" "${!v}" >> "$SECRETS_FILE" )
    fi
  done
  chmod 600 "$SECRETS_FILE"
}

# Replaces the README passwords loaded by the seed with the production ones,
# in a single transaction: either every seed user is updated or none is.
# Passwords reach psql through exported environment variables read with
# \getenv (psql >= 15): they are not in argv nor in the output. The SQL piped
# to psql only carries variable names.
apply_seed_passwords() {
  local url="$1" r v n=${#SEED_ROLES[@]} rows sql cases="" correos=""
  sql="BEGIN;"$'\n'
  for r in "${SEED_ROLES[@]}"; do
    v="$(seed_var "$r")"
    export "${v?}"
    sql+="\\getenv p_$r $v"$'\n'
    cases+=" WHEN '$r@elfrutal.com' THEN crypt(:'p_$r', gen_salt('bf', 10))"
    correos+="${correos:+, }'$r@elfrutal.com'"
  done
  sql+="WITH u AS (UPDATE usuarios SET \"contrasenaHash\" = CASE correo$cases END"
  sql+=" WHERE correo IN ($correos) RETURNING 1) SELECT count(*) AS filas FROM u \\gset"$'\n'
  sql+="SELECT :filas = $n AS completo \\gset"$'\n'
  sql+="\\if :completo"$'\n'"COMMIT;"$'\n'"\\else"$'\n'"ROLLBACK;"$'\n'"\\endif"$'\n'"\\echo :filas"$'\n'
  rows="$(printf '%s' "$sql" | psql "$url" -X -q -tA -v ON_ERROR_STOP=1)"
  if [[ "$rows" != "$n" ]]; then
    echo "Seed passwords NOT applied: expected $n seed users, found $rows. The transaction was rolled back; no user was changed." >&2
    return 1
  fi
  echo "Production passwords applied to $n seed users."
}
port_of() {
  case "$1" in
    auth) echo 3001 ;;
    catalogo) echo 3002 ;;
    pedidos) echo 3003 ;;
    pagos) echo 3004 ;;
    *) echo "Unknown service: $1" >&2; return 1 ;;
  esac
}
