#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-knowledge-manager}"
env_file="${KM_ENV_FILE:-.env}"

compose() {
  if [[ -n "${KM_BUILD_CA:-}" ]]; then
    docker compose -f compose.yaml -f infra/compose.proxy.yaml --env-file "$env_file" "$@"
  else
    docker compose --env-file "$env_file" "$@"
  fi
}
db() { compose exec -T db psql -X -v ON_ERROR_STOP=1 -U km_bootstrap -d km "$@"; }
storage() { compose run --rm --no-deps -T api node /app/storage.mjs "$@"; }

prerequisites() {
  command -v node >/dev/null
  command -v curl >/dev/null
  node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'
  docker info --format '{{.ServerVersion}}'
  docker compose version
}

initialize_env() {
  if [[ ! -e "$env_file" ]]; then
    node - "$env_file" <<'JS'
const { randomBytes } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const password = () => randomBytes(32).toString("hex");
writeFileSync(process.argv[2], `KM_APP_PASSWORD=${password()}\nKM_DB_PASSWORD=${password()}\nKM_IDENTITY_KEY=${password()}\n`, { flag: "wx", mode: 0o600 });
JS
  fi
}

migrate() {
  local checksum identity_checksum worker_checksum wiki_checksum wiki_objects_checksum wiki_uploads_checksum
  checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v1-up.sql")).digest("hex"))')"
  identity_checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v2-up.sql")).digest("hex"))')"
  worker_checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v3-up.sql")).digest("hex"))')"
  wiki_checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v4-up.sql")).digest("hex"))')"
  wiki_objects_checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v5-up.sql")).digest("hex"))')"
  wiki_uploads_checksum="$(node -e 'const fs=require("node:fs"); process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync("infra/v6-up.sql")).digest("hex"))')"
  db -v "wiki_uploads_checksum=$wiki_uploads_checksum" -v "wiki_objects_checksum=$wiki_objects_checksum" -v "wiki_checksum=$wiki_checksum" -v "worker_checksum=$worker_checksum" -v "checksum=$checksum" -v "identity_checksum=$identity_checksum" -f /km-infra/migrate.sql
}

verify_fixture() {
  [[ "$(db -Atc "SELECT relrowsecurity AND relforcerowsecurity
    AND NOT pg_has_role('km_app', 'km_migrate', 'MEMBER')
    AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'km_app')
    AND EXISTS (SELECT FROM pg_policies WHERE schemaname='km' AND tablename='fixture_objects' AND policyname='fixture_isolation')
    FROM pg_class WHERE oid='km.fixture_objects'::regclass")" == t ]]
  db -Atc "SELECT id::text, checksum FROM km.fixture_objects UNION ALL SELECT tenant_id::text||'/'||id::text,sha256 FROM km.wiki_attachments WHERE object_size IS NOT NULL" | storage check
}

setup() {
  prerequisites
  initialize_env
  compose build api web db
  compose up -d --wait --no-build db redis
  migrate
  # Open only after SQL and object checks. A failed restore is never repaired by setup.
  storage verify-start
  compose up -d --wait --no-build api worker web
}

