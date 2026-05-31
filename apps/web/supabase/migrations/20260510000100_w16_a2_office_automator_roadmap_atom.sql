-- W16 A2 (2026-05-10): Backfill atom.office-automator.create-automation-roadmap
-- yaml into DB lesson_atoms.
--
-- Background (Wave 14/15 audit G5 round 5, ai-automation persona):
--   `lesson-factory/lessons/atoms/atom.office-automator.create-automation-roadmap.yaml`
--   は anchor.ai-automation.default の `ordered_atom_ids` 5 step 目と
--   `required_capabilities` の `create-automation-roadmap` で参照されているが、
--   DB lesson_atoms / lesson_atom_versions / lesson_atom_capabilities には行が無く、
--   compile pipeline は anchor 終端 capability を hit できず ai-automation の
--   `coverageScore` が 0 / `unsupportedCapabilities = ['create-automation-roadmap']`
--   の状態が round 5 まで残存していた (raw-r5/compile-ai-automation.json 参照)。
--
-- This migration ports the yaml content into DB seed rows so the planner sees
--   them with status='reviewed'. yaml は引き続き編集真実であり、lesson-factory
--   sync CLI が後でこれらを上書きしても問題ない。
--
-- Pattern follows W15 B3 (20260509210000_web_builder_missing_atoms.sql) exactly:
--   - lesson_atoms upsert (PK atom_id, source_path)
--   - lesson_atom_versions insert (status='reviewed', yaml_hash, yaml_content,
--     metadata, imported_by='w16-a2-migration')
--   - lesson_atom_capabilities insert per capability_outputs
--   - update lesson_atoms.current_version_id to point to new version
--
-- Idempotency:
--   - DELETE existing version / capability / prerequisite rows for this atom_id
--     first (inside a transaction), then re-insert. Re-running the migration
--     produces the same final state with no side-effects.
--   - lesson_atoms uses ON CONFLICT(atom_id) DO UPDATE.
--   - lesson_atom_capabilities uses ON CONFLICT DO NOTHING.
--
-- Production apply: deferred to Coordinator via mcp__supabase__apply_migration.
--   This worker only authors the migration file.

BEGIN;

-- Step 1: Clear existing rows for this atom_id so this migration is fully
-- idempotent. (lesson_atoms row itself is preserved via ON CONFLICT below.)
DO $w16_a2_cleanup$
DECLARE
  v_atom_id text;
  v_atom_ids text[] := ARRAY[
    'atom.office-automator.create-automation-roadmap'
  ];
BEGIN
  FOREACH v_atom_id IN ARRAY v_atom_ids LOOP
    UPDATE lesson_atoms SET current_version_id = NULL WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_versions WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_capabilities WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_prerequisites WHERE atom_id = v_atom_id;
  END LOOP;
END
$w16_a2_cleanup$;

-- Step 2: Seed atom.office-automator.create-automation-roadmap.

INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.office-automator.create-automation-roadmap', 'lessons/atoms/atom.office-automator.create-automation-roadmap.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.office-automator.create-automation-roadmap', 'reviewed', '387982c0a1ad0c3a7593751499094ed4d081fc1e88d1707ebff74cb68f9b984a', '{"id":"atom.office-automator.create-automation-roadmap","title":"3ヶ月の自動化ロードマップを作る","persona_tags":["office-automator","ai-first-learner"],"goal_tags":["business-automation","productivity"],"capability_inputs":[],"capability_outputs":["create-automation-roadmap"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"3ヶ月の自動化ロードマップを作る","source_path":"lessons/atoms/atom.office-automator.create-automation-roadmap.yaml","persona_tags":["office-automator","ai-first-learner"],"goal_tags":["business-automation","productivity"],"capability_inputs":[],"capability_outputs":["create-automation-roadmap"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[]}'::jsonb, 'w16-a2-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.office-automator.create-automation-roadmap';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.office-automator.create-automation-roadmap', 'create-automation-roadmap', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

COMMIT;
