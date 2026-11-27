CREATE TABLE km.organizations (
  tenant_id uuid PRIMARY KEY,
  name text NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'closed')),
  policy_epoch bigint NOT NULL DEFAULT 0,
  session_limit integer NOT NULL DEFAULT 10 CHECK (session_limit BETWEEN 1 AND 50),
  require_mfa boolean NOT NULL DEFAULT false
);

-- Operator-only routing configuration for this deployment.
CREATE TABLE km.deployment_identity (
  singleton boolean PRIMARY KEY CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('shared','dedicated')),
  dedicated_tenant uuid REFERENCES km.organizations,
  CHECK (mode='dedicated' OR dedicated_tenant IS NULL)
);

CREATE TABLE km.memberships (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'closed')),
  admin boolean NOT NULL DEFAULT false,
  guest_until timestamptz,
  language text NOT NULL DEFAULT 'pt-BR' CHECK (language IN ('pt-BR', 'en')),
  totp_secret text,
  pending_totp text,
  totp_step bigint NOT NULL DEFAULT -1,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, email)
);

CREATE TABLE km.session_families (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  member_id uuid NOT NULL,
  access_digest text NOT NULL,
  refresh_digest text NOT NULL,
  access_until timestamptz NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  step_until timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, member_id) REFERENCES km.memberships,
  UNIQUE (tenant_id, access_digest), UNIQUE (tenant_id, refresh_digest)
);

CREATE TABLE km.spent_refresh (
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  digest text NOT NULL,
  PRIMARY KEY (tenant_id, digest),
  FOREIGN KEY (tenant_id, session_id) REFERENCES km.session_families
);

CREATE TABLE km.proofs (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invite', 'login-mfa', 'recovery', 'recovery-code')),
  member_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, digest),
  FOREIGN KEY (tenant_id, member_id) REFERENCES km.memberships
);

CREATE TABLE km.identity_limits (
  tenant_id uuid NOT NULL,
  bucket text NOT NULL,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, bucket)
);

CREATE TABLE km.identity_groups (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  name text NOT NULL,
  require_mfa boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE km.identity_group_edges (
  tenant_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, parent_id, child_id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES km.identity_groups,
  FOREIGN KEY (tenant_id, child_id) REFERENCES km.identity_groups,
  CHECK (parent_id <> child_id)
);

CREATE TABLE km.identity_group_members (
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, group_id, member_id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES km.identity_groups,
  FOREIGN KEY (tenant_id, member_id) REFERENCES km.memberships
);

CREATE TABLE km.identity_roles (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  name text NOT NULL,
  actions text[] NOT NULL CHECK (cardinality(actions) > 0),
  require_mfa boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE km.identity_resources (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  parent_id uuid,
  classification text NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,parent_id) REFERENCES km.identity_resources,
  CHECK (parent_id <> id)
);

CREATE TABLE km.service_clients (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  name text NOT NULL,
  secret_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, secret_digest)
);

CREATE TABLE km.service_tokens (
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, digest),
  FOREIGN KEY (tenant_id, client_id) REFERENCES km.service_clients
);

CREATE TABLE km.identity_grants (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL,
  role_id uuid NOT NULL,
  member_id uuid,
  group_id uuid,
  client_id uuid,
  resource_id uuid,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  purpose text,
  channel text,
  require_step_up boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,role_id) REFERENCES km.identity_roles,
  FOREIGN KEY (tenant_id,member_id) REFERENCES km.memberships,
  FOREIGN KEY (tenant_id,group_id) REFERENCES km.identity_groups,
  FOREIGN KEY (tenant_id,client_id) REFERENCES km.service_clients,
  FOREIGN KEY (tenant_id,resource_id) REFERENCES km.identity_resources,
  CHECK (num_nonnulls(member_id,group_id,client_id) = 1),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE km.privacy_requests (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  member_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('export', 'delete')),
  state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','reviewed','completed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,member_id) REFERENCES km.memberships
);

CREATE FUNCTION km.member_requires_mfa(target_tenant uuid, target_member uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, km AS $$
  WITH RECURSIVE groups(id) AS (
    SELECT group_id FROM km.identity_group_members WHERE tenant_id=target_tenant AND member_id=target_member
    UNION
    SELECT e.parent_id FROM km.identity_group_edges e JOIN groups g ON g.id=e.child_id
    WHERE e.tenant_id=target_tenant
  )
  SELECT EXISTS (
    SELECT FROM km.identity_groups g WHERE g.tenant_id=target_tenant AND g.id IN (SELECT id FROM groups) AND g.require_mfa
  ) OR EXISTS (
    SELECT FROM km.identity_grants g JOIN km.identity_roles r USING (tenant_id)
    WHERE g.tenant_id=target_tenant AND r.id=g.role_id AND r.require_mfa AND g.effect='allow'
      AND (g.member_id=target_member OR g.group_id IN (SELECT id FROM groups))
      AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
  )
$$;
REVOKE ALL ON FUNCTION km.member_requires_mfa(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION km.member_requires_mfa(uuid,uuid) TO km_app;

CREATE TABLE km.identity_audit (
  tenant_id uuid NOT NULL REFERENCES km.organizations,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('success','denied')),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id)
);
CREATE INDEX ON km.identity_limits (tenant_id,expires_at);
CREATE INDEX ON km.identity_audit (tenant_id, occurred_at DESC);
CREATE INDEX ON km.session_families (tenant_id,member_id) WHERE revoked_at IS NULL;

DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'organizations','memberships','session_families','spent_refresh','proofs','identity_limits',
    'identity_groups','identity_group_edges','identity_group_members','identity_roles',
    'identity_resources','identity_grants','service_clients','service_tokens','privacy_requests','identity_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE km.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE km.%I FORCE ROW LEVEL SECURITY', name);
    EXECUTE format('CREATE POLICY tenant_scope ON km.%I USING
      (tenant_id = nullif(current_setting(''km.tenant_id'',true),'''')::uuid) WITH CHECK
      (tenant_id = nullif(current_setting(''km.tenant_id'',true),'''')::uuid)', name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON km.memberships, km.session_families, km.identity_limits, km.service_clients TO km_app;
GRANT SELECT, INSERT, DELETE ON km.proofs, km.identity_group_edges, km.identity_group_members, km.identity_grants TO km_app;
GRANT DELETE ON km.service_tokens, km.identity_limits TO km_app;
GRANT SELECT, INSERT ON km.spent_refresh, km.identity_groups, km.identity_roles, km.service_tokens, km.identity_audit TO km_app;
GRANT SELECT ON km.organizations, km.identity_resources TO km_app;
GRANT SELECT, INSERT ON km.privacy_requests TO km_app;
GRANT UPDATE (require_mfa,session_limit) ON km.organizations TO km_app;
GRANT UPDATE (name,require_mfa) ON km.identity_groups TO km_app;
GRANT UPDATE (policy_epoch) ON km.organizations TO km_app;
