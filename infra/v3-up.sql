CREATE TABLE km.worker_policy (
  tenant_id uuid PRIMARY KEY REFERENCES km.organizations,
  concurrency integer NOT NULL CHECK (concurrency BETWEEN 1 AND 4),
  quota integer NOT NULL CHECK (quota BETWEEN 1 AND 1000),
  window_ms integer NOT NULL CHECK (window_ms BETWEEN 1000 AND 3600000)
);
CREATE TABLE km.worker_jobs (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  fence uuid NOT NULL,
  leased_until timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX ON km.worker_jobs (tenant_id, leased_until) WHERE completed_at IS NULL;
CREATE TABLE km.worker_attempts (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  fence uuid NOT NULL,
  admitted_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, fence)
);
CREATE INDEX ON km.worker_attempts (tenant_id, admitted_at);
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['worker_policy', 'worker_jobs', 'worker_attempts'] LOOP
    EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING
      (tenant_id = nullif(current_setting(''km.tenant_id'',true),'''')::uuid)', relation);
  END LOOP;
END $$;
GRANT SELECT ON km.worker_policy TO km_app;
GRANT SELECT, INSERT, UPDATE ON km.worker_jobs TO km_app;
GRANT SELECT, INSERT, DELETE ON km.worker_attempts TO km_app;

-- No tenant data is stored here. Runtime can only operate on a slot by fence.
CREATE TABLE km.worker_slots (
  slot integer PRIMARY KEY,
  fence uuid UNIQUE,
  leased_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO km.worker_slots(slot) VALUES (1), (2), (3);

CREATE FUNCTION km.worker_reserve(candidate uuid, expires timestamptz) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH available AS (
    SELECT slot FROM km.worker_slots WHERE leased_until <= clock_timestamp()
    ORDER BY slot LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE km.worker_slots SET fence=candidate, leased_until=expires
    FROM available WHERE worker_slots.slot=available.slot
    RETURNING true;
$$;
CREATE FUNCTION km.worker_change(candidate uuid, expires timestamptz, release boolean) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE km.worker_slots SET fence=CASE WHEN release THEN NULL ELSE candidate END,
    leased_until=CASE WHEN release THEN '-infinity'::timestamptz ELSE expires END
    WHERE fence=candidate AND (release OR leased_until > clock_timestamp())
    RETURNING true;
$$;
REVOKE ALL ON FUNCTION km.worker_reserve(uuid,timestamptz), km.worker_change(uuid,timestamptz,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION km.worker_reserve(uuid,timestamptz), km.worker_change(uuid,timestamptz,boolean) TO km_app;
