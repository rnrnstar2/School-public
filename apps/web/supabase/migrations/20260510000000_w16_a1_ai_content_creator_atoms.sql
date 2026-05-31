-- W16 A1 (2026-05-10): Seed 4 atom.ai-content-creator.* yaml into DB lesson_atoms.
--
-- Background (Wave 15 G5 round 5 audit):
--   anchor.ai-content-creator.start (persona.ai-content-creator) の
--   `required_capabilities` のうち以下 4 capability が round 5 audit で
--   unsupported 残存していた:
--     - choose-llm-by-task
--     - batch-produce-short-scripts
--     - create-sns-copy-with-ai
--     - content-calendar-drafted
--
--   既存供給元 yaml (atom.common.choose-llm-by-task / atom.common.draft-content-calendar /
--   atom.ai-freelancer.sns-copy-ai / atom.video-creator.batch-produce-short-scripts) は
--   いずれも status='draft' で、planner の minStatus='reviewed' フィルタにより
--   ai-content-creator anchor の compile pipeline からは見えない。
--   W64 video-creator review migration は lane discipline で video-creator.* のみを
--   reviewed 昇格しており、common.* / ai-freelancer.* は対象外。
--
--   本 migration は ai-content-creator persona namespace で 4 つの reviewed atom を
--   独立に seed することで、`/api/plans/compile` の persona-tag-bridge / capability
--   resolver が ai-content-creator anchor の required_capabilities を全充足できる
--   状態を作る (unsupportedCapabilities=[] / step_count >= 1)。
--
-- Pattern follows W15-B3 (20260509210000_web_builder_missing_atoms.sql) exactly:
--   - lesson_atoms upsert (PK atom_id, source_path)
--   - lesson_atom_versions insert (status='reviewed', yaml_hash, yaml_content,
--     metadata, imported_by='w16-a1-migration')
--   - lesson_atom_capabilities insert per capability_outputs (direction='output')
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
DO $w16_a1_cleanup$
DECLARE
  v_atom_id text;
  v_atom_ids text[] := ARRAY[
    'atom.ai-content-creator.choose-llm-by-task',
    'atom.ai-content-creator.batch-produce-short-scripts',
    'atom.ai-content-creator.create-sns-copy-with-ai',
    'atom.ai-content-creator.content-calendar-drafted'
  ];
BEGIN
  FOREACH v_atom_id IN ARRAY v_atom_ids LOOP
    UPDATE lesson_atoms SET current_version_id = NULL WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_versions WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_capabilities WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_prerequisites WHERE atom_id = v_atom_id;
  END LOOP;
END
$w16_a1_cleanup$;

-- Step 2: Seed each atom.

