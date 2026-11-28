ALTER TABLE km.ingest_sources ADD COLUMN provider text CHECK(provider IN
 ('github','gitlab','bitbucket','drive','sharepoint','onedrive','confluence','notion','s3','gcs')),
 ADD COLUMN credential_version integer NOT NULL DEFAULT 0,
 ADD COLUMN webhook_secret text,
 ADD COLUMN native_cursor text,
 ADD COLUMN revoked_at timestamptz;

CREATE TABLE km.ingest_signals (
 tenant_id uuid NOT NULL, source_id uuid NOT NULL, credential_version integer NOT NULL,
 delivery text NOT NULL, digest text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 PRIMARY KEY(tenant_id,source_id,credential_version,delivery),
 FOREIGN KEY(tenant_id,source_id) REFERENCES km.ingest_sources ON DELETE CASCADE
);
CREATE UNIQUE INDEX ON km.ingest_signals(tenant_id,source_id,credential_version,digest);
CREATE INDEX ON km.ingest_signals(tenant_id,source_id,credential_version,received_at) WHERE processed_at IS NULL;
ALTER TABLE km.ingest_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.ingest_signals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON km.ingest_signals USING (tenant_id=nullif(current_setting('km.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON km.ingest_signals TO km_app;
