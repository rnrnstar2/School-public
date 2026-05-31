# Lesson Sync 本番適用 Runbook (TQ-179)

> **Owner-only operation**. AI agent は本書を読んで dev 環境までの検証を行い、**本番 Supabase project への apply は maintainer のみ** が手動で実行する。
> `CLAUDE.md` 「本番デプロイは Owner 手動」原則 / `Goal2Action実装設計図.md` §7 「DB schema migration は人間ゲート」に従う。

---

## 0. なぜこの runbook が必要か

本番 Supabase の `lesson_atom_versions.yaml_content` が古いスキーマで止まっており、最新 yaml の `hard_prerequisites` / `goal_tags` (intent tag) が一切反映されていない。結果として `/plan` のプラン生成で alphabetical fallback が起き、毎回先頭が `atom.web-builder.ai-code-review` に固定される現象が観測されている。

- 観測根拠: `.agent-work/2026-04-20_plan-quality-fix/subtasks/INV-2-supabase-state/work-log.md`
- コード側の準備状況: `.agent-work/2026-04-20_plan-quality-fix/subtasks/INV-1-code-truth/work-log.md`
- 修正方針: `.agent-work/2026-04-20_plan-quality-fix/README.md` §2.4 (推奨 1 + 3)
- spec: `docs/swarmops/tasks/TQ-179/spec.md`
- 依存 PR: TQ-180 (`feat(TQ-180): web-builder anchor + intent tag enrichment + ref validator`) を **先に merge** していること。

`pnpm --filter lesson-factory lesson:sync` は `lesson_atoms` / `lesson_atom_versions` / `lesson_atom_prerequisites` / `lesson_anchors` の 4 テーブル全てを upsert する。一発実行で症状の大半が解消する見込み。

---

## 1. 前提条件 (チェックリスト)

apply 実行前に **すべて ✅** であること:

- [ ] 本リポジトリの `main` ブランチが TQ-180 の merge 済 commit を含む (`git log origin/main --oneline | grep TQ-180`)
- [ ] `pnpm install --frozen-lockfile` 完了 (`lesson-factory` workspace 含む)
- [ ] `bash scripts/ci/local-verify.sh` GREEN
- [ ] `node lesson-factory/scripts/validate-anchor-references.mjs` exit 0
- [ ] dev/local Supabase での **dry-run** 検証完了 (本書 §2)
- [ ] dev/local Supabase での **apply 検証** 完了 (本書 §3)
- [ ] 本番 sync 実行ログを保存できる準備 (`lesson-factory/logs/sync/<timestamp>.json` が出力される)

---

## 2. Dev / Local Supabase での dry-run 検証

### 2.1 起動 (local Supabase stack を使う場合)

```bash
cd /Users/rnrnstar/github/School
supabase start                # 数分かかる、初回は image pull あり
supabase status               # API URL と service_role key を確認
bash scripts/swarm/reset-db.sh --minimal   # 軽量 seed を流し込む
```

### 2.2 dry-run 実行

```bash
# local Supabase の API URL と service_role key を env に渡す
export SUPABASE_URL="$(supabase status --output json | jq -r '.api.url')"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status --output json | jq -r '.service_role_key')"

pnpm --filter lesson-factory lesson:sync -- --dry-run
```

期待出力 (最小):

```
dry-run: yes
generated-at: 2026-04-20T...Z
atom changes: <N>
persona changes: <M>
anchor changes: 1            ← TQ-180 の web-builder anchor が新規追加される
total changes: <N+M+1>
log: lesson-factory/logs/sync/<timestamp>.json
```

- `anchor changes: 1` が出ること (TQ-180 の anchor が pending)
- `atom changes` が 0 でないこと (intent tag 追記分が反映予定として出る)
- warnings 0 が望ましい (warning がある場合は本書 §6 を参照)

### 2.3 dry-run 失敗時の判断

