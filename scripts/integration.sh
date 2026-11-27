#!/usr/bin/env bash
set -euo pipefail
scratch="$(mktemp -d)"
prefix="kmtest$(node -e 'process.stdout.write(require("node:crypto").randomBytes(6).toString("hex"))')"
export KM_WEB_PORT="${KM_WEB_PORT:-3108}"
export KM_BASE_URL="http://127.0.0.1:$KM_WEB_PORT"
shared_key="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
export KM_IDENTITY_KEY="$shared_key"
export KM_DEPLOYMENT_MODE=shared
artifacts="${KM_ARTIFACTS_DIR:-artifacts}"
mkdir -p "$artifacts"
export KM_SCAN_DIR="$scratch/scanner"
export KM_CLAMD_SOCKET=/km-scan/clamd.sock

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
  for project in source restored rejected dedicated; do
    use_project "$project"
    if [[ -f "$KM_ENV_FILE" ]]; then
      compose logs --no-color > "$artifacts/$project.log" 2>&1
      compose down -v --remove-orphans >/dev/null 2>&1
    fi
  done
  if [[ -n "${ocr_pid:-}" ]]; then kill "$ocr_pid" 2>/dev/null || true; fi
  bash scripts/wiki-clamd.sh stop "$KM_SCAN_DIR"
  if [[ -f "$KM_SCAN_DIR/clamd.log" ]]; then cp "$KM_SCAN_DIR/clamd.log" "$artifacts/clamd.log"; fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
bash scripts/wiki-clamd.sh start "$KM_SCAN_DIR"
export KM_OCR_DIR="$scratch/ocr"
export KM_INGEST_OCR_SOCKET=/km-ocr/ocr.sock
mkdir -m 755 "$KM_OCR_DIR"
tesseract --version
node scripts/ingest-ocr.mjs "$KM_OCR_DIR/ocr.sock" --fixture > "$artifacts/ocr.log" 2>&1 &
ocr_pid=$!
for _ in {1..40}; do
  [[ -S "$KM_OCR_DIR/ocr.sock" && "$(stat -c %a "$KM_OCR_DIR/ocr.sock")" == 666 ]] && break
  sleep .1
done
[[ -S "$KM_OCR_DIR/ocr.sock" ]]
[[ "$(stat -c %a "$KM_OCR_DIR/ocr.sock")" == 666 ]]
export KM_INGEST_NATIVE_FIXTURES="$scratch/legacy"
mkdir "$KM_INGEST_NATIVE_FIXTURES"
for pair in doc:odt xls:ods ppt:odp; do
  legacy="${pair%:*}"
  open_format="${pair#*:}"
  libreoffice "-env:UserInstallation=file://$scratch/office-fixtures" --headless \
    --convert-to "$legacy" --outdir "$KM_INGEST_NATIVE_FIXTURES" \
    "contracts/fixtures/ingestion/legacy.$open_format"
  [[ -s "$KM_INGEST_NATIVE_FIXTURES/legacy.$legacy" ]]
  code="$(printf 'invalid legacy Office' | curl --unix-socket "$KM_OCR_DIR/ocr.sock" \
    -sS -o /dev/null -w '%{http_code}' --data-binary @- "http://localhost/$legacy")"
  [[ "$code" == 503 ]]
done
code="$(printf '%%PDF-invalid' | curl --unix-socket "$KM_OCR_DIR/ocr.sock" \
  -sS -o /dev/null -w '%{http_code}' --data-binary @- http://localhost/pdf)"
[[ "$code" == 503 ]]

http_status() {
  curl --noproxy '*' -sS --max-time 8 -o "$scratch/response.json" -w '%{http_code}' "$KM_BASE_URL/$1"
}

use_project source
make setup
[[ "$(docker network inspect "${COMPOSE_PROJECT_NAME}_default" --format '{{.Internal}}')" == true ]]
[[ "$(docker network inspect "${COMPOSE_PROJECT_NAME}_ingress" --format '{{index .Options "com.docker.network.bridge.enable_ip_masquerade"}}')" == false ]]
echo "Isolamento Compose confirmado: rede interna e bridge web sem NAT"
make smoke
node scripts/identity-integration.mjs primary "$scratch/identity"
KM_WIKI_G3_REPORT="$artifacts/wiki-g3.json" node scripts/wiki-integration.mjs "$scratch/identity" "$scratch/wiki-browser"
KM_EDITOR_G3_REPORT="$artifacts/editor-g3.json" KM_INGEST_G3_REPORT="$artifacts/ingestion-g3.json" node scripts/editor-integration.mjs "$scratch/identity" "$scratch/wiki-browser"
compose up -d --wait --no-build --scale api=2 --scale worker=2
for index in 1 2; do
  compose exec -T --index "$index" api node -e 'fetch("http://127.0.0.1:3000/readyz").then(r=>{if(!r.ok) process.exit(1)})'
  compose exec -T --index "$index" worker node -e 'fetch("http://127.0.0.1:3001/readyz").then(r=>{if(!r.ok) process.exit(1)})'
done
make smoke
node scripts/identity-integration.mjs quota "$scratch/identity"
node scripts/worker-integration.mjs "$scratch/identity" "$artifacts/worker-metrics.json"
echo "Escala local: duas réplicas API e worker saudáveis com fila e PostgreSQL compartilhados"
compose up -d --wait --no-build --scale api=1 --scale worker=1
KM_WIKI_BROWSER_FIXTURE="$scratch/wiki-browser" pnpm test:e2e
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
node scripts/identity-integration.mjs restored "$scratch/identity"
db -Atc 'TABLE km.migrations; SELECT * FROM km.fixture_objects ORDER BY tenant_id, id; SELECT id FROM km.probe_receipts ORDER BY id' > "$scratch/actual"
diff -u "$scratch/expected" "$scratch/actual"
echo "Checksum de migração, vínculos, objetos e recibos conferidos após restore"
make smoke
compose stop web worker api
db -f /km-infra/v2-down.sql
[[ "$(db -Atc "SELECT count(*) FROM km.migrations WHERE version=1")" == 1 ]]
[[ "$(db -Atc "SELECT count(*) FROM km.fixture_objects")" -gt 0 ]]
make setup
[[ "$(db -Atc "SELECT count(*) FROM km.migrations WHERE version=2")" == 1 ]]
[[ "$(db -Atc "SELECT count(*) FROM km.migrations WHERE version=3")" == 1 ]]
[[ "$(db -Atc "SELECT count(*) FROM km.migrations WHERE version=4")" == 1 ]]
echo "Upgrade e rollback v2 verificados preservando os fixtures do PKG-01"
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


use_project dedicated
export KM_DEPLOYMENT_MODE=dedicated
unset KM_IDENTITY_KEY
make setup
node scripts/identity-integration.mjs dedicated "$scratch/identity"
node scripts/wiki-integration.mjs "$scratch/identity" "$scratch/wiki-browser" dedicated
node scripts/editor-integration.mjs "$scratch/identity" "$scratch/wiki-browser" dedicated
node scripts/worker-integration.mjs "$scratch/identity" "$artifacts/worker-metrics.json" cross
make stop

use_project source
export KM_IDENTITY_KEY="$shared_key"
export KM_DEPLOYMENT_MODE=shared
make start
node scripts/identity-integration.mjs cross "$scratch/identity"
make stop
echo "Isolamento bidirecional shared/dedicated confirmado"
