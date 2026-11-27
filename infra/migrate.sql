\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(71189001);
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS km AUTHORIZATION km_migrate;
SET LOCAL ROLE km_migrate;
CREATE TABLE IF NOT EXISTS km.migrations (version integer PRIMARY KEY, checksum text NOT NULL);
SELECT EXISTS (SELECT 1 FROM km.migrations WHERE version = 1) AS applied, EXISTS (
  SELECT 1 FROM km.migrations WHERE version <> 1 OR checksum <> :'checksum'
) AS incompatible \gset
\if :incompatible
  DO $$ BEGIN RAISE EXCEPTION 'Unsupported migration version or checksum'; END $$;
\endif
\if :applied
\else
  \ir v1-up.sql
  INSERT INTO km.migrations VALUES (1, :'checksum');
\endif
COMMIT;
