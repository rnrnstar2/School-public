# Atom Status Promotion — Approval Gate & Runbook

**Wave 15 / B4 / Audit G5 hands-on follow-up**
Owner: Coordinator (W15) → Owner approval required before production apply
Last updated: 2026-05-09

## Why this exists

Production の `lesson_atom_versions` 分布は **1241 draft / 24 reviewed (98% draft)**。
planner は `apps/web/src/lib/atoms/atom-repository.ts::statusMatchesMin` を経由して
`minStatus = 'reviewed'` で filter するため、98% の atom が plan 候補から
落ちる。一方、現実的に 1241 件全部に「人間が yaml content を読んで判断する」
真の review を回す体力は無い。本 doc はその構造的 gap を **人間 review semantics
を破壊しない形で解消する** ための判断基準・approval gate・rollback runbook を
まとめる。

## Decision: 半自動 promote の判断基準

`actively used in shipped anchors → 暗黙的 review 済` という基準で以下の Tier を
定義し、各 Tier の atom を `draft → reviewed` に promote する。

### Tier A (anchor 直接参照)

`lesson-factory/lessons/anchors/*.yaml` の `ordered_atom_ids` で参照されている
atom は、anchor を「shipped flow」として load した時点で **plan に乗ることが
前提** になっている。よって anchor が active な限り、暗黙的に review 済とみなす。

- **件数**: 44 (Wave 15 時点)
- **persona scope**: 9 personas + crm-builder 8-step + web-builder.cli 7-step
- **包含基準**: `anchor.<persona>.{start,default}` の `ordered_atom_ids` に
  1 回でも出現したら Tier A

### Tier B (hard prerequisite 推移閉包)

Tier A atom が `hard_prerequisites` で要求する atom は、Tier A の前提条件として
plan に必ず積まれる。learner が Tier A atom を実行する時点で前提 atom も
review されないと辻褄が合わないため、Tier A と同じ semantics で promote する。

- **件数**: 3 (Wave 15 時点)
- **包含基準**: Tier A から `hard_prerequisites` を BFS で展開した closure。
  `soft_prerequisites` は **含めない** (recommendation のみで blocker ではない)。

### Tier C (capability_inputs producer, 1-hop)

Tier A atom の `capability_inputs` を満たす producer atom は、planner が
candidate として参照する可能性がある。1 hop だけ展開する (再帰させない理由は
graph 全体に広がるため)。

- **件数**: 0 (Wave 15 時点 — anchor entry atoms は capability_inputs が
  ほぼ空)
- **包含基準**: Tier A の `capability_inputs` を出力する atom を 1 件でも
  hit したら追加。同 atom が Tier A / B にも含まれる場合は重複排除して
  Tier C には数えない。

### 判断基準を **満たさない** atom (=今 promote しない)

- どの anchor からも参照されない
- どの anchor 直参照 atom も hard_prerequisite として要求していない
- どの anchor 直参照 atom の capability_inputs も埋めない

これら ~1190 件はそのまま draft で据え置き、将来:

- 新規 anchor がドラフトされたら yaml diff から再集計して promote (= 本 doc
  と script の再実行)
- 個別 atom が `/lesson-factory` の review loop で人間 review を経たら
  reviewed/experimental/stable に昇格

## Promotion options (両論)

両 option ともに owner / Coordinator の判断で choose する。本 PR (W15 B4) は
**Option 2 (DB UPDATE only)** で実装している。

### Option 1: yaml 側で `status: reviewed` を立てる

- ✅ Source-of-truth (yaml repo) と DB が一致する
- ✅ 次回 `pnpm lesson:sync` 時に自然に reviewed が再現される
- ❌ 47 yaml ファイルを diff する必要がある (true edit, large PR)
- ❌ yaml 編集 = 真実改変なので個別 review が要る (1241 全件と同じ問題)
- ❌ lesson-factory は owner-local の lesson 製造ラインで、bulk yaml 書き換えは
  作業ループの semantics と衝突する

### Option 2: DB UPDATE のみ (本 PR の選択)

- ✅ migration 1 本で 47 atom を一括 promote、PR diff も最小
- ✅ yaml は touch しないので owner の lesson 製造ループに干渉しない
- ✅ `lesson_atom_audit` に event 記録、rollback も SQL 1 本で可能
- ❌ yaml と DB の `status` 整合が一時的にずれる (yaml=draft, DB=reviewed)
- ❌ 次回 `lesson:sync` が `status: draft` で上書きする可能性 (要確認)

→ **next step**: Wave 16 で sync CLI が DB の `status` を尊重するか、
  あるいは yaml 側へ反映する方向 (Option 1) に切り替えるかを Coordinator /
  Owner で判定。

## Approval Gate (本 PR の merge 条件)

