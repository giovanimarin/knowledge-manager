CREATE TABLE km.ingest_profiles (
 tenant_id uuid NOT NULL REFERENCES km.organizations ON DELETE CASCADE,
 version integer NOT NULL, model text NOT NULL, dimension integer NOT NULL CHECK(dimension BETWEEN 1 AND 4096),
 state text NOT NULL DEFAULT 'building' CHECK(state IN ('building','active','retired','failed')),
 attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz,
 PRIMARY KEY(tenant_id,version)
);
CREATE UNIQUE INDEX ON km.ingest_profiles(tenant_id) WHERE state='building';
CREATE UNIQUE INDEX ON km.ingest_profiles(tenant_id) WHERE state='active';
ALTER TABLE km.ingest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.ingest_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON km.ingest_profiles USING (tenant_id=nullif(current_setting('km.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON km.ingest_profiles TO km_app;

CREATE FUNCTION km.ingest_register_profile() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 INSERT INTO km.ingest_tenants VALUES(NEW.tenant_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION km.ingest_register_profile() FROM PUBLIC;
CREATE TRIGGER ingest_register_profile AFTER INSERT ON km.ingest_profiles
 FOR EACH ROW EXECUTE FUNCTION km.ingest_register_profile();
