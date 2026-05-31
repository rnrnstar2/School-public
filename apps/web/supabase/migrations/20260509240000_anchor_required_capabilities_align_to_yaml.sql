-- W15 B2 (2026-05-09): anchor `required_capabilities` を yaml の
-- `capability_outputs` に揃える migration (Codex 分析 Option A: yaml = 真実)。
--
-- 背景 (Audit G5 + Codex `B2-capability-truth-source.md`):
--   anchor の `required_capabilities` は、各 `ordered_atom_ids[i]` の atom yaml
--   `capability_outputs` と 1:1 対応するべき不変条件。だが anchor 設計者が
--   yaml を grep せず想像で書いた結果、drift が発生していた。yaml と DB の
--   `lesson_atom_capabilities` は一致 (yaml から機械 backfill)、drift は anchor
--   `required_capabilities` 側にだけ集中していた。
--
--   compile pipeline の `coverageScore` は anchor.required_capabilities が
--   atom の capability_outputs に hit するかで計算するため、drift があると
--   coverage が 0 になり `unsupportedCapabilities` が生まれる。本 migration で
--   その drift を解消する。
--
-- 真実 source (Option A):
--   lesson-factory/lessons/atoms/<atom-id>.yaml の `capability_outputs`
--
-- 本 migration の影響:
--   - lesson_anchors.required_capabilities (jsonb) を yaml と整合する値に UPDATE。
--   - ordered_atom_ids は touch しない (W51 / W67 で yaml と既に同期)。
--   - description は touch しない。
--
-- 修正対象 9 anchor (lesson_anchors に行が存在するもの):
--   - anchor.ai-automation.default     (5 cap drift; spreadsheet/report/zap/sync/roadmap)
--   - anchor.ai-content-creator.default(1 cap drift; sns-copy)
--   - anchor.ai-freelancer.default     (5 cap drift; mock/niche/portfolio/twitter/first-job)
--   - anchor.crm-builder.default       (5 cap drift; access/form/status/nurture/report)
--   - anchor.ai-app-builder.default    (no drift; idempotent re-set for safety)
--   - anchor.designer.default          (no drift; idempotent re-set)
--   - anchor.noneng-webapp.default     (no drift; idempotent re-set)
--   - anchor.nonengineer-marketer.default (no drift; idempotent re-set)
--   - anchor.saas-mvp.default          (no drift; idempotent re-set)
--   - anchor.web-builder.default       (no drift; idempotent re-set)
--
-- yaml `anchor.web-builder.cli` は DB seed 済み行がなく (TQ-217 で `anchor.web-builder.cli`
-- は yaml regression 専用 / DB seed 不要) 本 migration では対象外。
--
-- 安全性:
--   - 全 UPDATE は `WHERE anchor_id = '...'` で 1 行 affect。
--   - 何度走らせても結果は同じ (idempotent)。
--   - rollback 用に旧値を本 migration の comment block 末尾に jsonb で残す。
--
-- Source (yaml post-fix):
--   lesson-factory/lessons/anchors/{ai-automation,ai-content-creator,
--     ai-freelancer,crm-builder,ai-app-builder,designer,noneng-webapp,
--     nonengineer-marketer,saas-mvp,web-builder}.yaml

BEGIN;

-- 1. anchor.ai-automation.default
UPDATE lesson_anchors SET required_capabilities = $json$[
  "ask-ai-for-spreadsheet-formula",
  "create-ai-assisted-daily-report",
  "create-basic-zap",
  "build-cross-app-sync-flow",
  "create-automation-roadmap"
]$json$::jsonb WHERE anchor_id = 'anchor.ai-automation.default';

-- 2. anchor.ai-content-creator.default
UPDATE lesson_anchors SET required_capabilities = $json$[
  "generate-video-ideas-with-ai",
  "choose-llm-by-task",
  "batch-produce-short-scripts",
  "create-sns-copy-with-ai",
  "content-calendar-drafted"
]$json$::jsonb WHERE anchor_id = 'anchor.ai-content-creator.default';

-- 3. anchor.ai-freelancer.default
UPDATE lesson_anchors SET required_capabilities = $json$[
  "deliver-mock-writing-project",
  "identify-personal-niche",
  "create-portfolio-piece-with-ai",
  "publish-first-sns-post",
  "submit-first-proposal"
]$json$::jsonb WHERE anchor_id = 'anchor.ai-freelancer.default';

