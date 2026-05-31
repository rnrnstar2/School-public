-- W51 (2026-05-09): lesson_anchors の 4/9 不在を 9/9 に揃える migration。
--
-- 背景 (Audit G2 hands-on):
--   W46 で `lesson-factory/lessons/anchors/` に 9 yaml が land したが、local
--   supabase の `lesson_anchors` には 5 row のみ (web-builder / ai-app-builder /
--   saas-mvp / nonengineer-marketer / designer)。この 4 row 不在のため
--   `persona.ai-content-creator` 等で compile すると DB 側 anchor が null →
--   yaml fallback はあるが production DB 観測時に 4/9 が永久に欠ける状態に
--   なっていた。
--
--   先行 migration `20260509150000_anchor_no_code_first.sql` が 5 anchor を
--   no-code-first 5-step に揃えており、本 migration はその延長で残り 4 anchor
--   (ai-content-creator / ai-freelancer / ai-automation / crm-builder) を追加し
--   `lesson_anchors` を 9/9 にする。
--
-- canonical な ordered_atom_ids / required_capabilities の出所:
--   lesson-factory/lessons/anchors/{ai-content-creator,ai-freelancer,
--                                    ai-automation,crm-builder}.yaml
--
-- anchor_id 命名:
--   既存 5 row は `anchor.<persona>.default` 形式。本 migration もそれに揃える
--   (yaml 内 id は `*.start` 形式だが production DB のキーは `.default` で
--    既に固定されている、`fetchAnchorForPersona()` の lookup は persona_id 経由
--    なので suffix の差は機能影響なし)。
--
-- 安全性:
--  - personas は ON CONFLICT DO NOTHING で既存行を保護。
--  - lesson_anchors は ON CONFLICT DO UPDATE で idempotent。
--  - persona.ai-freelancer / persona.ai-automation は seed.sql に未登録だった
--    ので本 migration で先に upsert (FK 用途)。yaml 自体は別 TQ で land 想定。

BEGIN;

-- Step 1: FK 先 personas を upsert。ai-content-creator / crm-builder は
-- seed.sql 由来で既に存在するが、ai-freelancer / ai-automation は seed.sql に
-- 無いので本 migration で初めて登場する。source_path は将来 yaml が land した
-- 時の想定パス (W46 で lessons/anchors/<name>.yaml は land 済みだが persona
-- yaml は別 task)。
INSERT INTO personas (persona_id, source_path, created_at, updated_at) VALUES
  ('persona.ai-content-creator', 'lesson-factory/evals/personas/ai-content-creator.persona.yaml', NOW(), NOW()),
  ('persona.crm-builder', 'lesson-factory/evals/personas/crm-builder.persona.yaml', NOW(), NOW()),
  ('persona.ai-freelancer', 'lesson-factory/lessons/personas/persona.ai-freelancer.yaml', NOW(), NOW()),
  ('persona.ai-automation', 'lesson-factory/lessons/personas/persona.ai-automation.yaml', NOW(), NOW())
ON CONFLICT (persona_id) DO NOTHING;

-- Step 2: ai-content-creator anchor を新規追加 (動画 / SNS no-code-first)。
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.ai-content-creator.default',
  'persona.ai-content-creator',
  $json$[
    "atom.video-creator.generate-video-ideas",
    "atom.common.choose-llm-by-task",
    "atom.video-creator.batch-produce-short-scripts",
    "atom.ai-freelancer.sns-copy-ai",
    "atom.common.draft-content-calendar"
  ]$json$::jsonb,
  $json$[
    "generate-video-ideas-with-ai",
    "choose-llm-by-task",
    "batch-produce-short-scripts",
    "generate-sns-copy-with-ai",
    "content-calendar-drafted"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the ai-content-creator persona (W51 mirrors W46 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 3: ai-freelancer anchor を新規追加 (副業 no-code-first)。
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.ai-freelancer.default',
  'persona.ai-freelancer',
  $json$[
    "atom.ai-freelancer.mock-project-writing",
    "atom.ai-freelancer.niche-positioning",
    "atom.ai-freelancer.portfolio-with-ai",
    "atom.ai-freelancer.twitter-branding",
    "atom.ai-freelancer.first-job-strategy"
  ]$json$::jsonb,
  $json$[
    "produce-mock-writing-with-ai",
    "decide-niche-positioning",
    "build-portfolio-with-ai",
    "launch-twitter-branding",
    "execute-first-job-strategy"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the ai-freelancer persona (W51 mirrors W46 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 4: ai-automation anchor を新規追加 (Excel/Sheets / Zapier no-code)。
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.ai-automation.default',
  'persona.ai-automation',
  $json$[
    "atom.office-automator.spreadsheet-formula-ai",
    "atom.office-automator.daily-report-automation",
    "atom.office-automator.zapier-basics",
    "atom.office-automator.cross-app-sync",
    "atom.office-automator.create-automation-roadmap"
  ]$json$::jsonb,
  $json$[
    "automate-spreadsheet-with-ai",
    "automate-daily-report",
    "build-zapier-workflow",
    "sync-cross-app-data",
    "draft-automation-roadmap"
  ]$json$::jsonb,
  'No-code-first 5-step anchor for the ai-automation persona (W51 mirrors W46 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

-- Step 5: crm-builder anchor を新規追加 (顧客フォロー web app 内製ジャーニー
-- 8-step、W49 で salvage された yaml と整合)。
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.crm-builder.default',
  'persona.crm-builder',
  $json$[
    "atom.nocode-builder.design-tables-and-relations",
    "atom.nocode-builder.design-access-control",
    "atom.nocode-builder.build-request-form",
    "atom.nocode-builder.build-status-visibility",
    "atom.ai-marketer.nurture-flow-design",
    "atom.ai-marketer.next-actions-prioritize",
    "atom.nocode-builder.design-reporting-views",
    "atom.nocode-builder.build-readable-dashboards"
  ]$json$::jsonb,
  $json$[
    "design-table-schema-with-ai",
    "design-access-control",
    "build-request-form",
    "visualize-status-transitions",
    "design-nurture-flow",
    "prioritize-next-actions",
    "design-reporting-views",
    "build-readable-dashboard"
  ]$json$::jsonb,
  'CRM-builder 8-step anchor for persona.crm-builder (W51 mirrors W49 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

COMMIT;
