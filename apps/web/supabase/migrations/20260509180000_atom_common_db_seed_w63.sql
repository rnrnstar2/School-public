-- W63 (2026-05-09): Import 16 atom.common.* yaml into DB lesson_atoms.
--
-- Background (Wave 13 audit G4 root cause #2):
--   `lesson-factory/lessons/atoms/atom.common.*.yaml` (16 files on disk) were
--   referenced by anchors via `ordered_atom_ids` (e.g.
--   atom.common.scaffold-with-v0) but the DB lesson_atoms / lesson_atom_versions
--   tables had 0 atom.common.* rows. Compile pipeline therefore could not
--   surface them as plan steps.
--
-- This migration ports the yaml content into DB seed rows so the planner sees
--   them with status='reviewed'. The yaml stays the source of truth for editorial
--   work; the lesson-factory sync CLI may overwrite these rows later as usual.
--
-- Ported source: lesson-factory/lessons/atoms/atom.common.*.yaml (16 files,
--   verified ls count). For each atom we insert:
--     - lesson_atoms row (PK atom_id, source_path)
--     - lesson_atom_versions row (status='reviewed', yaml_content, metadata)
--     - lesson_atom_capabilities rows (capability_inputs/outputs)
--   then update lesson_atoms.current_version_id to point to the new version.
--
-- Idempotency:
--   - lesson_atoms uses ON CONFLICT(atom_id) DO UPDATE.
--   - lesson_atom_versions inserts a fresh version per migration run; we use
--     ON CONFLICT (yaml_hash) DO NOTHING via partial uniqueness emulation.
--   To stay safe, we delete any existing rows for these atom_ids first inside
--   a transaction, then re-insert. This keeps the migration idempotent without
--   relying on a unique constraint we don't own.

BEGIN;

-- Step 1: For each atom.common.* atom_id, clear out any existing version /
-- capability / prerequisite rows so this migration is fully idempotent.
-- (lesson_atoms row itself is preserved via ON CONFLICT below.)
DO $w63_cleanup$
DECLARE
  v_atom_id text;
  v_atom_ids text[] := ARRAY[
    'atom.common.ad-law-basics',
    'atom.common.ai-copyright-basics',
    'atom.common.benchmark-case-study',
    'atom.common.choose-coding-cli',
    'atom.common.choose-llm-by-task',
    'atom.common.delegate-full-feature-to-cli-agent',
    'atom.common.draft-3month-roadmap',
    'atom.common.draft-ai-tool-mapping',
    'atom.common.draft-content-calendar',
    'atom.common.draft-domain-area-map',
    'atom.common.draft-income-roadmap',
    'atom.common.find-distribution-channel',
    'atom.common.scaffold-with-bolt',
    'atom.common.scaffold-with-v0',
    'atom.common.use-lovable-1shot',
    'atom.common.write-learning-roadmap'
  ];
BEGIN
  FOREACH v_atom_id IN ARRAY v_atom_ids LOOP
    UPDATE lesson_atoms SET current_version_id = NULL WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_versions WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_capabilities WHERE atom_id = v_atom_id;
    DELETE FROM lesson_atom_prerequisites WHERE atom_id = v_atom_id;
  END LOOP;
END
$w63_cleanup$;

-- Step 2: For each yaml, upsert lesson_atoms, then insert a fresh
-- lesson_atom_versions row (status='reviewed') and link via current_version_id.

-- atom.common.ad-law-basics
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.ad-law-basics', 'lessons/atoms/atom.common.ad-law-basics.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.ad-law-basics', 'reviewed', '1a8003ceb78a8191f3019ba08b814c7daff2e90f4a07912d0f7eab7730f2db5a', '{"id":"atom.common.ad-law-basics","title":"薬機法・景表法の要点を理解する","persona_tags":["ai-first-learner"],"goal_tags":["comply-with-law","publish-promo-content"],"capability_inputs":[],"capability_outputs":["judge-promo-copy-compliance"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"薬機法・景表法の要点を理解する","source_path":"lessons/atoms/atom.common.ad-law-basics.yaml","persona_tags":["ai-first-learner"],"goal_tags":["comply-with-law","publish-promo-content"],"capability_inputs":[],"capability_outputs":["judge-promo-copy-compliance"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.ad-law-basics';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.ad-law-basics', 'judge-promo-copy-compliance', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.ai-copyright-basics
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.ai-copyright-basics', 'lessons/atoms/atom.common.ai-copyright-basics.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.ai-copyright-basics', 'reviewed', '74a1b48b0f18a6dad4f0d35d9336cde98246d5076a152af159691f24abfdac6f', '{"id":"atom.common.ai-copyright-basics","title":"AI 生成物の著作権と商用利用ルール","persona_tags":["ai-first-learner"],"goal_tags":["comply-with-law","publish-content","sell-content"],"capability_inputs":[],"capability_outputs":["judge-ai-output-commercial-use"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"AI 生成物の著作権と商用利用ルール","source_path":"lessons/atoms/atom.common.ai-copyright-basics.yaml","persona_tags":["ai-first-learner"],"goal_tags":["comply-with-law","publish-content","sell-content"],"capability_inputs":[],"capability_outputs":["judge-ai-output-commercial-use"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.ai-copyright-basics';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.ai-copyright-basics', 'judge-ai-output-commercial-use', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.benchmark-case-study
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.benchmark-case-study', 'lessons/atoms/atom.common.benchmark-case-study.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.benchmark-case-study', 'reviewed', '58f73149a67063621731d8e04a6da079c83c1e3b20aa6def5a29ac441f7b1f6f', '{"id":"atom.common.benchmark-case-study","title":"ベンチマーク事例を AI で分析する","persona_tags":["ai-first-learner"],"goal_tags":["research-benchmark"],"capability_inputs":[],"capability_outputs":["benchmark-pattern-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"ベンチマーク事例を AI で分析する","source_path":"lessons/atoms/atom.common.benchmark-case-study.yaml","persona_tags":["ai-first-learner"],"goal_tags":["research-benchmark"],"capability_inputs":[],"capability_outputs":["benchmark-pattern-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.benchmark-case-study';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.benchmark-case-study', 'benchmark-pattern-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.choose-coding-cli
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.choose-coding-cli', 'lessons/atoms/atom.common.choose-coding-cli.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.choose-coding-cli', 'reviewed', '8f43743915049c38685be3acb4e391be03829f432c289a1df06b5ee2a0cec84d', '{"id":"atom.common.choose-coding-cli","title":"コーディング系 AI ツールを選ぶ","persona_tags":["ai-first-learner"],"goal_tags":["choose-tool","learn-tool","any-web-project","automate-with-code"],"capability_inputs":[],"capability_outputs":["coding-cli-chosen"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["claude-code-docs","openai-codex-docs","cursor-releases","github-copilot-docs"],"status":"reviewed"}'::jsonb, '{"title":"コーディング系 AI ツールを選ぶ","source_path":"lessons/atoms/atom.common.choose-coding-cli.yaml","persona_tags":["ai-first-learner"],"goal_tags":["choose-tool","learn-tool","any-web-project","automate-with-code"],"capability_inputs":[],"capability_outputs":["coding-cli-chosen"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["claude-code-docs","openai-codex-docs","cursor-releases","github-copilot-docs"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.choose-coding-cli';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.choose-coding-cli', 'coding-cli-chosen', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.choose-llm-by-task
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.choose-llm-by-task', 'lessons/atoms/atom.common.choose-llm-by-task.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.choose-llm-by-task', 'reviewed', 'e28bd4abd268cbc352bd7773f7a776c3f9424ed31b194aa0bc47d1660caf0761', '{"id":"atom.common.choose-llm-by-task","title":"タスク別に LLM（ChatGPT / Claude 等）を使い分ける","persona_tags":["ai-first-learner"],"goal_tags":["learn-tool","choose-tool"],"capability_inputs":[],"capability_outputs":["choose-llm-by-task"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["openai-model-releases","anthropic-model-releases"],"status":"reviewed"}'::jsonb, '{"title":"タスク別に LLM（ChatGPT / Claude 等）を使い分ける","source_path":"lessons/atoms/atom.common.choose-llm-by-task.yaml","persona_tags":["ai-first-learner"],"goal_tags":["learn-tool","choose-tool"],"capability_inputs":[],"capability_outputs":["choose-llm-by-task"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":["openai-model-releases","anthropic-model-releases"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.choose-llm-by-task';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.choose-llm-by-task', 'choose-llm-by-task', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.delegate-full-feature-to-cli-agent
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.delegate-full-feature-to-cli-agent', 'lessons/atoms/atom.common.delegate-full-feature-to-cli-agent.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.delegate-full-feature-to-cli-agent', 'reviewed', 'ab26bc4553e9ead1011fcdf4a2150007669749f48a33dbdb405ec2d408a22d37', '{"id":"atom.common.delegate-full-feature-to-cli-agent","title":"Codex CLI / Claude Code に feature 単位で丸投げする","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","automation","business-automation","workflow","stage:build","level:intermediate"],"capability_inputs":[],"capability_outputs":["delegate-feature-to-cli-agent"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.choose-coding-cli"],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["log_output","code_diff","screenshot"],"media_slots":["diagram"],"freshness_sources":["claude-code/docs","openai-codex-docs"],"status":"reviewed"}'::jsonb, '{"title":"Codex CLI / Claude Code に feature 単位で丸投げする","source_path":"lessons/atoms/atom.common.delegate-full-feature-to-cli-agent.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","automation","business-automation","workflow","stage:build","level:intermediate"],"capability_inputs":[],"capability_outputs":["delegate-feature-to-cli-agent"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.choose-coding-cli"],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["log_output","code_diff","screenshot"],"media_slots":["diagram"],"freshness_sources":["claude-code/docs","openai-codex-docs"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.delegate-full-feature-to-cli-agent';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.delegate-full-feature-to-cli-agent', 'delegate-feature-to-cli-agent', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.draft-3month-roadmap
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.draft-3month-roadmap', 'lessons/atoms/atom.common.draft-3month-roadmap.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.draft-3month-roadmap', 'reviewed', 'c845e4827f5a78b3c5067bcff11cbc4fd48d9a44554a8825503ec0fd209a7db6', '{"id":"atom.common.draft-3month-roadmap","title":"3 ヶ月の領域別実行計画を作る","persona_tags":["ai-first-learner"],"goal_tags":["plan-execution","draft-roadmap"],"capability_inputs":[],"capability_outputs":["3month-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.draft-domain-area-map"],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"3 ヶ月の領域別実行計画を作る","source_path":"lessons/atoms/atom.common.draft-3month-roadmap.yaml","persona_tags":["ai-first-learner"],"goal_tags":["plan-execution","draft-roadmap"],"capability_inputs":[],"capability_outputs":["3month-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":["atom.common.draft-domain-area-map"],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.draft-3month-roadmap';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.draft-3month-roadmap', '3month-roadmap-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.draft-ai-tool-mapping
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.draft-ai-tool-mapping', 'lessons/atoms/atom.common.draft-ai-tool-mapping.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.draft-ai-tool-mapping', 'reviewed', '305f9de2494909dfbcbeacd50d7523eaa1b8717bbd2d2950667bead4afe70052', '{"id":"atom.common.draft-ai-tool-mapping","title":"タスク別 AI ツール使い分け表を作る","persona_tags":["ai-first-learner"],"goal_tags":["choose-tool","decompose-domain"],"capability_inputs":[],"capability_outputs":["ai-tool-mapping-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"タスク別 AI ツール使い分け表を作る","source_path":"lessons/atoms/atom.common.draft-ai-tool-mapping.yaml","persona_tags":["ai-first-learner"],"goal_tags":["choose-tool","decompose-domain"],"capability_inputs":[],"capability_outputs":["ai-tool-mapping-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.draft-ai-tool-mapping';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.draft-ai-tool-mapping', 'ai-tool-mapping-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.draft-content-calendar
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.draft-content-calendar', 'lessons/atoms/atom.common.draft-content-calendar.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.draft-content-calendar', 'reviewed', '965952ea1dd8409e7be48d42925e1e8f5639301c5b941d04453cc89a9ebdad69', '{"id":"atom.common.draft-content-calendar","title":"定期コンテンツ供給スケジュールを作る","persona_tags":["ai-first-learner"],"goal_tags":["publish-content","plan-execution"],"capability_inputs":[],"capability_outputs":["content-calendar-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"定期コンテンツ供給スケジュールを作る","source_path":"lessons/atoms/atom.common.draft-content-calendar.yaml","persona_tags":["ai-first-learner"],"goal_tags":["publish-content","plan-execution"],"capability_inputs":[],"capability_outputs":["content-calendar-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.draft-content-calendar';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.draft-content-calendar', 'content-calendar-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.draft-domain-area-map
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.draft-domain-area-map', 'lessons/atoms/atom.common.draft-domain-area-map.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.draft-domain-area-map', 'reviewed', '2bc67ffc0739a2295f5fe6d3abd7c17b3aa0f6ba5da3519d53cb4f941c3e2a06', '{"id":"atom.common.draft-domain-area-map","title":"業務 / 領域マップを書き出して優先順位をつける","persona_tags":["ai-first-learner"],"goal_tags":["prioritize-work","decompose-domain"],"capability_inputs":[],"capability_outputs":["domain-area-map-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"業務 / 領域マップを書き出して優先順位をつける","source_path":"lessons/atoms/atom.common.draft-domain-area-map.yaml","persona_tags":["ai-first-learner"],"goal_tags":["prioritize-work","decompose-domain"],"capability_inputs":[],"capability_outputs":["domain-area-map-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.draft-domain-area-map';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.draft-domain-area-map', 'domain-area-map-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.draft-income-roadmap
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.draft-income-roadmap', 'lessons/atoms/atom.common.draft-income-roadmap.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.draft-income-roadmap', 'reviewed', 'ea3daaf0f2da5857ddac704ab71322aecd19f5049d689d239d6be207769089dc', '{"id":"atom.common.draft-income-roadmap","title":"収入 / 活動目標のステップ計画を作る","persona_tags":["ai-first-learner"],"goal_tags":["plan-progression","side-income","independence"],"capability_inputs":[],"capability_outputs":["income-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"収入 / 活動目標のステップ計画を作る","source_path":"lessons/atoms/atom.common.draft-income-roadmap.yaml","persona_tags":["ai-first-learner"],"goal_tags":["plan-progression","side-income","independence"],"capability_inputs":[],"capability_outputs":["income-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.draft-income-roadmap';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.draft-income-roadmap', 'income-roadmap-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.find-distribution-channel
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.find-distribution-channel', 'lessons/atoms/atom.common.find-distribution-channel.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.find-distribution-channel', 'reviewed', 'a75ac659912f411b6ac5be2ae8ad6dbd6319ab04445a6f8355b8d08b92261a50', '{"id":"atom.common.find-distribution-channel","title":"自分の goal に合うチャネル / プラットフォームを調査する","persona_tags":["ai-first-learner"],"goal_tags":["find-channel","distribute-output"],"capability_inputs":[],"capability_outputs":["distribution-channel-chosen"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"自分の goal に合うチャネル / プラットフォームを調査する","source_path":"lessons/atoms/atom.common.find-distribution-channel.yaml","persona_tags":["ai-first-learner"],"goal_tags":["find-channel","distribute-output"],"capability_inputs":[],"capability_outputs":["distribution-channel-chosen"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.find-distribution-channel';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.find-distribution-channel', 'distribution-channel-chosen', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.scaffold-with-bolt
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.scaffold-with-bolt', 'lessons/atoms/atom.common.scaffold-with-bolt.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.scaffold-with-bolt', 'reviewed', 'fe0ed202ac3ba2499c44c7e9a0985fafc8e6653578733714338aa9c09ea1bfb8', '{"id":"atom.common.scaffold-with-bolt","title":"Bolt.new でブラウザ完結の Web アプリを作る","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","saas-mvp","internal-tools","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-app-with-bolt"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["bolt.new/docs"],"status":"reviewed"}'::jsonb, '{"title":"Bolt.new でブラウザ完結の Web アプリを作る","source_path":"lessons/atoms/atom.common.scaffold-with-bolt.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","saas-mvp","internal-tools","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-app-with-bolt"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["bolt.new/docs"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.scaffold-with-bolt';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.scaffold-with-bolt', 'scaffold-app-with-bolt', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.scaffold-with-v0
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.scaffold-with-v0', 'lessons/atoms/atom.common.scaffold-with-v0.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.scaffold-with-v0', 'reviewed', '36ea3a46d7c19d1555c064ece74cd1a63720a584c32c73a674a67f4d8299bf22', '{"id":"atom.common.scaffold-with-v0","title":"v0 で UI を 1 ショット生成して Vercel に公開する","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","landing-page","portfolio-site","business-homepage","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-ui-with-v0","publish-via-vercel"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["v0.dev/docs","vercel.com/docs"],"status":"reviewed"}'::jsonb, '{"title":"v0 で UI を 1 ショット生成して Vercel に公開する","source_path":"lessons/atoms/atom.common.scaffold-with-v0.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","landing-page","portfolio-site","business-homepage","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-ui-with-v0","publish-via-vercel"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["v0.dev/docs","vercel.com/docs"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.scaffold-with-v0';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.scaffold-with-v0', 'scaffold-ui-with-v0', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.scaffold-with-v0', 'publish-via-vercel', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.use-lovable-1shot
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.use-lovable-1shot', 'lessons/atoms/atom.common.use-lovable-1shot.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.use-lovable-1shot', 'reviewed', 'd854351ca700b359fd4634c5f58b22bfe29c3e788c3b9d6c4956cc7f179e96e6', '{"id":"atom.common.use-lovable-1shot","title":"Lovable に「作りたい」を 1 文書いてアプリを得る","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","saas-mvp","landing-page","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-app-with-lovable"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["lovable.dev/docs"],"status":"reviewed"}'::jsonb, '{"title":"Lovable に「作りたい」を 1 文書いてアプリを得る","source_path":"lessons/atoms/atom.common.use-lovable-1shot.yaml","persona_tags":["web-builder","ai-app-builder","p-noneng-webapp","ai-first-learner"],"goal_tags":["any-web-project","saas-mvp","landing-page","nocode-development","stage:scaffold","level:beginner"],"capability_inputs":[],"capability_outputs":["scaffold-app-with-lovable"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"url","validation":"basic_manual_check_v1"},"evidence":["url","screenshot"],"media_slots":["screen_capture"],"freshness_sources":["lovable.dev/docs"]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.use-lovable-1shot';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.use-lovable-1shot', 'scaffold-app-with-lovable', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

-- atom.common.write-learning-roadmap
INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('atom.common.write-learning-roadmap', 'lessons/atoms/atom.common.write-learning-roadmap.yaml')
  ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

WITH inserted_version AS (
  INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)
  VALUES ('atom.common.write-learning-roadmap', 'reviewed', '9f14be1d83a8772b6a045bc68db0fb044b16f2c8c1134e80309eadc1cd271a96', '{"id":"atom.common.write-learning-roadmap","title":"自分の学習ロードマップを 1 枚にまとめる","persona_tags":["ai-first-learner"],"goal_tags":["plan-learning"],"capability_inputs":[],"capability_outputs":["learning-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[],"status":"reviewed"}'::jsonb, '{"title":"自分の学習ロードマップを 1 枚にまとめる","source_path":"lessons/atoms/atom.common.write-learning-roadmap.yaml","persona_tags":["ai-first-learner"],"goal_tags":["plan-learning"],"capability_inputs":[],"capability_outputs":["learning-roadmap-drafted"],"hard_prerequisites":[],"soft_prerequisites":[],"deliverable":{"type":"markdown_doc","validation":"basic_manual_check_v1"},"evidence":["screenshot"],"media_slots":["diagram"],"freshness_sources":[]}'::jsonb, 'w63-migration')
  RETURNING version_id
)
UPDATE lesson_atoms
  SET current_version_id = inserted_version.version_id, updated_at = now()
  FROM inserted_version
  WHERE lesson_atoms.atom_id = 'atom.common.write-learning-roadmap';
INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) VALUES ('atom.common.write-learning-roadmap', 'learning-roadmap-drafted', 'output')
  ON CONFLICT (atom_id, capability, direction) DO NOTHING;

COMMIT;
