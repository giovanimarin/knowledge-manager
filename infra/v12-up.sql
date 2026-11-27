ALTER TABLE km.ingest_sources ADD COLUMN principal_mapping jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE km.ingest_origin_acl (
 tenant_id uuid NOT NULL,
 page_id uuid NOT NULL,
 source_id uuid NOT NULL,
 member_ids uuid[] NOT NULL CHECK(cardinality(member_ids)>0),
 PRIMARY KEY(tenant_id,page_id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,source_id) REFERENCES km.ingest_sources ON DELETE CASCADE
);
ALTER TABLE km.ingest_origin_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE km.ingest_origin_acl FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON km.ingest_origin_acl USING (tenant_id=nullif(current_setting('km.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON km.ingest_origin_acl TO km_app;
