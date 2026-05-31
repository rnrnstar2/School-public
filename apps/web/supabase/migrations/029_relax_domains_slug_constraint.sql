-- ============================================================
-- Migration 029: Relax domains.slug constraint
-- ============================================================
-- Allow future/unknown domain slugs while preserving the existing
-- uniqueness/non-null guarantees for canonical domains.
-- ============================================================

BEGIN;

ALTER TABLE domains
  DROP CONSTRAINT IF EXISTS domains_slug_check;

COMMIT;
