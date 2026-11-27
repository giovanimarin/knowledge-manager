CREATE TABLE km.editor_states (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, revision integer NOT NULL,
  generation uuid NOT NULL, snapshot bytea NOT NULL,
  PRIMARY KEY (tenant_id,page_id), FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE CASCADE
);
CREATE TABLE km.editor_receipts (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, operation_id uuid NOT NULL,
  generation uuid NOT NULL, revision integer NOT NULL, digest text NOT NULL,
  PRIMARY KEY (tenant_id,page_id,operation_id),
  FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE CASCADE
);
CREATE TABLE km.editor_versions (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, revision integer NOT NULL,
  actor_id uuid, saved_at timestamptz NOT NULL DEFAULT now(), title text NOT NULL,
  content text NOT NULL, blocks jsonb NOT NULL,
  PRIMARY KEY (tenant_id,page_id,revision),
  FOREIGN KEY (tenant_id,page_id) REFERENCES km.wiki_pages ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES km.memberships
);
CREATE TABLE km.editor_space_policy (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL,
  approval_required boolean NOT NULL, retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  PRIMARY KEY(tenant_id,space_id), FOREIGN KEY(tenant_id,space_id) REFERENCES km.wiki_spaces ON DELETE CASCADE
);
CREATE TABLE km.editor_reviews (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL,
  requested_by uuid NOT NULL, reviewer_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by uuid,
  PRIMARY KEY(tenant_id,page_id,id),
  FOREIGN KEY(tenant_id,page_id,revision) REFERENCES km.editor_versions ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,requested_by) REFERENCES km.memberships,
  FOREIGN KEY(tenant_id,reviewer_id) REFERENCES km.memberships,
  FOREIGN KEY(tenant_id,decided_by) REFERENCES km.memberships
);
CREATE TABLE km.editor_publications (
  tenant_id uuid NOT NULL, page_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, review_at timestamptz,
  withdrawn_at timestamptz, published_by uuid NOT NULL,
  PRIMARY KEY(tenant_id,page_id,id),
  FOREIGN KEY(tenant_id,page_id,revision) REFERENCES km.editor_versions ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,published_by) REFERENCES km.memberships
);
CREATE UNIQUE INDEX editor_current_publication ON km.editor_publications(tenant_id,page_id) WHERE withdrawn_at IS NULL;
CREATE TABLE km.editor_outbox (
  tenant_id uuid NOT NULL REFERENCES km.organizations, id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL, publication_id uuid, revision integer,
  kind text NOT NULL CHECK (kind IN ('published','withdrawn','review.requested','review.decided','review.due')),
  target_id uuid, occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id)
);
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['editor_states','editor_receipts','editor_versions','editor_space_policy','editor_reviews','editor_publications','editor_outbox'] LOOP
    EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING
      (tenant_id = nullif(current_setting(''km.tenant_id'',true),'''')::uuid)', relation);
    EXECUTE format('GRANT SELECT, INSERT ON km.%I TO km_app', relation);
  END LOOP;
END $$;
GRANT UPDATE ON km.editor_states, km.editor_space_policy, km.editor_reviews, km.editor_publications TO km_app;
