-- W15 B4 (2026-05-09): bulk promote anchor-required atoms from draft → reviewed.
--
-- Background (Audit G5):
--   `lesson_atom_versions` 分布が 1241 draft / 24 reviewed (production)。
--   planner (`apps/web/src/lib/atoms/atom-repository.ts::statusMatchesMin`) は
--   `minStatus = 'reviewed'` で filter するため 98% の atom が plan に積まれない。
--   anchor が直接参照する atom も `draft` のままなので、persona 別 anchor が
--   compile 時に step_count: 0 を返す risk が継続している。
--
-- 解決方針:
--   1241 全件を一括 promote すると人間 review semantics が壊れる。
--   そこで「anchor が active reference として要求する atom」に限定し、
--   暗黙的 review 済 (= shipped anchor の path 上にある) とみなして昇格する。
--
-- 対象集合 (集計 script: `scripts/atoms/list-anchor-required-atoms.mjs`):
--   - Tier A (44): 11 anchor の `ordered_atom_ids` で直接参照
--   - Tier B (3) : Tier A atom の hard_prerequisites を transitive 展開
--   - Tier C (0) : Tier A atom の capability_inputs producer (1 hop)
--   - 合計 47 件 (= migration WHERE 句の母集合)
--
--   yaml 上 7 件は既に `status: reviewed`。残り 40 件が `draft` 状態。
--   migration の `WHERE status = 'draft'` で本当に昇格するのは production の
--   draft 状態の atom のみ (実件数は production DB 状態に依存)。
--
-- Approval gate:
--   PR description に対象 atom_id 一覧 + persona scope + 期待件数を明記し、
--   owner approval 後にのみ merge / production 適用。
--   詳細は `docs/atom-status-promotion.md` の "Approval Gate" 節参照。
--
-- Idempotency:
--   - `WHERE status = 'draft'` で再適用しても副作用なし。
--   - 既に reviewed / experimental / stable / archived は touch しない。
--   - audit log は 1 row / atom で記録 (再適用で 0 件 promote なら 0 row insert)。
--
-- Rollback:
--   - 緊急時は `docs/atom-status-promotion.md` の rollback runbook 参照。
--   - 直近 promote の audit log を逆引きして該当 atom_id を draft に戻す UPDATE が可能。
--
-- 影響範囲:
--   - `lesson_atom_versions.status` (draft → reviewed) のみ。
--   - `lesson_atom_audit` に bulk promotion event を記録。
--   - yaml_content / metadata / lesson_atoms / lesson_anchors は touch しない
--     (yaml の真実は repo 側、DB は cache)。
--
-- Source: `scripts/atoms/list-anchor-required-atoms.mjs --format=sql-list`
-- Generator output snapshot: 47 unique atom_ids (Tier A=44 + Tier B=3 + Tier C=0).

BEGIN;

-- Step 1: bulk promote draft → reviewed for anchor-required atoms.
WITH anchor_required AS (
  SELECT atom_id::text FROM (VALUES
    -- Tier A: anchor 直接参照 (44 件)
    ('atom.ai-freelancer.banner-thumbnail-creation'),
    ('atom.ai-freelancer.first-job-strategy'),
    ('atom.ai-freelancer.icon-avatar-generation'),
    ('atom.ai-freelancer.image-copyright-commercial'),
    ('atom.ai-freelancer.image-gen-basics'),
    ('atom.ai-freelancer.mock-project-writing'),
    ('atom.ai-freelancer.niche-positioning'),
    ('atom.ai-freelancer.portfolio-with-ai'),
    ('atom.ai-freelancer.sns-copy-ai'),
    ('atom.ai-freelancer.twitter-branding'),
    ('atom.ai-marketer.ad-headlines-generate'),
    ('atom.ai-marketer.ai-task-select'),
    ('atom.ai-marketer.brand-assets-prepare'),
    ('atom.ai-marketer.next-actions-prioritize'),
    ('atom.ai-marketer.nurture-flow-design'),
    ('atom.common.choose-llm-by-task'),
    ('atom.common.delegate-full-feature-to-cli-agent'),
    ('atom.common.draft-content-calendar'),
    ('atom.common.scaffold-with-bolt'),
    ('atom.common.scaffold-with-v0'),
    ('atom.common.use-lovable-1shot'),
    ('atom.nocode-builder.build-readable-dashboards'),
    ('atom.nocode-builder.build-request-form'),
    ('atom.nocode-builder.build-status-visibility'),
    ('atom.nocode-builder.design-access-control'),
    ('atom.nocode-builder.design-reporting-views'),
    ('atom.nocode-builder.design-tables-and-relations'),
    ('atom.office-automator.create-automation-roadmap'),
    ('atom.office-automator.cross-app-sync'),
    ('atom.office-automator.daily-report-automation'),
    ('atom.office-automator.spreadsheet-formula-ai'),
    ('atom.office-automator.zapier-basics'),
    ('atom.training-designer.visual-asset-generation'),
    ('atom.video-creator.batch-produce-short-scripts'),
    ('atom.video-creator.generate-video-ideas'),
    ('atom.web-builder.choose-project-goal'),
    ('atom.web-builder.create-homepage'),
    ('atom.web-builder.create-next-app'),
    ('atom.web-builder.deploy-with-vercel-cli'),
    ('atom.web-builder.git-github-cli'),
    ('atom.web-builder.install-shadcn'),
    ('atom.web-builder.let-claude-build-everything'),
    ('atom.web-builder.node-pnpm-setup'),
    ('atom.web-builder.terminal-basics'),
    -- Tier B: hard prerequisite transitive closure (3 件)
    ('atom.nocode-builder.understand-data-ui-logic'),
    ('atom.video-creator.write-shooting-script'),
    ('atom.web-builder.how-web-works')
  ) AS t(atom_id)
),
promoted AS (
  UPDATE lesson_atom_versions v
  SET status = 'reviewed'
  WHERE v.atom_id IN (SELECT atom_id FROM anchor_required)
    AND v.status = 'draft'
    -- defensive: only promote the row that lesson_atoms currently points at
    -- (= live version), so historical draft versions are not flipped.
    AND v.version_id = (
      SELECT current_version_id FROM lesson_atoms a WHERE a.atom_id = v.atom_id
    )
  RETURNING v.version_id, v.atom_id
)
-- Step 2: write 1 audit row per actually-promoted atom (idempotent: 再実行で 0 row).
INSERT INTO lesson_atom_audit (action, atom_id, version_id, before_state, after_state)
SELECT
  'bulk_promote_anchor_required',
  promoted.atom_id,
  promoted.version_id,
  jsonb_build_object('status', 'draft', 'reason', 'anchor-active-reference'),
  jsonb_build_object(
    'status', 'reviewed',
    'operator', 'w15-b4-migration',
    'reason', 'anchor-active-reference',
    'tier_summary', 'A=44 anchor-direct, B=3 hard-prereq-closure, C=0 capability-closure',
    'source_script', 'scripts/atoms/list-anchor-required-atoms.mjs'
  )
FROM promoted;

COMMIT;
