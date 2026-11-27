-- Internal dispatch directory. Only tenant selectors, never content or credentials.
CREATE TABLE km.ingest_tenants (tenant_id uuid PRIMARY KEY REFERENCES km.organizations ON DELETE CASCADE);
CREATE TABLE km.ingest_jobs (
 tenant_id uuid NOT NULL REFERENCES km.organizations, id uuid NOT NULL,
 page_id uuid NOT NULL, publication_id uuid, kind text NOT NULL CHECK(kind IN ('published','withdrawn','reprocess')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','done','failed')),
 attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 last_error text, PRIMARY KEY(tenant_id,id)
);
CREATE INDEX ON km.ingest_jobs(tenant_id,status,next_at) WHERE status='queued';
CREATE TABLE km.ingest_vectors (
 tenant_id uuid NOT NULL REFERENCES km.organizations, profile text NOT NULL, digest text NOT NULL,
 embedding public.vector(64) NOT NULL, PRIMARY KEY(tenant_id,profile,digest)
);
CREATE TABLE km.ingest_generations (
 tenant_id uuid NOT NULL REFERENCES km.organizations, page_id uuid NOT NULL, publication_id uuid NOT NULL,
 revision integer NOT NULL, profile text NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,page_id)
);
CREATE TABLE km.ingest_chunks (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL, id text NOT NULL, block_id uuid NOT NULL,
 ordinal integer NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL,
 heading text[] NOT NULL, kind text NOT NULL, content text NOT NULL, digest text NOT NULL, profile text NOT NULL,
 PRIMARY KEY(tenant_id,page_id,id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES km.ingest_generations ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,profile,digest) REFERENCES km.ingest_vectors
);
CREATE INDEX ON km.ingest_chunks(tenant_id,profile,digest);
DO $$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['ingest_jobs','ingest_vectors','ingest_generations','ingest_chunks'] LOOP
  EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING (tenant_id=nullif(current_setting(''km.tenant_id'',true),'''')::uuid)',relation);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON km.%I TO km_app',relation);
 END LOOP;
END $$;
GRANT SELECT ON km.ingest_tenants TO km_app;
CREATE FUNCTION km.ingest_capture() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE previous text;
BEGIN
 IF NEW.kind IN ('published','withdrawn') THEN
  previous := current_setting('km.tenant_id',true);
  PERFORM set_config('km.tenant_id',NEW.tenant_id::text,true);
  INSERT INTO km.ingest_tenants VALUES (NEW.tenant_id) ON CONFLICT DO NOTHING;
  INSERT INTO km.ingest_jobs(tenant_id,id,page_id,publication_id,kind)
   VALUES(NEW.tenant_id,NEW.id,NEW.page_id,NEW.publication_id,NEW.kind) ON CONFLICT DO NOTHING;
  PERFORM set_config('km.tenant_id',coalesce(previous,''),true);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION km.ingest_capture() FROM PUBLIC;
CREATE TRIGGER ingest_capture AFTER INSERT ON km.editor_outbox FOR EACH ROW EXECUTE FUNCTION km.ingest_capture();
CREATE VIEW km.ingest_eligible WITH (security_invoker=true) AS
 SELECT g.* FROM km.ingest_generations g
 JOIN km.editor_publications p ON (p.tenant_id,p.page_id,p.id,p.revision)=(g.tenant_id,g.page_id,g.publication_id,g.revision)
 JOIN km.wiki_pages w ON (w.tenant_id,w.id)=(g.tenant_id,g.page_id)
 JOIN km.organizations o ON o.tenant_id=g.tenant_id
 WHERE p.withdrawn_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>statement_timestamp())
 AND w.deleted_batch IS NULL AND o.state='active';
GRANT SELECT ON km.ingest_eligible TO km_app;
-- Populate the same receipts on upgrade with the original, already committed events.
ALTER TABLE km.editor_outbox NO FORCE ROW LEVEL SECURITY;
ALTER TABLE km.ingest_jobs NO FORCE ROW LEVEL SECURITY;
INSERT INTO km.ingest_tenants SELECT DISTINCT tenant_id FROM km.editor_outbox WHERE kind IN ('published','withdrawn') ON CONFLICT DO NOTHING;
INSERT INTO km.ingest_jobs(tenant_id,id,page_id,publication_id,kind)
 SELECT tenant_id,id,page_id,publication_id,kind FROM km.editor_outbox WHERE kind IN ('published','withdrawn') ON CONFLICT DO NOTHING;
ALTER TABLE km.ingest_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE km.editor_outbox FORCE ROW LEVEL SECURITY;
