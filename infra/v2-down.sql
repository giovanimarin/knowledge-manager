\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(71189001);
-- The isolated lab runs rollback with the bootstrap operator; the runtime role lacks DDL.
DROP TABLE IF EXISTS km.wiki_tombstones, km.wiki_transfer_jobs, km.wiki_attachments, km.wiki_templates, km.wiki_comments, km.wiki_relations, km.wiki_pages, km.wiki_spaces;
DELETE FROM km.migrations WHERE version = 4;
DROP FUNCTION IF EXISTS km.worker_reserve(uuid,timestamptz), km.worker_change(uuid,timestamptz,boolean);
DROP TABLE IF EXISTS km.worker_slots, km.worker_attempts, km.worker_jobs, km.worker_policy;
DELETE FROM km.migrations WHERE version = 3;
DROP FUNCTION km.member_requires_mfa(uuid,uuid);
DROP TABLE km.deployment_identity, km.privacy_requests, km.identity_audit, km.identity_grants, km.service_tokens,
  km.service_clients, km.identity_resources, km.identity_roles, km.identity_group_members,
  km.identity_group_edges, km.identity_groups, km.identity_limits, km.proofs,
  km.spent_refresh, km.session_families, km.memberships, km.organizations;
DELETE FROM km.migrations WHERE version = 2;
COMMIT;
