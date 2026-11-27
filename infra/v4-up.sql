CREATE TABLE km.wiki_spaces (
  tenant_id uuid NOT NULL, id uuid NOT NULL, title text NOT NULL,
  metadata_schema jsonb NOT NULL DEFAULT '{}',
  deleted_batch uuid, deleted_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,id) REFERENCES km.identity_resources
);
CREATE TABLE km.wiki_pages (
  tenant_id uuid NOT NULL, id uuid NOT NULL, space_id uuid NOT NULL, parent_id uuid,
  title text NOT NULL, content text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}',
  category text, metadata jsonb NOT NULL DEFAULT '{}', owner_id uuid,
  author_id uuid, revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_batch uuid, deleted_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,id) REFERENCES km.identity_resources,
  FOREIGN KEY (tenant_id,space_id) REFERENCES km.wiki_spaces,
  FOREIGN KEY (tenant_id,parent_id) REFERENCES km.wiki_pages,
  FOREIGN KEY (tenant_id,author_id) REFERENCES km.memberships,
  FOREIGN KEY (tenant_id,owner_id) REFERENCES km.memberships,
  CHECK (id <> parent_id)
);
CREATE INDEX ON km.wiki_pages (tenant_id,space_id,parent_id);
CREATE INDEX ON km.wiki_pages (tenant_id,updated_at DESC);
CREATE TABLE km.wiki_relations (
  tenant_id uuid NOT NULL, id uuid NOT NULL, source_id uuid NOT NULL, target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dependency','complement','replacement','reference')),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source_id,target_id,kind),
  FOREIGN KEY (tenant_id,source_id) REFERENCES km.wiki_pages,
  FOREIGN KEY (tenant_id,target_id) REFERENCES km.wiki_pages,
  CHECK (source_id <> target_id)
);
CREATE INDEX ON km.wiki_relations (tenant_id,target_id);
CREATE TABLE km.wiki_comments (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, id uuid NOT NULL, root_id uuid,
  actor_id uuid NOT NULL, anchor uuid, body text NOT NULL, resolved boolean NOT NULL DEFAULT false,
  mentions uuid[] NOT NULL DEFAULT '{}', history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,page_id,id),
  FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages,
  FOREIGN KEY (tenant_id,page_id,root_id) REFERENCES km.wiki_comments,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES km.memberships
);
CREATE TABLE km.wiki_templates (
  tenant_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL,
  space_id uuid, title text NOT NULL, content text NOT NULL, fields jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id,id,revision),
  FOREIGN KEY (tenant_id,space_id) REFERENCES km.wiki_spaces
);
CREATE TABLE km.wiki_attachments (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, id uuid NOT NULL, filename text NOT NULL,
  content_type text NOT NULL, bytes bytea NOT NULL, sha256 text NOT NULL,
  scan_state text NOT NULL DEFAULT 'pending' CHECK (scan_state IN ('pending','clean','rejected')),
  PRIMARY KEY (tenant_id,page_id,id),
  FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages
);
CREATE TABLE km.wiki_transfer_jobs (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL, principal_id uuid NOT NULL, principal_kind text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('import','export')),
  format text NOT NULL, target_ids uuid[] NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['wiki_spaces','wiki_pages','wiki_relations','wiki_comments','wiki_templates','wiki_attachments','wiki_transfer_jobs'] LOOP
    EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING
      (tenant_id = nullif(current_setting(''km.tenant_id'',true),'''')::uuid)', relation);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON km.%I TO km_app', relation);
  END LOOP;
END $$;
GRANT INSERT ON km.identity_resources TO km_app;
GRANT UPDATE (parent_id,classification) ON km.identity_resources TO km_app;
