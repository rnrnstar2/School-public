BEGIN;

-- Phase 8-2 completion: drop the legacy canonical / admin lesson model now
-- that apps/web and apps/admin have been fully migrated onto lesson_atoms.
--
-- All code references to these tables were removed in the same PR that
-- introduced this migration. Dropping with CASCADE is intentional because
-- lesson_blocks / lesson_assets / lesson_content_tags / etc. hang off of
-- `lessons` via foreign keys and have no independent consumers left.
--
-- DOWN MIGRATION: restore from a pre-Phase-8 database snapshot.

-- Plan / content tree ----------------------------------------------------
DROP TABLE IF EXISTS plan_nodes CASCADE;
DROP TABLE IF EXISTS plans_v2 CASCADE;
DROP TABLE IF EXISTS lesson_identities CASCADE;
DROP TABLE IF EXISTS lesson_content_chunks CASCADE;
DROP TABLE IF EXISTS lesson_versions CASCADE;
DROP TABLE IF EXISTS lesson_variants CASCADE;
DROP TABLE IF EXISTS lesson_blocks CASCADE;
DROP TABLE IF EXISTS lesson_assets CASCADE;
DROP TABLE IF EXISTS lesson_content_tags CASCADE;
DROP TABLE IF EXISTS lesson_prerequisites_v2 CASCADE;
DROP TABLE IF EXISTS lesson_objectives CASCADE;
DROP TABLE IF EXISTS content_tags CASCADE;

-- Legacy admin surface ---------------------------------------------------
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS themes CASCADE;
DROP TABLE IF EXISTS tool_profiles CASCADE;
DROP TABLE IF EXISTS track_views CASCADE;

-- Associated helper function (was used by legacy sync glue)
DROP FUNCTION IF EXISTS public.sync_legacy_lesson_to_canonical(jsonb);

COMMIT;
