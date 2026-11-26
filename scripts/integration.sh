#!/usr/bin/env bash
set -euo pipefail
scratch="$(mktemp -d)"
prefix="kmtest$(node -e 'process.stdout.write(require("node:crypto").randomBytes(6).toString("hex"))')"
export KM_WEB_PORT="${KM_WEB_PORT:-3108}"
export KM_BASE_URL="http://127.0.0.1:$KM_WEB_PORT"
artifacts="${KM_ARTIFACTS_DIR:-artifacts}"
mkdir -p "$artifacts"

use_project() {
  export COMPOSE_PROJECT_NAME="$prefix-$1"
  export KM_ENV_FILE="$scratch/$1.env"
}
compose() { docker compose --env-file "$KM_ENV_FILE" "$@"; }
db() { compose exec -T db psql -X -v ON_ERROR_STOP=1 -U km_bootstrap -d km "$@"; }
cleanup() {
  local status=$? project
  trap - EXIT
  set +e
  for project in source restored rejected; do
    use_project "$project"
    if [[ -f "$KM_ENV_FILE" ]]; then
      compose logs --no-color > "$artifacts/$project.log" 2>&1
      compose down -v --remove-orphans >/dev/null 2>&1
    fi
  done
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT

http_status() {
  curl --noproxy '*' -sS --max-time 8 -o "$scratch/response.json" -w '%{http_code}' "$KM_BASE_URL/$1"
}

use_project source
make setup
[[ "$(docker network inspect "${COMPOSE_PROJECT_NAME}_default" --format '{{.Internal}}')" == true ]]
[[ "$(docker network inspect "${COMPOSE_PROJECT_NAME}_ingress" --format '{{index .Options "com.docker.network.bridge.enable_ip_masquerade"}}')" == false ]]
echo "Isolamento Compose confirmado: rede interna e bridge web sem NAT"
make smoke
pnpm test:e2e
node scripts/benchmark.mjs

compose stop db
[[ "$(http_status healthz)" == 200 ]]
[[ "$(http_status readyz)" == 503 ]]
node -e 'require("node:assert/strict").deepEqual(require(process.argv[1]), {type:"about:blank",title:"Service Unavailable",status:503})' "$scratch/response.json"
compose up -d --wait db
compose up -d --wait --no-build api worker web
[[ "$(http_status readyz)" == 200 ]]
echo "Readiness passou 200 → 503 → 200 com PostgreSQL indisponível"

compose stop redis
[[ "$(http_status readyz)" == 503 ]]
compose up -d --wait redis
compose exec -T redis redis-cli FLUSHALL
compose up -d --wait --no-build api worker web
make smoke
echo "Readiness e fila recuperadas com perda sintética de Redis"

db -Atc 'TABLE km.migrations; SELECT * FROM km.fixture_objects ORDER BY tenant_id, id; SELECT id FROM km.probe_receipts ORDER BY id' > "$scratch/expected"
make backup DIR="$scratch/backup"
make stop

use_project restored
make restore DIR="$scratch/backup"
db -Atc 'TABLE km.migrations; SELECT * FROM km.fixture_objects ORDER BY tenant_id, id; SELECT id FROM km.probe_receipts ORDER BY id' > "$scratch/actual"
diff -u "$scratch/expected" "$scratch/actual"
echo "Checksum de migração, vínculos, objetos e recibos conferidos após restore"
make smoke
compose stop web worker api
db -f /km-infra/rollback.sql
[[ "$(db -Atc "SELECT to_regnamespace('km') IS NULL")" == t ]]
make setup
[[ "$(http_status readyz)" == 200 ]]
echo "Migração v1 revertida e reaplicada em banco descartável"
make stop

use_project rejected
mkdir "$scratch/incomplete"
cp "$scratch/backup/manifest.json" "$scratch/incomplete/"
if make restore DIR="$scratch/incomplete"; then
  echo "Backup incompleto aceito" >&2
  exit 1
fi
[[ -z "$(compose ps -q api worker web)" ]]
if make setup; then
  echo "Setup liberou uma restauração incompleta" >&2
  exit 1
fi
[[ -z "$(compose ps -q api worker web)" ]]
echo "Backup incompleto recusado; aplicação permaneceu indisponível"
