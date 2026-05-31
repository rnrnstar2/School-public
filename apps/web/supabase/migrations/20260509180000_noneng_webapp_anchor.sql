-- W67 (2026-05-09 / Wave 14, Audit A4 b-axis + B4 #3):
-- `persona.noneng-webapp` 用の anchor を lesson_anchors に upsert する migration。
--
-- 背景:
--   `persona.noneng-webapp` は graduation matrix では既に canonical key
--   ('persona.noneng-webapp::web-builder' 等) として使われているが、
--   `lesson_anchors` 行も `lesson-factory/lessons/anchors/*.yaml` も無く、
--   `live-hearing-service.ts` の SUPPORTED_PERSONA_IDS にも未登録だった。
--   その結果 live-hearing path で `persona.noneng-webapp` は黙って drop され、
--   compile path で fetchAnchorForPersona() が null を返し、yaml fallback も
--   ファイル不在で null になる「発火しない synthetic persona」状態だった。
--
--   本 migration は対応する anchor yaml (W67 で land する
--   `lesson-factory/lessons/anchors/noneng-webapp.yaml`) と整合する 5-step
--   no-code-first 経路を DB に upsert し、9/9 persona 全開状態を達成する。
--
-- canonical な ordered_atom_ids / required_capabilities の出所:
--   lesson-factory/lessons/anchors/noneng-webapp.yaml (W67)
--
-- anchor_id 命名:
--   既存 anchor は `anchor.<persona>.default` 形式 (W51 / 20260509170000)。
--   本 migration もそれに揃える (yaml 内 id は `anchor.noneng-webapp.start`
--   だが production DB のキーは `.default` 系で揃っており、`fetchAnchorForPersona()`
--   の lookup は persona_id 経由なので suffix の差は機能影響なし)。
--
-- 安全性:
--  - personas は ON CONFLICT DO NOTHING で既存行を保護。
--  - lesson_anchors は ON CONFLICT DO UPDATE で idempotent。

BEGIN;

-- Step 1: FK 先 personas を upsert。persona.noneng-webapp は seed.sql に未登録
-- なので本 migration で初めて DB に登場する。source_path は将来 persona yaml
-- が land した時の想定パス (W46 mirror)。
INSERT INTO personas (persona_id, source_path, created_at, updated_at) VALUES
  ('persona.noneng-webapp', 'lesson-factory/lessons/personas/persona.noneng-webapp.yaml', NOW(), NOW())
ON CONFLICT (persona_id) DO NOTHING;

-- Step 2: noneng-webapp anchor を upsert (no-code-first 5 step)。
INSERT INTO lesson_anchors (
  anchor_id,
  persona_id,
  ordered_atom_ids,
  required_capabilities,
  description
) VALUES (
  'anchor.noneng-webapp.default',
  'persona.noneng-webapp',
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
  'No-code-first 5-step anchor for persona.noneng-webapp (W67 mirrors W67 yaml).'
)
ON CONFLICT (anchor_id) DO UPDATE SET
  persona_id = EXCLUDED.persona_id,
  ordered_atom_ids = EXCLUDED.ordered_atom_ids,
  required_capabilities = EXCLUDED.required_capabilities,
  description = EXCLUDED.description;

COMMIT;