本 PR は production DB に **直接 apply しない**。以下のフローで owner approval
を得る。

1. PR description に下記を必ず明記する:
   - **promote 対象 atom の総件数** (Wave 15 時点 47, ただし production DB の
     draft 件数次第で実 promote 数は減る)
   - **persona scope** (9 personas + crm-builder + web-builder.cli)
   - **対象 atom_id 一覧** (本 doc 末尾の表 + migration WHERE 句リテラル)
2. PR review で Coordinator または Owner が:
   - persona scope が user-facing flow と一致するか確認
   - 含まれている atom_id にエンジニア専用 / risky atom が無いか抜き打ち確認
3. owner approval を pull request review (✅ approve) で残す
4. merge 後、Coordinator が `mcp__supabase__apply_migration` で production
   apply (Worker は production DB を直接触らない)
5. apply 後、planner が `step_count > 0` を返すかを `apps/web` E2E / smoke で
   検証

## Rollback runbook

migration 適用後、**意図しない atom が reviewed 状態になっていることが判明した**
場合の手順:

### 即時 rollback (全 47 atom を draft に戻す)

```sql
-- 直近の bulk promotion の audit log から version_id を逆引きして revert.
-- audit log は 1 row / atom なので、安全に対象を限定できる。
UPDATE lesson_atom_versions
SET status = 'draft'
WHERE version_id IN (
  SELECT version_id
  FROM lesson_atom_audit
  WHERE action = 'bulk_promote_anchor_required'
    AND after_state ->> 'operator' = 'w15-b4-migration'
);

-- audit log にも revert event を記録 (任意)
INSERT INTO lesson_atom_audit (action, atom_id, version_id, before_state, after_state)
SELECT
  'rollback_bulk_promote_anchor_required',
  atom_id,
  version_id,
  jsonb_build_object('status', 'reviewed'),
  jsonb_build_object('status', 'draft', 'operator', 'rollback', 'related_action', 'bulk_promote_anchor_required')
FROM lesson_atom_audit
WHERE action = 'bulk_promote_anchor_required'
  AND after_state ->> 'operator' = 'w15-b4-migration';
```

### 個別 atom rollback (1 件だけ revert)

```sql
UPDATE lesson_atom_versions
SET status = 'draft'
WHERE atom_id = '<対象 atom_id>'
  AND status = 'reviewed'
  AND version_id = (
    SELECT version_id
    FROM lesson_atom_audit
    WHERE action = 'bulk_promote_anchor_required'
      AND atom_id = '<対象 atom_id>'
    ORDER BY occurred_at DESC
    LIMIT 1
  );
```

### audit log の保全

`lesson_atom_audit` table 自体は touch せず、history を残す。audit log は
`action = 'bulk_promote_anchor_required'` で grep 可能。

## Promote 対象 atom 一覧 (Wave 15 時点)

集計 source: `node scripts/atoms/list-anchor-required-atoms.mjs --format=md-table`

