CREATE TABLE km.probe_receipts (id uuid PRIMARY KEY);
CREATE TABLE km.fixture_objects (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id, id)
);
ALTER TABLE km.fixture_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.fixture_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY fixture_isolation ON km.fixture_objects
  USING (tenant_id::text = current_setting('km.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('km.tenant_id', true));
GRANT USAGE ON SCHEMA km TO km_app;
GRANT SELECT ON km.migrations TO km_app;
GRANT SELECT, INSERT ON km.probe_receipts TO km_app;
GRANT SELECT, INSERT ON km.fixture_objects TO km_app;
