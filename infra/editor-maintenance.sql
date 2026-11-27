\set ON_ERROR_STOP on
BEGIN;
-- Hold the same tenant transaction locks used by wiki and collaboration writes.
SELECT pg_advisory_xact_lock(71189004,hashtext(tenant_id::text))
  FROM km.organizations ORDER BY tenant_id;
WITH expired AS (
  UPDATE km.editor_publications SET withdrawn_at=now()
    WHERE withdrawn_at IS NULL AND expires_at<=now()
    RETURNING tenant_id,page_id,id,revision
)
INSERT INTO km.editor_outbox(tenant_id,page_id,publication_id,revision,kind)
  SELECT tenant_id,page_id,id,revision,'withdrawn' FROM expired;
INSERT INTO km.editor_outbox(tenant_id,page_id,publication_id,revision,kind,target_id)
  SELECT p.tenant_id,p.page_id,p.id,p.revision,'review.due',coalesce(w.owner_id,p.published_by)
  FROM km.editor_publications p JOIN km.wiki_pages w ON (w.tenant_id,w.id)=(p.tenant_id,p.page_id)
  WHERE p.withdrawn_at IS NULL AND p.review_at<=now() AND w.deleted_batch IS NULL
  AND NOT EXISTS(SELECT FROM km.editor_outbox o WHERE o.tenant_id=p.tenant_id AND o.publication_id=p.id AND o.kind='review.due');
DELETE FROM km.editor_versions v USING km.wiki_pages p
 WHERE (p.tenant_id,p.id)=(v.tenant_id,v.page_id) AND p.revision<>v.revision
 AND v.saved_at<=now()-coalesce((SELECT retention_days FROM km.editor_space_policy s
   WHERE (s.tenant_id,s.space_id)=(p.tenant_id,p.space_id)),365)*interval '1 day'
 AND NOT EXISTS(SELECT FROM km.editor_publications pub WHERE (pub.tenant_id,pub.page_id,pub.revision)=(v.tenant_id,v.page_id,v.revision)
   AND pub.withdrawn_at IS NULL)
 AND NOT EXISTS(SELECT FROM km.editor_reviews r WHERE (r.tenant_id,r.page_id,r.revision)=(v.tenant_id,v.page_id,v.revision)
   AND r.status IN ('pending','approved'));
COMMIT;
