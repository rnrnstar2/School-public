BEGIN;

-- Phase 8-2: retire the legacy canonical lesson model now that lesson_atoms is the
-- single source of truth. This migration is intentionally destructive.

DROP FUNCTION IF EXISTS public.sync_legacy_lesson_to_canonical(jsonb);

DROP TABLE IF EXISTS plan_nodes CASCADE;
DROP TABLE IF EXISTS plans_v2 CASCADE;
DROP TABLE IF EXISTS lesson_identities CASCADE;
DROP TABLE IF EXISTS lesson_content_chunks CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;

COMMENT ON COLUMN compiled_plans.steps IS
  'jsonb array of plan steps. each item: { atom_id text, milestone_id text, rationale text, estimated_minutes int, completed_at timestamptz | null }';

-- DOWN MIGRATION:
-- Restore from a pre-Phase-8 database backup or snapshot before replaying the
-- removed legacy migrations and seed data. This migration permanently drops
-- legacy lesson tables and any dependent objects via CASCADE.

COMMIT;