| atom_id | tier | persona_scope | yaml_status | promote_target |
| --- | --- | --- | --- | --- |
| `atom.ai-freelancer.banner-thumbnail-creation` | A | persona.designer | draft | reviewed |
| `atom.ai-freelancer.first-job-strategy` | A | persona.ai-freelancer | draft | reviewed |
| `atom.ai-freelancer.icon-avatar-generation` | A | persona.designer | draft | reviewed |
| `atom.ai-freelancer.image-copyright-commercial` | A | persona.designer | draft | reviewed |
| `atom.ai-freelancer.image-gen-basics` | A | persona.designer | draft | reviewed |
| `atom.ai-freelancer.mock-project-writing` | A | persona.ai-freelancer | draft | reviewed |
| `atom.ai-freelancer.niche-positioning` | A | persona.ai-freelancer | draft | reviewed |
| `atom.ai-freelancer.portfolio-with-ai` | A | persona.ai-freelancer | draft | reviewed |
| `atom.ai-freelancer.sns-copy-ai` | A | persona.ai-content-creator | draft | reviewed |
| `atom.ai-freelancer.twitter-branding` | A | persona.ai-freelancer | draft | reviewed |
| `atom.ai-marketer.ad-headlines-generate` | A | persona.nonengineer-marketer | draft | reviewed |
| `atom.ai-marketer.ai-task-select` | A | persona.nonengineer-marketer | draft | reviewed |
| `atom.ai-marketer.brand-assets-prepare` | A | persona.nonengineer-marketer | draft | reviewed |
| `atom.ai-marketer.next-actions-prioritize` | A | persona.crm-builder | draft | reviewed |
| `atom.ai-marketer.nurture-flow-design` | A | persona.crm-builder | draft | reviewed |
| `atom.common.choose-llm-by-task` | A | persona.ai-content-creator, persona.nonengineer-marketer | draft | reviewed |
| `atom.common.delegate-full-feature-to-cli-agent` | A | persona.ai-app-builder, persona.noneng-webapp, persona.saas-mvp, persona.web-builder | reviewed | reviewed |
| `atom.common.draft-content-calendar` | A | persona.ai-content-creator, persona.nonengineer-marketer | draft | reviewed |
| `atom.common.scaffold-with-bolt` | A | persona.ai-app-builder | reviewed | reviewed |
| `atom.common.scaffold-with-v0` | A | persona.noneng-webapp, persona.web-builder | reviewed | reviewed |
| `atom.common.use-lovable-1shot` | A | persona.saas-mvp | reviewed | reviewed |
| `atom.nocode-builder.build-readable-dashboards` | A | persona.crm-builder | draft | reviewed |
| `atom.nocode-builder.build-request-form` | A | persona.crm-builder | draft | reviewed |
| `atom.nocode-builder.build-status-visibility` | A | persona.crm-builder | draft | reviewed |
| `atom.nocode-builder.design-access-control` | A | persona.crm-builder | draft | reviewed |
| `atom.nocode-builder.design-reporting-views` | A | persona.crm-builder | draft | reviewed |
| `atom.nocode-builder.design-tables-and-relations` | A | persona.crm-builder | draft | reviewed |
| `atom.office-automator.create-automation-roadmap` | A | persona.ai-automation | draft | reviewed |
| `atom.office-automator.cross-app-sync` | A | persona.ai-automation | draft | reviewed |
| `atom.office-automator.daily-report-automation` | A | persona.ai-automation | draft | reviewed |
| `atom.office-automator.spreadsheet-formula-ai` | A | persona.ai-automation | draft | reviewed |
| `atom.office-automator.zapier-basics` | A | persona.ai-automation | draft | reviewed |
| `atom.training-designer.visual-asset-generation` | A | persona.designer | draft | reviewed |
| `atom.video-creator.batch-produce-short-scripts` | A | persona.ai-content-creator | draft | reviewed |
| `atom.video-creator.generate-video-ideas` | A | persona.ai-content-creator | draft | reviewed |
| `atom.web-builder.choose-project-goal` | A | persona.ai-app-builder, persona.noneng-webapp, persona.saas-mvp, persona.web-builder, persona.web-builder.cli | reviewed | reviewed |
| `atom.web-builder.create-homepage` | A | persona.web-builder.cli | draft | reviewed |
| `atom.web-builder.create-next-app` | A | persona.web-builder.cli | draft | reviewed |
| `atom.web-builder.deploy-with-vercel-cli` | A | persona.ai-app-builder, persona.noneng-webapp, persona.saas-mvp, persona.web-builder | reviewed | reviewed |
| `atom.web-builder.git-github-cli` | A | persona.web-builder.cli | draft | reviewed |
| `atom.web-builder.install-shadcn` | A | persona.web-builder.cli | draft | reviewed |
| `atom.web-builder.let-claude-build-everything` | A | persona.ai-app-builder, persona.noneng-webapp, persona.saas-mvp, persona.web-builder | reviewed | reviewed |
| `atom.web-builder.node-pnpm-setup` | A | persona.web-builder.cli | draft | reviewed |
| `atom.web-builder.terminal-basics` | A | persona.web-builder.cli | draft | reviewed |
| `atom.nocode-builder.understand-data-ui-logic` | B | persona.crm-builder | draft | reviewed |
| `atom.video-creator.write-shooting-script` | B | persona.ai-content-creator | draft | reviewed |
| `atom.web-builder.how-web-works` | B | persona.web-builder.cli | draft | reviewed |

**集計サマリ**:
- Tier A (anchor 直参照): 44 件 / うち yaml status=reviewed: 7、draft: 37
- Tier B (hard prereq closure): 3 件 / 全て draft
- Tier C (capability_inputs closure, 1-hop): 0 件
- 総 union: 47 件
- migration による実 promote 数: production DB の draft 件数次第 (最大 40 件:
  yaml status=draft の 37 + Tier B 3)

## Re-running the audit

```bash
# Human-readable summary
node scripts/atoms/list-anchor-required-atoms.mjs

# JSON export (CI / dashboards)
node scripts/atoms/list-anchor-required-atoms.mjs --format=json

# SQL IN-list (for pasting into a new migration)
node scripts/atoms/list-anchor-required-atoms.mjs --format=sql-list

# Markdown table (for updating this doc)
node scripts/atoms/list-anchor-required-atoms.mjs --format=md-table
```

新規 anchor が land した、または anchor の `ordered_atom_ids` が変わった
場合は本 script を再実行し、本 doc の表と新規 migration を生成する。
