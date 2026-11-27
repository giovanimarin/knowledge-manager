ALTER TABLE km.ingest_sources
 ADD COLUMN runner_id uuid,
 ADD COLUMN credential text,
 ADD COLUMN target text,
 ADD CONSTRAINT ingest_source_credential_complete
 CHECK((runner_id IS NULL AND credential IS NULL AND target IS NULL)
    OR (runner_id IS NOT NULL AND credential IS NOT NULL AND target IS NOT NULL)),
 ADD FOREIGN KEY(tenant_id,runner_id) REFERENCES km.service_clients(tenant_id,id);
