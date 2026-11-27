\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE expired(tenant_id uuid,id uuid, is_space boolean, PRIMARY KEY(tenant_id,id)) ON COMMIT DROP;
CREATE TEMP TABLE expired_objects(tenant_id uuid,id uuid) ON COMMIT DROP;
DO $$
DECLARE target uuid;
BEGIN
  FOR target IN SELECT tenant_id FROM km.organizations ORDER BY tenant_id LOOP
    PERFORM pg_advisory_xact_lock(71189004,hashtext(target::text));
    WITH RECURSIVE cutoff AS (
      SELECT transaction_timestamp()-coalesce((SELECT retention_days FROM km.wiki_settings WHERE tenant_id=target),30)*interval '1 day' instant
    ), spaces AS (
      SELECT id FROM km.wiki_spaces,cutoff WHERE tenant_id=target AND deleted_at<=instant
    ), tree(id) AS (
      SELECT p.id FROM km.wiki_pages p,cutoff WHERE tenant_id=target AND (p.deleted_at<=instant OR p.space_id IN(SELECT id FROM spaces))
      UNION SELECT p.id FROM km.wiki_pages p JOIN tree t ON p.parent_id=t.id WHERE p.tenant_id=target
    )
    INSERT INTO expired
    SELECT target,id,true FROM spaces UNION ALL SELECT target,id,false FROM tree;
  END LOOP;
END $$;
INSERT INTO km.wiki_tombstones (tenant_id,id)
  SELECT tenant_id,id FROM expired ON CONFLICT DO NOTHING;
INSERT INTO km.identity_audit (tenant_id,action,resource_id,outcome)
  SELECT tenant_id,'wiki.trash.retention',id,'success' FROM expired;
DELETE FROM km.wiki_relations r USING expired e WHERE r.tenant_id=e.tenant_id AND (r.source_id=e.id OR r.target_id=e.id);
DELETE FROM km.wiki_comments c USING expired e WHERE c.tenant_id=e.tenant_id AND c.page_id=e.id;
WITH deleted AS (
  DELETE FROM km.wiki_attachments a USING expired e WHERE a.tenant_id=e.tenant_id AND a.page_id=e.id
  RETURNING a.tenant_id,a.id,a.object_size
)
INSERT INTO expired_objects SELECT tenant_id,id FROM deleted WHERE object_size IS NOT NULL;
DELETE FROM km.wiki_templates t USING expired e WHERE t.tenant_id=e.tenant_id AND t.space_id=e.id AND e.is_space;
DELETE FROM km.wiki_pages p USING expired e WHERE p.tenant_id=e.tenant_id AND p.id=e.id;
DELETE FROM km.wiki_spaces s USING expired e WHERE s.tenant_id=e.tenant_id AND s.id=e.id AND e.is_space;
UPDATE km.organizations o SET policy_epoch=policy_epoch+1 WHERE tenant_id IN (SELECT tenant_id FROM expired);
SELECT tenant_id::text||'/'||id::text FROM expired_objects;
COMMIT;
