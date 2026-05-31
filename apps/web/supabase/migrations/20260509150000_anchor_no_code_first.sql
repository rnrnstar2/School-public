-- TQ-254 (2026-05-09): production DB の lesson_anchors を no-code-first 5-step に
-- 揃えるための migration。Auditor 2 (C16) が「prod DB の anchor は textbook 18-step
-- のままで TQ-217 の解体が DB に到達していない」と検出したのを解消する。
--
-- 同時に TQ-224 で merged の 4 personas (ai-app-builder / saas-mvp /
-- nonengineer-marketer / designer) と対応 anchor も DB に push する
-- (Auditor 2 C16: anchor yaml は merged だが seed.sql 未反映で `fetchAnchorForPersona()`
--  が web-builder 以外で常に DB anchor null → ローカル yaml に fallback する状態)。
--
-- canonical な ordered_atom_ids / required_capabilities は
--   lesson-factory/lessons/anchors/{web-builder,ai-app-builder,saas-mvp,
--                                    nonengineer-marketer,designer}.yaml
-- であり、本 migration はその 5-step を DB に同期させる shadow write。
--
-- 安全性:
-- - personas は ON CONFLICT DO NOTHING で既存行を保護。
-- - lesson_anchors は ON CONFLICT DO UPDATE で既存 row を新内容に塗り替える
--   (idempotent: 何度走らせても同じ結果)。
-- - regression CLI anchor (anchor.web-builder.cli) は本 migration では追加しない
--   (P-ENG-PROTOTYPE 専用の opt-in anchor で、no-code-first レーンには不要)。

BEGIN;

-- Step 1: Wave 4 personas + web-builder を seed (FK 用途)。
-- web-builder は既に seed.sql 由来で本番に存在するが、migration 単体で適用される
-- ローカル `supabase db reset` でも persona.web-builder がまだ無い順序になるため、
-- 全 anchor が参照する persona を先に upsert しておく (idempotent)。
INSERT INTO personas (persona_id, source_path, created_at, updated_at) VALUES
  ('persona.web-builder', 'lesson-factory/evals/personas/web-builder.persona.yaml', NOW(), NOW()),
  ('persona.ai-app-builder', 'lesson-factory/lessons/personas/persona.ai-app-builder.yaml', NOW(), NOW()),
  ('persona.saas-mvp', 'lesson-factory/lessons/personas/persona.saas-mvp.yaml', NOW(), NOW()),
  ('persona.nonengineer-marketer', 'lesson-factory/lessons/personas/persona.nonengineer-marketer.yaml', NOW(), NOW()),
  ('persona.designer', 'lesson-factory/lessons/personas/persona.designer.yaml', NOW(), NOW())
ON CONFLICT (persona_id) DO NOTHING;

-- Step 2: anchor.web-builder.default を no-code-first 5-step に書き換える
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.web-builder.default',
  'persona.web-builder',
  $json$[
    "atom.common.scaffold-with-v0",
    "atom.web-builder.choose-project-goal",
    "atom.web-builder.let-claude-build-everything",
    "atom.web-builder.deploy-with-vercel-cli",
    "atom.common.delegate-full-feature-to-cli-agent"
  ]$json$::jsonb,
  $json$[
    "scaffold-ui-with-v0",
    "define-project-goal",
    "delegate-build-to-cli-agent",
    "deploy-with-vercel-cli",
    "delegate-feature-to-cli-agent"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the web-builder persona (TQ-254 refresh of TQ-217 lesson-factory yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 3: ai-app-builder anchor を新規追加
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.ai-app-builder.default',
  'persona.ai-app-builder',
  $json$[
    "atom.common.scaffold-with-bolt",
    "atom.web-builder.choose-project-goal",
    "atom.web-builder.let-claude-build-everything",
    "atom.common.delegate-full-feature-to-cli-agent",
    "atom.web-builder.deploy-with-vercel-cli"
  ]$json$::jsonb,
  $json$[
    "scaffold-app-with-bolt",
    "define-project-goal",
    "delegate-build-to-cli-agent",
    "delegate-feature-to-cli-agent",
    "deploy-with-vercel-cli"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the ai-app-builder persona (TQ-254 mirrors TQ-224 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 4: saas-mvp anchor を新規追加
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.saas-mvp.default',
  'persona.saas-mvp',
  $json$[
    "atom.common.use-lovable-1shot",
    "atom.web-builder.choose-project-goal",
    "atom.web-builder.let-claude-build-everything",
    "atom.common.delegate-full-feature-to-cli-agent",
    "atom.web-builder.deploy-with-vercel-cli"
  ]$json$::jsonb,
  $json$[
    "scaffold-app-with-lovable",
    "define-project-goal",
    "delegate-build-to-cli-agent",
    "delegate-feature-to-cli-agent",
    "deploy-with-vercel-cli"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the saas-mvp persona (TQ-254 mirrors TQ-224 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 5: nonengineer-marketer anchor を新規追加
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.nonengineer-marketer.default',
  'persona.nonengineer-marketer',
  $json$[
    "atom.ai-marketer.ad-headlines-generate",
    "atom.common.choose-llm-by-task",
    "atom.ai-marketer.brand-assets-prepare",
    "atom.ai-marketer.ai-task-select",
    "atom.common.draft-content-calendar"
  ]$json$::jsonb,
  $json$[
    "generate-ad-headlines-with-ai",
    "choose-llm-by-task",
    "brand-brief-created",
    "select-ai-delegatable-task",
    "content-calendar-drafted"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the nonengineer-marketer persona (TQ-254 mirrors TQ-224 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 6: designer anchor を新規追加
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.designer.default',
  'persona.designer',
  $json$[
    "atom.ai-freelancer.image-gen-basics",
    "atom.ai-freelancer.icon-avatar-generation",
    "atom.ai-freelancer.banner-thumbnail-creation",
    "atom.training-designer.visual-asset-generation",
    "atom.ai-freelancer.image-copyright-commercial"
  ]$json$::jsonb,
  $json$[
    "generate-image-with-prompt",
    "generate-icon-avatar-with-ai",
    "create-banner-with-ai-and-canva",
    "generate-diagram-with-ai",
    "check-ai-image-commercial-use"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the designer persona (TQ-254 mirrors TQ-224 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

COMMIT;