| 症状 | 切り分け |
|---|---|
| `SUPABASE_URL is required` | env 未設定。§2.2 の export 行を再実行 |
| `Could not connect` / network error | local Supabase が落ちている。`supabase status` で確認 |
| validation error (anchor schema 等) | TQ-180 の yaml に問題。本番 apply 前に PR 修正 |
| `relation does not exist` | local DB の migration 未適用。`supabase db reset` |

dry-run が成功しない限り **本番に進まない**。

---

## 3. Dev / Local Supabase での apply 検証

### 3.1 apply 実行

```bash
pnpm --filter lesson-factory lesson:sync   # --dry-run なし
```

期待出力:

```
dry-run: no
generated-at: 2026-04-20T...Z
atom changes: <N>
persona changes: <M>
anchor changes: 1
total changes: <N+M+1>
log: lesson-factory/logs/sync/<timestamp>.json
```

### 3.2 apply 後の DB 検証 (INV-2 §3 と同等のクエリを local 向けに実行)

```sql
-- 行数サマリー
SELECT 'lesson_atoms_total' AS metric, COUNT(*)::text AS value FROM lesson_atoms
UNION ALL SELECT 'lesson_atom_prerequisites_total', COUNT(*)::text FROM lesson_atom_prerequisites
UNION ALL SELECT 'lesson_anchors_total', COUNT(*)::text FROM lesson_anchors;

-- web-builder の goal_tags / hard_prerequisites 集計
WITH cur AS (
  SELECT v.atom_id, v.yaml_content
  FROM lesson_atoms a
  JOIN lesson_atom_versions v ON v.version_id = a.current_version_id
  WHERE a.atom_id LIKE 'atom.web-builder.%'
)
SELECT 'web_builder_atoms' AS metric, COUNT(*)::text AS value FROM cur
UNION ALL SELECT 'with_hard_prereq_yaml',  COUNT(*)::text FROM cur WHERE jsonb_array_length(COALESCE(yaml_content->'hard_prerequisites','[]'::jsonb)) > 0
UNION ALL SELECT 'tag_portfolio_site',     COUNT(*)::text FROM cur WHERE yaml_content->'goal_tags' ? 'portfolio-site'
UNION ALL SELECT 'tag_business_homepage',  COUNT(*)::text FROM cur WHERE yaml_content->'goal_tags' ? 'business-homepage'
UNION ALL SELECT 'tag_landing_page',       COUNT(*)::text FROM cur WHERE yaml_content->'goal_tags' ? 'landing-page'
UNION ALL SELECT 'tag_saas_mvp',           COUNT(*)::text FROM cur WHERE yaml_content->'goal_tags' ? 'saas-mvp'
UNION ALL SELECT 'tag_blog_site',          COUNT(*)::text FROM cur WHERE yaml_content->'goal_tags' ? 'blog-site';
```

### 3.3 期待値 (TQ-180 適用後)

| metric | 期待値 |
|---|---|
| `lesson_atoms_total` | 576 (現在と同) |
| `lesson_atom_prerequisites_total` | **> 0** (現状 0 → 適用後は数百行) |
| `lesson_anchors_total` | **≥ 1** (web-builder anchor 1 件) |
| `web_builder_atoms` | 65 |
| `with_hard_prereq_yaml` | **65** (現状 0) |
| `tag_portfolio_site` | **≥ 13** (TQ-180 で +13 提案) |
| `tag_business_homepage` | **≥ 14** |
| `tag_landing_page` | **≥ 7** |
| `tag_saas_mvp` | **≥ 11** |
| `tag_blog_site` | **≥ 5** |

期待値が 1 つでも満たされない場合は、本番に進まずに調査。

---

## 4. 本番 Supabase 適用 (owner-only)

### 4.1 認証情報の取得

owner suzumura のみが本番の `SUPABASE_SERVICE_ROLE_KEY` を保持している (1Password 内 vault: `School/Production/Supabase Service Role`)。

### 4.2 本番 apply コマンド

