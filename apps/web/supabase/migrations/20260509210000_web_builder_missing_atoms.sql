-- W15 B3 (2026-05-09): Backfill 2 atom.web-builder.* yaml into DB lesson_atoms.
--
-- Background (Wave 14/15 audit G5):
--   `lesson-factory/lessons/atoms/atom.web-builder.let-claude-build-everything.yaml`
--   と `atom.web-builder.deploy-with-vercel-cli.yaml` は anchor.web-builder.start
--   の `ordered_atom_ids` で参照されているが、DB lesson_atoms / lesson_atom_versions
--   には行が無かった。compile pipeline は topo 補完なしでは step 5/5 を返せず、
--   web-builder anchor が 2/5 step だけ表示される状態だった。
--
-- This migration ports the yaml content into DB seed rows so the planner sees
--   them with status='reviewed'. yaml は引き続き編集真実であり、lesson-factory
--   sync CLI が後でこれらを上書きしても問題ない。
--
-- Pattern follows W63 (20260509180000_atom_common_db_seed_w63.sql) exactly:
--   - lesson_atoms upsert (PK atom_id, source_path)
--   - lesson_atom_versions insert (status='reviewed', yaml_hash, yaml_content,
--     metadata, imported_by='w15-b3-migration')
--   - lesson_atom_capabilities insert per capability_outputs
--   - update lesson_atoms.current_version_id to point to new version
--
-- Idempotency:
--   - DELETE existing version / capability / prerequisite rows for these atom_ids
--     first (inside a transaction), then re-insert. Re-running the migration
--     produces the same final state with no side-effects.
--   - lesson_atoms uses ON CONFLICT(atom_id) DO UPDATE.
--   - lesson_atom_capabilities uses ON CONFLICT DO NOTHING.
--
-- Production apply: deferred to Coordinator via mcp__supabase__apply_migration.
--   This worker only authors the migration file.

BEGIN;

-- Step 1: Clear existing rows for these atom_ids so this migration is fully
-- idempotent. (lesson_atoms row itself is preserved via ON CONFLICT below.)
DO $w15_b3_cleanup$
DECLARE
  v_atom_id text;
  v_atom_ids text[] := ARRAY[
    'atom.web-builder.let-claude-build-everything',
    'atom.web-builder.deploy-with-vercel-cli'
  ];
BEGIN
  FOREACH v_atom_id IN ARRAY v_atom_ids LOOP
    UPDATE lesson_atoms SET current_version_id = NULL WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_versions WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_capabilities WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_prerequisites WHERE atom_id = v_atom_id;
  END LOOP;
END
$w15_b3_cleanup$;

-- Step 2: Seed each atom.

-- atom.web-builder.let-claude-build-everything
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.web-builder.let-claude-build-everything', 'lessons/atoms/atom.web-builder.let-claude-build-everything.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.web-builder.let-claude-build-everything', 'reviewed', 'fd286eff89b8e8d9bf754dacbd915c4174e8d5cd04a97d9a8edde1d0f98fb242', '{"id":"atom.web-builder.let-claude-build-everything","title":"Claude Code に「全部作って」と委譲する","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","portfolio-site","business-homepage","saas-mvp","automation","stage:build","level:beginner"],"capability_inputs":[],"capability_outputs":["delegate-build-to-cli-agent"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.choose-coding-cli"],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["screenshot","url","log_output"],"media_slots":["screen_capture"],"freshness_sources":["claude-code/docs","cursor/docs","openai-codex-docs"],"status":"reviewed"}'::jsonb, '{"title":"Claude Code に「全部作って」と委譲する","source_path":"lessons/atoms/atom.web-builder.let-claude-build-everything.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","portfolio-site","business-homepage","saas-mvp","automation","stage:build","level:beginner"],"capability_inputs":[],"capability_outputs":["delegate-build-to-cli-agent"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.choose-coding-cli"],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["screenshot","url","log_output"],"media_slots":["screen_capture"],"freshness_sources":["claude-code/docs","cursor/docs","openai-codex-docs"]}'::jsonb, 'w15-b3-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.web-builder.let-claude-build-everything';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.web-builder.let-claude-build-everything', 'delegate-build-to-cli-agent', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.web-builder.deploy-with-vercel-cli
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.web-builder.deploy-with-vercel-cli', 'lessons/atoms/atom.web-builder.deploy-with-vercel-cli.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.web-builder.deploy-with-vercel-cli', 'reviewed', '4a475d99cfe9974159e61be64382c7e134fa9c8f3d75cc2a44cb5d233178fef3', '{"id":"atom.web-builder.deploy-with-vercel-cli","title":"Vercel CLI で 1 コマンド deploy する","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","portfolio-site","business-homepage","landing-page","stage:deploy","level:beginner"],"capability_inputs":[],"capability_outputs":["deploy-with-vercel-cli"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","log_output","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["vercel.com/docs/cli"],"status":"reviewed"}'::jsonb, '{"title":"Vercel CLI で 1 コマンド deploy する","source_path":"lessons/atoms/atom.web-builder.deploy-with-vercel-cli.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","portfolio-site","business-homepage","landing-page","stage:deploy","level:beginner"],"capability_inputs":[],"capability_outputs":["deploy-with-vercel-cli"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","log_output","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["vercel.com/docs/cli"]}'::jsonb, 'w15-b3-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.web-builder.deploy-with-vercel-cli';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.web-builder.deploy-with-vercel-cli', 'deploy-with-vercel-cli', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

COMMIT;