-- atom.ai-content-creator.choose-llm-by-task
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.ai-content-creator.choose-llm-by-task', 'lessons/atoms/atom.ai-content-creator.choose-llm-by-task.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.ai-content-creator.choose-llm-by-task', 'reviewed', '2dc0217c9a005087105a69943fa41a961788ca6c681d92e9f402faa02c692498', '{"id":"atom.ai-content-creator.choose-llm-by-task","title":"コンテンツ用途別に LLM（ChatGPT / Claude 等）を使い分ける","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","choose-tool","learn-tool","publish-content"],"capability_inputs":[],"capability_outputs":["choose-llm-by-task"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["openai-model-releases","anthropic-model-releases"],"estimated_minutes":15,"status":"reviewed"}'::jsonb, '{"title":"コンテンツ用途別に LLM（ChatGPT / Claude 等）を使い分ける","source_path":"lessons/atoms/atom.ai-content-creator.choose-llm-by-task.yaml","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","choose-tool","learn-tool","publish-content"],"capability_inputs":[],"capability_outputs":["choose-llm-by-task"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["openai-model-releases","anthropic-model-releases"],"estimated_minutes":15}'::jsonb, 'w16-a1-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.ai-content-creator.choose-llm-by-task';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.ai-content-creator.choose-llm-by-task', 'choose-llm-by-task', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.ai-content-creator.batch-produce-short-scripts
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.ai-content-creator.batch-produce-short-scripts', 'lessons/atoms/atom.ai-content-creator.batch-produce-short-scripts.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.ai-content-creator.batch-produce-short-scripts', 'reviewed', '009726f9663a07fad16f9704ec2be2a2793d03f4caa83b4d5e1f6f244ab74934', '{"id":"atom.ai-content-creator.batch-produce-short-scripts","title":"ショート動画の台本を 1 セッションでまとめ生成する","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","efficiency","video-production"],"capability_inputs":[],"capability_outputs":["batch-produce-short-scripts"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[],"estimated_minutes":25,"status":"reviewed"}'::jsonb, '{"title":"ショート動画の台本を 1 セッションでまとめ生成する","source_path":"lessons/atoms/atom.ai-content-creator.batch-produce-short-scripts.yaml","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","efficiency","video-production"],"capability_inputs":[],"capability_outputs":["batch-produce-short-scripts"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[],"estimated_minutes":25}'::jsonb, 'w16-a1-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.ai-content-creator.batch-produce-short-scripts';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.ai-content-creator.batch-produce-short-scripts', 'batch-produce-short-scripts', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.ai-content-creator.create-sns-copy-with-ai
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.ai-content-creator.create-sns-copy-with-ai', 'lessons/atoms/atom.ai-content-creator.create-sns-copy-with-ai.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.ai-content-creator.create-sns-copy-with-ai', 'reviewed', '8f135c33c84a6d21466ba46d62bd510f04cdc2b1ec2fb8d8acf0f23a44242034', '{"id":"atom.ai-content-creator.create-sns-copy-with-ai","title":"SNS 投稿コピーを AI で媒体別に量産する","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","side-income"],"capability_inputs":[],"capability_outputs":["create-sns-copy-with-ai"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[],"estimated_minutes":15,"status":"reviewed"}'::jsonb, '{"title":"SNS 投稿コピーを AI で媒体別に量産する","source_path":"lessons/atoms/atom.ai-content-creator.create-sns-copy-with-ai.yaml","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","side-income"],"capability_inputs":[],"capability_outputs":["create-sns-copy-with-ai"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram","screen_capture"],"freshness_sources":[],"estimated_minutes":15}'::jsonb, 'w16-a1-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.ai-content-creator.create-sns-copy-with-ai';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.ai-content-creator.create-sns-copy-with-ai', 'create-sns-copy-with-ai', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.ai-content-creator.content-calendar-drafted
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.ai-content-creator.content-calendar-drafted', 'lessons/atoms/atom.ai-content-creator.content-calendar-drafted.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.ai-content-creator.content-calendar-drafted', 'reviewed', '4cce2edbf227cacefe6503cf12ca89c61712a732bb3dae94407a9fd1d10a1d65', '{"id":"atom.ai-content-creator.content-calendar-drafted","title":"1 ヶ月ぶんのコンテンツカレンダーを AI とドラフトする","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","plan-execution"],"capability_inputs":[],"capability_outputs":["content-calendar-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"spreadsheet","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"estimated_minutes":20,"status":"reviewed"}'::jsonb, '{"title":"1 ヶ月ぶんのコンテンツカレンダーを AI とドラフトする","source_path":"lessons/atoms/atom.ai-content-creator.content-calendar-drafted.yaml","persona_tags":["ai-content-creator","ai-first-learner"],"goal_tags":["content","publish-content","plan-execution"],"capability_inputs":[],"capability_outputs":["content-calendar-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"spreadsheet","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"estimated_minutes":20}'::jsonb, 'w16-a1-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.ai-content-creator.content-calendar-drafted';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.ai-content-creator.content-calendar-drafted', 'content-calendar-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

COMMIT;
