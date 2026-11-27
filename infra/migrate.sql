\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(71189001);
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS km AUTHORIZATION km_migrate;
SET LOCAL ROLE km_migrate;
CREATE TABLE IF NOT EXISTS km.migrations (version integer PRIMARY KEY, checksum text NOT NULL);
SELECT EXISTS (SELECT 1 FROM km.migrations WHERE version = 1) AS applied, EXISTS (
  SELECT 1 FROM km.migrations WHERE version NOT IN (1,2,3,4,5) OR (version = 1 AND checksum <> :'checksum') OR (version = 2 AND checksum <> :'identity_checksum') OR (version = 3 AND checksum <> :'worker_checksum') OR (version = 4 AND checksum <> :'wiki_checksum') OR (version = 5 AND checksum <> :'wiki_objects_checksum')
) AS incompatible \gset
\if :incompatible
  DO $$ BEGIN RAISE EXCEPTION 'Unsupported migration version or checksum'; END $$;
\endif
\if :applied
\else
  \ir v1-up.sql
  INSERT INTO km.migrations VALUES (1, :'checksum');
\endif
SELECT EXISTS (SELECT FROM km.migrations WHERE version = 2) AS identity_applied \gset
\if :identity_applied
\else
  \ir v2-up.sql
  INSERT INTO km.migrations VALUES (2, :'identity_checksum');
\endif
SELECT EXISTS (SELECT FROM km.migrations WHERE version = 3) AS worker_applied \gset
\if :worker_applied
\else
  \ir v3-up.sql
  INSERT INTO km.migrations VALUES (3, :'worker_checksum');
\endif
SELECT EXISTS (SELECT FROM km.migrations WHERE version = 4) AS wiki_applied \gset
\if :wiki_applied
\else
  \ir v4-up.sql
  INSERT INTO km.migrations VALUES (4, :'wiki_checksum');
\endif
SELECT EXISTS (SELECT FROM km.migrations WHERE version = 5) AS wiki_objects_applied \gset
\if :wiki_objects_applied
\else
  \ir v5-up.sql
  INSERT INTO km.migrations VALUES (5, :'wiki_objects_checksum');
\endif
COMMIT;
