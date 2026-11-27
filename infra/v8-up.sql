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
 embedding public.vector NOT NULL CHECK (public.vector_dims(embedding) BETWEEN 1 AND 4096), PRIMARY KEY(tenant_id,profile,digest)
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

CREATE TABLE km.ingest_sources (
 tenant_id uuid NOT NULL, id uuid NOT NULL, space_id uuid NOT NULL, title text NOT NULL, cursor text,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,space_id) REFERENCES km.wiki_spaces ON DELETE CASCADE
);
CREATE TABLE km.ingest_objects (
 tenant_id uuid NOT NULL, source_id uuid NOT NULL, remote_key text NOT NULL, version text NOT NULL,
 page_id uuid, state text NOT NULL CHECK(state IN ('draft','quarantine','deleted')),
 PRIMARY KEY(tenant_id,source_id,remote_key),
 FOREIGN KEY(tenant_id,source_id) REFERENCES km.ingest_sources ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE SET NULL (page_id)
);
CREATE TABLE km.ingest_sync_receipts (
 tenant_id uuid NOT NULL, source_id uuid NOT NULL, id uuid NOT NULL, digest text NOT NULL,
 count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES km.ingest_sources ON DELETE CASCADE
);
DO $$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['ingest_sources','ingest_objects','ingest_sync_receipts'] LOOP
  EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING (tenant_id=nullif(current_setting(''km.tenant_id'',true),'''')::uuid)',relation);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON km.%I TO km_app',relation);
 END LOOP;
END $$;

CREATE TABLE km.ingest_publication_files (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL, publication_id uuid NOT NULL,
 attachment_id uuid NOT NULL, digest text NOT NULL,
 PRIMARY KEY(tenant_id,page_id,publication_id,attachment_id),
 FOREIGN KEY(tenant_id,page_id,publication_id) REFERENCES km.editor_publications ON DELETE CASCADE
);
ALTER TABLE km.ingest_publication_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.ingest_publication_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON km.ingest_publication_files USING (tenant_id=nullif(current_setting('km.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT ON km.ingest_publication_files TO km_app;
ALTER TABLE km.ingest_chunks ADD COLUMN attachment_id uuid;
CREATE FUNCTION km.ingest_freeze_files() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 INSERT INTO km.ingest_publication_files(tenant_id,page_id,publication_id,attachment_id,digest)
  SELECT tenant_id,page_id,NEW.id,id,sha256 FROM km.wiki_attachments
  WHERE tenant_id=NEW.tenant_id AND page_id=NEW.page_id AND scan_state='clean';
 RETURN NEW;
END $$;
CREATE TRIGGER ingest_freeze_files AFTER INSERT ON km.editor_publications FOR EACH ROW EXECUTE FUNCTION km.ingest_freeze_files();
CREATE VIEW km.ingest_clean_files WITH (security_invoker=true) AS
 SELECT f.tenant_id,f.page_id,f.publication_id,a.id,a.filename,a.content_type,a.bytes,f.digest
 FROM km.ingest_publication_files f JOIN km.wiki_attachments a
 ON(a.tenant_id,a.page_id,a.id,a.sha256)=(f.tenant_id,f.page_id,f.attachment_id,f.digest)
 WHERE a.scan_state='clean';
GRANT SELECT ON km.ingest_clean_files TO km_app;