```bash
cd /Users/rnrnstar/github/School
git checkout main
git pull origin main
pnpm install --frozen-lockfile

# 本番認証情報を env に注入 (1Password CLI 経由を推奨)
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<本番 service role key>"

# 1) 必ず先に dry-run で実行内容を確認
pnpm --filter lesson-factory lesson:sync -- --dry-run
# → atom changes / anchor changes が想定の数に近いことを目視確認

# 2) 確認できたら apply
pnpm --filter lesson-factory lesson:sync
```

apply 後、`lesson-factory/logs/sync/<timestamp>.json` が生成される。**この log ファイルを git に追跡させない** (秘密情報は含まないが、運用ログは別管理)。

### 4.3 本番 apply 後の検証

§3.2 のクエリを **本番 Supabase に対して** mcp__supabase__execute_sql で発行し、§3.3 の期待値を満たすことを確認。

加えて、本番 UI で動作確認:

1. `https://<本番 URL>/plan/onboarding` で「**AIでポートフォリオやホームページを作りたい**」を入力
2. wizard を進めて plan 生成
3. 25 タスクの **先頭が `ai-code-review` 以外** であること (期待: `what-you-will-build` か `choose-project-goal`)
4. 期待される順番に近い並びになっていること (anchor の効果)

### 4.4 検証結果の記録

`.agent-work/2026-04-20_plan-quality-fix/subtasks/TQ-179-prod-apply/post-apply-verification.md` (新規) に:
- 実行 timestamp
- §3.3 表の実測値
- 本番 UI 観測 (先頭タスク名 / 上位 5 件)
- 残課題があれば列挙

---

## 5. ロールバック手順

apply 後に致命的な問題 (例: yaml schema バグでデータが破損) が発生した場合:

### 5.1 即時ロールバック (短期)

`/api/plans/compile` の `G2A_SHADOW_WRITE_ENABLED` env を `off` に設定し、shadow write を停止 → planner は old path で動く。本番 UX への影響は最小限。

### 5.2 yaml レベルでの巻き戻し

```bash
# 該当 commit を revert (TQ-180 を巻き戻す例)
git revert <TQ-180 merge commit>
git push origin main
# その後再度 pnpm lesson:sync で巻き戻し版 yaml を本番へ反映
pnpm --filter lesson-factory lesson:sync
```

### 5.3 DB レベルでの巻き戻し

`lesson_atom_versions` は version 履歴を持つ (`version_id` UUID)。前 version への切り戻しは `lesson_atoms.current_version_id` を以前の version に UPDATE する形で可能だが、**owner 判断必須**。

---

## 6. よくある warning とその意味

| warning | 意味 | 対処 |
|---|---|---|
| `atom xxx: summary missing` | yaml に summary field が無い | スコープ外 (TQ-179 では触らない、別 TQ で対応) |
| `anchor xxx: persona_id not found` | persona yaml が無い | persona 機構未稼働、本 TQ では問題なし |
| `prereq cycle detected` | hard_prerequisites に循環参照 | yaml 修正必須、本番 apply 中止 |

---

## 7. 完了報告

owner が本番 apply 完了後:

1. 親 README (`.agent-work/2026-04-20_plan-quality-fix/README.md`) §7 進捗ログに 「YYYY-MM-DD HH:MM owner 本番 lesson:sync 完了 / 観測結果 OK」を追記
2. TaskList の **「owner による本番 lesson:sync 実行」** を completed に
3. 本番 UI で「AIでポートフォリオやホームページ」入力時の先頭タスクが妥当であることを scheenshot で記録 (将来の regression 比較用)

---

## 8. 想定外時のエスカレーション

- 本番 apply 中に `503` / `connection reset` 等が発生 → Supabase Status (https://status.supabase.com) を確認 → owner 判断
- yaml と DB schema の互換性で apply が失敗 → 本書を更新し、TQ-179 の修正 commit を追加して再試行
- 本書に書かれていない手順を実行しようとした場合 → 必ず owner に確認
