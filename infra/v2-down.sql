\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(71189001);
-- The isolated lab runs rollback with the bootstrap operator; the runtime role lacks DDL.
DROP TABLE km.identity_audit, km.identity_grants, km.service_tokens,
  km.service_clients, km.identity_resources, km.identity_roles, km.identity_group_members,
  km.identity_group_edges, km.identity_groups, km.identity_limits, km.proofs,
  km.spent_refresh, km.session_families, km.memberships, km.organizations;
DELETE FROM km.migrations WHERE version = 2;
COMMIT;
