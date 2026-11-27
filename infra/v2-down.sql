\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(71189001);
-- The isolated lab runs rollback with the bootstrap operator; the runtime role lacks DDL.
DROP VIEW IF EXISTS km.ingest_eligible;
DROP VIEW IF EXISTS km.ingest_clean_files;
DROP TRIGGER IF EXISTS ingest_freeze_files ON km.editor_publications;
DROP FUNCTION IF EXISTS km.ingest_freeze_files();
DROP TABLE IF EXISTS km.ingest_publication_files;
DROP TRIGGER IF EXISTS ingest_capture ON km.editor_outbox;
DROP FUNCTION IF EXISTS km.ingest_capture();
DROP TABLE IF EXISTS km.ingest_sync_receipts, km.ingest_objects, km.ingest_sources;
DROP TABLE IF EXISTS km.ingest_chunks, km.ingest_generations, km.ingest_vectors, km.ingest_jobs, km.ingest_origin_denials, km.ingest_tenants;
DROP TABLE IF EXISTS km.editor_outbox, km.editor_publications, km.editor_reviews, km.editor_space_policy, km.editor_versions, km.editor_receipts, km.editor_states;
DROP TABLE IF EXISTS km.wiki_uploads, km.wiki_settings, km.wiki_tombstones, km.wiki_transfer_jobs, km.wiki_attachments, km.wiki_templates, km.wiki_comments, km.wiki_relations, km.wiki_pages, km.wiki_spaces;
DELETE FROM km.migrations WHERE version IN (4,5,6,7,8);
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
