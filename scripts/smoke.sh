#!/usr/bin/env bash
set -euo pipefail
env_file="${KM_ENV_FILE:-.env}"
compose() { docker compose --env-file "$env_file" "$@"; }
db() { compose exec -T db psql -X -v ON_ERROR_STOP=1 -U km_bootstrap -d km "$@"; }

curl --noproxy '*' -fsS "http://127.0.0.1:${KM_WEB_PORT:-3000}/readyz" | node -e '
  const assert = require("node:assert/strict");
  assert.deepEqual(JSON.parse(require("node:fs").readFileSync(0,"utf8")), {status:"ready"});
'
compose exec -T worker node -e '
  const assert = require("node:assert/strict");
  fetch("http://127.0.0.1:3001/readyz").then(async r => {
    assert.equal(r.status,200); assert.deepEqual(await r.json(),{status:"ready"});
  }).catch(() => process.exit(1));
'

receipt="$(compose exec -T api node /app/probe.cjs)"
IFS="|" read -r object checksum <<< "$receipt"
tenant_a=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
tenant_b=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb
db -v "tenant_a=$tenant_a" -v "tenant_b=$tenant_b" -v "object=$object" -v "checksum=$checksum" <<'SQL'
BEGIN;
SET LOCAL ROLE km_app;
SELECT set_config('km.tenant_id', :'tenant_a', true);
INSERT INTO km.fixture_objects VALUES (:'tenant_a', :'object', :'checksum');
SELECT set_config('km.tenant_id', :'tenant_b', true);
INSERT INTO km.fixture_objects VALUES (:'tenant_b', :'object', :'checksum');
COMMIT;
BEGIN;
SET LOCAL ROLE km_app;
SELECT set_config('km.tenant_id', :'tenant_a', true);
DO $$ BEGIN
  IF EXISTS (SELECT FROM km.fixture_objects WHERE tenant_id::text <> current_setting('km.tenant_id'))
     OR NOT EXISTS (SELECT FROM km.fixture_objects)
     OR (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user)
     OR pg_has_role(current_user, 'km_migrate', 'MEMBER')
  THEN RAISE EXCEPTION 'Tenant isolation or role boundary failed'; END IF;
  BEGIN
    INSERT INTO km.fixture_objects VALUES (
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(), repeat('0',64)
    );
    RAISE EXCEPTION 'Cross-tenant write succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    CREATE TABLE km.forbidden (id integer);
    RAISE EXCEPTION 'Runtime migration succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE km_app;
DO $$ BEGIN
  IF EXISTS (SELECT FROM km.fixture_objects) THEN RAISE EXCEPTION 'Missing context exposed data'; END IF;
END $$;
COMMIT;
SQL
echo 'Smoke OK: HTTP, pgvector, Redis/BullMQ, storage, idempotência, RLS e papel de runtime'