bootstrap() {
  local name="${1:-}" email="${2:-}" display="${3:-}" plain encoded organization member
  local deployment="${KM_DEPLOYMENT_MODE:-shared}"
  [[ "$deployment" == shared || "$deployment" == dedicated ]]
  [[ -n "$name" && "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ && -n "$display" ]]
  if [[ -t 0 ]]; then
    read -r -s -p "Senha inicial (mínimo 12 caracteres): " plain
    echo >&2
  else
    read -r plain
  fi
  encoded="$(printf '%s' "$plain" | compose exec -T api node /app/api/dist/identity/hash-password.js)"
  unset plain
  organization="$(node -e 'console.log(require("node:crypto").randomUUID())')"
  member="$(node -e 'console.log(require("node:crypto").randomUUID())')"
  db -q -v "organization=$organization" -v "member=$member" -v "name=$name" -v "email=$email" -v "display=$display" -v "encoded=$encoded" -v "deployment=$deployment" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(71189002) AS acquired \gset
INSERT INTO km.deployment_identity (singleton,mode) VALUES (true,:'deployment') ON CONFLICT DO NOTHING;
SELECT mode=:'deployment' AND dedicated_tenant IS NULL AS permitted FROM km.deployment_identity WHERE singleton \gset
\if :permitted
\else
  DO $$ BEGIN RAISE EXCEPTION 'Deployment mode mismatch or dedicated tenant already provisioned'; END $$;
\endif
INSERT INTO km.organizations (tenant_id,name) VALUES (:'organization',:'name');
UPDATE km.deployment_identity SET dedicated_tenant=:'organization' WHERE mode='dedicated';
INSERT INTO km.memberships (tenant_id,id,email,name,password_hash,admin)
VALUES (:'organization',:'member',lower(:'email'),:'display',:'encoded',true);
INSERT INTO km.identity_roles (tenant_id,id,name,actions,require_mfa)
SELECT :'organization',gen_random_uuid(),name,actions,require_mfa FROM (VALUES
  ('Leitor',ARRAY['content.read','knowledge.query'],false),
  ('Comentarista',ARRAY['content.read','knowledge.query','content.comment'],false),
  ('Editor',ARRAY['content.read','knowledge.query','content.comment','content.edit','content.publish'],false),
  ('Aprovador',ARRAY['content.read','content.comment','content.approve'],true),
  ('Administrador de espaço',ARRAY['content.acl.manage'],true),
  ('Gestor de conhecimento',ARRAY['knowledge.govern'],true),
  ('Financeiro',ARRAY['billing.read'],true),
  ('Auditor',ARRAY['identity.audit.read'],true)
) AS preset(name,actions,require_mfa);
INSERT INTO km.identity_audit (tenant_id,actor_id,action,resource_id,outcome)
VALUES (:'organization',:'member','identity.organization-provisioned',:'organization','success');
COMMIT;
SQL
  printf '{"tenant":"%s","member":"%s"}\n' "$organization" "$member"
}

snapshot_dir() {
  [[ -n "${1:-}" ]] || { echo 'Informe DIR=<diretório>' >&2; return 1; }
  node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$1"
}

wiki_retention() {
  local expired
  expired="$(db -Atq -f /km-infra/wiki-retention.sql)"
  printf '%s\n' "$expired" | storage prune
}
backup() (
  local dir scratch started
  dir="$(snapshot_dir "${1:-}")"
  [[ ! -e "$dir" && ! -L "$dir" ]] || { echo 'O destino do backup deve ser novo' >&2; return 1; }
  local api_id
  api_id="$(compose ps -q api)"
  [[ -n "$api_id" ]] || { echo 'Inicie o ambiente antes do backup' >&2; return 1; }
  compose exec -T api node -e 'fetch("http://127.0.0.1:3000/readyz").then(r => { if (!r.ok) process.exit(1) })'
  scratch="$(mktemp -d "${dir}.partial.XXXXXX")"
  started="$(date +%s)"
  trap 'rm -rf -- "$scratch"; compose up -d --no-build api worker web >/dev/null' EXIT
  compose stop web worker api
  verify_fixture
  compose exec -T db pg_dump -Fc -U km_bootstrap -d km > "$scratch/database.dump"
  db -Atc "SELECT tenant_id::text||'/'||id::text FROM km.wiki_attachments WHERE object_size IS NOT NULL" | storage reconcile
  storage snapshot > "$scratch/storage.json"
  node scripts/manifest.mjs create "$scratch"
  node scripts/manifest.mjs verify "$scratch"
  mv "$scratch" "$dir"
  trap - EXIT
  compose up -d --wait --no-build api worker web
  echo "Backup concluído em $(( $(date +%s) - started )) s"
)

restore() {
  local dir started
  dir="$(snapshot_dir "${1:-}")"
  started="$(date +%s)"
  prerequisites
  [[ "$COMPOSE_PROJECT_NAME" != knowledge-manager ]] || { echo 'Use um projeto Compose descartável e distinto' >&2; return 1; }
  initialize_env
  # Refuse an existing installation before modifying any state.
  local existing
  existing="$(compose ps --all -q)"
  if [[ -n "$existing" ]]; then
    echo 'A restauração requer um projeto descartável sem containers existentes' >&2
    return 1
  fi
  compose build api web db
  compose up -d --wait --no-build db redis
  [[ "$(db -Atc "SELECT to_regnamespace('km') IS NULL")" == t ]] || {
    echo 'O banco de destino precisa estar vazio' >&2; return 1;
  }
  storage maintenance
  node scripts/manifest.mjs verify "$dir"
  storage restore < "$dir/storage.json"
  compose exec -T db pg_restore --exit-on-error --single-transaction -U km_bootstrap -d km < "$dir/database.dump"
  migrate
  db -f /km-infra/restore-identity.sql
  verify_fixture
  storage complete-restore
  compose up -d --wait --no-build api worker web
  echo "Restauração concluída em $(( $(date +%s) - started )) s"
}

command="${1:-}"
shift || true
case "$command" in
  setup|start|stop|smoke|backup|restore|bootstrap|wiki-retention)
    [[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Projeto Compose inválido' >&2; exit 1; }
    lock="${TMPDIR:-/tmp}/km-compose-$COMPOSE_PROJECT_NAME.lock"
    mkdir "$lock" || { echo 'Outra operação está ativa para este projeto' >&2; exit 1; }
    trap 'rmdir "$lock"' EXIT
    ;;
esac
case "$command" in
  setup) setup ;;
  bootstrap) bootstrap "$@" ;;
  start) compose up -d --wait --no-build ;;
  stop) compose stop ;;
  status) compose ps --all ;;
  logs) compose logs --no-color "$@" ;;
  doctor) prerequisites ;;
  smoke) bash scripts/smoke.sh ;;
  backup) backup "$@" ;;
  wiki-retention) wiki_retention ;;
  restore) restore "$@" ;;
  *) echo 'Operação desconhecida' >&2; exit 1 ;;
esac
