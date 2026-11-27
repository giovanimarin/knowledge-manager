CREATE TABLE km.wiki_uploads (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, id uuid NOT NULL,
  principal_id uuid NOT NULL, principal_kind text NOT NULL,
  filename text NOT NULL, media_type text NOT NULL, size integer NOT NULL, checksum text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE CASCADE,
  CHECK (size BETWEEN 1 AND 8388608), CHECK (checksum ~ '^[0-9a-f]{64}$')
);
ALTER TABLE km.wiki_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.wiki_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON km.wiki_uploads USING
  (tenant_id=nullif(current_setting('km.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON km.wiki_uploads TO km_app;
