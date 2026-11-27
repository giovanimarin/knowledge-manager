ALTER TABLE km.wiki_pages ADD COLUMN blocks jsonb NOT NULL DEFAULT '[]';
ALTER TABLE km.wiki_attachments ADD COLUMN object_size integer;
ALTER TABLE km.wiki_attachments ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE km.wiki_attachments ADD CONSTRAINT attachment_storage CHECK (
  (bytes IS NOT NULL AND object_size IS NULL) OR (bytes IS NULL AND object_size > 0));
ALTER TABLE km.wiki_attachments NO FORCE ROW LEVEL SECURITY;
UPDATE km.wiki_attachments SET scan_state='pending' WHERE scan_state='clean';
ALTER TABLE km.wiki_attachments FORCE ROW LEVEL SECURITY;
