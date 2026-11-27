\set ON_ERROR_STOP on
BEGIN;
-- The local restore has no authoritative post-snapshot lifecycle stream yet.
-- Preserve identity history for reconciliation and deny restored credentials.
UPDATE km.organizations SET state='suspended', policy_epoch=policy_epoch+1 WHERE state='active';
UPDATE km.session_families SET revoked_at=now() WHERE revoked_at IS NULL;
UPDATE km.service_clients SET revoked_at=now() WHERE revoked_at IS NULL;
DELETE FROM km.service_tokens;
DELETE FROM km.proofs;
COMMIT;