-- 4. anchor.crm-builder.default
UPDATE lesson_anchors SET required_capabilities = $json$[
  "design-table-schema-with-ai",
  "design-access-control-matrix",
  "build-simple-form-with-ai",
  "build-progress-dashboard",
  "design-step-email-sequence",
  "prioritize-next-actions",
  "design-report-layout-with-ai",
  "build-readable-dashboard"
]$json$::jsonb WHERE anchor_id = 'anchor.crm-builder.default';

-- 5. anchor.ai-app-builder.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "scaffold-app-with-bolt",
  "define-project-goal",
  "delegate-build-to-cli-agent",
  "delegate-feature-to-cli-agent",
  "deploy-with-vercel-cli"
]$json$::jsonb WHERE anchor_id = 'anchor.ai-app-builder.default';

-- 6. anchor.designer.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "generate-image-with-prompt",
  "generate-icon-avatar-with-ai",
  "create-banner-with-ai-and-canva",
  "generate-diagram-with-ai",
  "check-ai-image-commercial-use"
]$json$::jsonb WHERE anchor_id = 'anchor.designer.default';

-- 7. anchor.noneng-webapp.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "scaffold-ui-with-v0",
  "define-project-goal",
  "delegate-build-to-cli-agent",
  "deploy-with-vercel-cli",
  "delegate-feature-to-cli-agent"
]$json$::jsonb WHERE anchor_id = 'anchor.noneng-webapp.default';

-- 8. anchor.nonengineer-marketer.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "generate-ad-headlines-with-ai",
  "choose-llm-by-task",
  "brand-brief-created",
  "select-ai-delegatable-task",
  "content-calendar-drafted"
]$json$::jsonb WHERE anchor_id = 'anchor.nonengineer-marketer.default';

-- 9. anchor.saas-mvp.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "scaffold-app-with-lovable",
  "define-project-goal",
  "delegate-build-to-cli-agent",
  "delegate-feature-to-cli-agent",
  "deploy-with-vercel-cli"
]$json$::jsonb WHERE anchor_id = 'anchor.saas-mvp.default';

-- 10. anchor.web-builder.default (idempotent re-set; no drift)
UPDATE lesson_anchors SET required_capabilities = $json$[
  "scaffold-ui-with-v0",
  "define-project-goal",
  "delegate-build-to-cli-agent",
  "deploy-with-vercel-cli",
  "delegate-feature-to-cli-agent"
]$json$::jsonb WHERE anchor_id = 'anchor.web-builder.default';

COMMIT;

-- ============================================================================
-- Rollback: 旧値 (drift があった anchor のみ)
-- ----------------------------------------------------------------------------
-- 緊急時は以下 jsonb で UPDATE して旧値に戻せる (W15 B2 以前の状態)。
--
-- UPDATE lesson_anchors SET required_capabilities = $json$[
--   "automate-spreadsheet-with-ai",
--   "automate-daily-report",
--   "build-zapier-workflow",
--   "sync-cross-app-data",
--   "draft-automation-roadmap"
-- ]$json$::jsonb WHERE anchor_id = 'anchor.ai-automation.default';
--
-- UPDATE lesson_anchors SET required_capabilities = $json$[
--   "generate-video-ideas-with-ai",
--   "choose-llm-by-task",
--   "batch-produce-short-scripts",
--   "generate-sns-copy-with-ai",
--   "content-calendar-drafted"
-- ]$json$::jsonb WHERE anchor_id = 'anchor.ai-content-creator.default';
--
-- UPDATE lesson_anchors SET required_capabilities = $json$[
--   "produce-mock-writing-with-ai",
--   "decide-niche-positioning",
--   "build-portfolio-with-ai",
--   "launch-twitter-branding",
--   "execute-first-job-strategy"
-- ]$json$::jsonb WHERE anchor_id = 'anchor.ai-freelancer.default';
--
-- UPDATE lesson_anchors SET required_capabilities = $json$[
--   "design-table-schema-with-ai",
--   "design-access-control",
--   "build-request-form",
--   "visualize-status-transitions",
--   "design-nurture-flow",
--   "prioritize-next-actions",
--   "design-reporting-views",
--   "build-readable-dashboard"
-- ]$json$::jsonb WHERE anchor_id = 'anchor.crm-builder.default';
-- ============================================================================
