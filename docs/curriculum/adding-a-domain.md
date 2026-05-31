# 新ドメイン追加手順

このドキュメントは、`automation` / `content` / `app` のような学習ドメインを canonical curriculum に追加するときの最小手順をまとめたものです。考え方の前提は [goal-first-learning-os.md](../architecture/goal-first-learning-os.md) の「新しい domain は content pack + config で追加する」に合わせます。

現行 repo では domain 情報の正本は `apps/web/supabase/seed-canonical.sql` にあり、goal 正規化側では `apps/web/src/lib/planner/goal-first/goal-normalizer.ts` に許可済み domain の列挙があります。`deep-research-report (4).md` で言う `MVP_ENABLED_DOMAINS` が別設定として存在するブランチでは、そちらを優先してください。

## 1. DB に domain row を INSERT する

まず `domains` に 1 行追加します。DB に直接適用するだけで終わらせず、同じ SQL を `apps/web/supabase/seed-canonical.sql` に残して seed を正本に保ちます。

```sql
INSERT INTO domains (slug, label, description, icon, sort_order)
VALUES (
  'video',
  'AI動画制作',
  'AIを使った動画企画・生成・編集の学習領域',
  'clapperboard',
  4
)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;
```

運用メモ:

- `slug` は短く一意にする。
- `sort_order` は learner-facing UI の表示順に使う前提で空きを作っておく。
- `icon` は track / domain card で再利用しやすい単語に寄せる。

## 2. capabilities seed を追加する

新ドメインは domain 行だけでは planner に役立ちません。`capabilities` が入って初めて lesson objective と learner capability state を結びつけられます。1 domain あたり 10-50 件を目安に、まずは繰り返し使う能力単位から切ります。

`apps/web/supabase/seed-canonical.sql` に、既存 domain と同じ形式で追加します。

```sql
INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT d.id, cap.slug, cap.label, cap.description, cap.rubric_criteria
FROM domains d
CROSS JOIN (VALUES
  ('video-planning', '動画企画', '動画の目的・構成・尺を設計できる', '視聴者、尺、CTA を含む構成案を作れる。'),
  ('video-generation', '動画生成', 'AI で動画素材を生成できる', '用途に応じて生成条件を変え、使える素材を出せる。'),
  ('video-editing', '動画編集', '生成素材を編集して公開品質にできる', '字幕、テンポ、BGM、書き出し設定を整えられる。')
) AS cap(slug, label, description, rubric_criteria)
WHERE d.slug = 'video'
ON CONFLICT (domain_id, slug) DO NOTHING;
```

切り方の基準:

- capability は「lesson を終えたあとに何を実証できるか」で決める。
- ツール名そのものではなく、複数 lesson から再利用できる能力名にする。
- 一度しか使わない粒度なら capability ではなく tag で表現する。

## 3. `MVP_ENABLED_DOMAINS` に追加する

release / deploy 側に `MVP_ENABLED_DOMAINS` がある場合は、必ず新 slug を追加します。

```env
MVP_ENABLED_DOMAINS=web,automation,content,app,video
```

補足:

- 現行 tree では `MVP_ENABLED_DOMAINS` 文字列は確認できず、実装上の近いゲートは `apps/web/src/lib/planner/goal-first/goal-normalizer.ts` の `ALLOWED_DOMAINS` です。
- report ベースの運用では env/config を正本にし、コード側の domain 列挙と食い違わせないことが重要です。

## 4. UI の Coming Soon を解除する

新ドメインが DB に入っていても、learner-facing UI が `coming-soon` を返している限り公開扱いにはできません。少なくとも次を確認します。

- planner がその domain を `coming-soon` ではなく通常候補として扱うこと
- domain card / track card に `Coming Soon` バッジが残っていないこと
- lesson browser や next-goals で対象 domain が選択・表示できること
- support status が `supported` として見えること

確認ポイント:

- domain classifier が新 slug を返せること
- learner dashboard 側で新 domain をフィルタ対象にできること
- 未対応 goal fallback に吸われないこと

## 5. レッスン投入手順

ドメインを空で公開しないこと。最低でも learner が最初の成果物まで進める lesson 群をまとめて入れます。現行 repo では legacy lesson form と canonical tables が併存しているため、投入は次の順で揃えるのが安全です。

1. domain 用の course / module を用意する。
2. Admin で lesson の基本情報、`content`, `why_this_matters`, `how_to_do`, `common_blockers`, `confirmation_method` を埋める。
3. `tags` と `content_types` を入れて検索・閲覧面のメタデータを整える。
4. canonical 側に `lesson_identities`, `lesson_versions`, `lesson_blocks` を作るか、既存 backfill/import フローで反映する。
5. 必ず `lesson_objectives` を張り、各 lesson に primary 1 件、必要なら secondary 1-2 件の capability を紐づける。
6. `lesson_content_tags` と media asset を追加し、公開前に block 表示を確認する。

lesson 本文と画像運用の詳細は [lesson-authoring-guide.md](./lesson-authoring-guide.md) を参照してください。

## 6. 検証チェックリスト

- [ ] `domains` に対象 slug が 1 行だけ存在する
- [ ] `capabilities` に対象 domain の seed が入り、重複 slug がない
- [ ] `MVP_ENABLED_DOMAINS` または同等の gate に slug が入っている
- [ ] planner / dashboard / lesson browser で `Coming Soon` 表示が消えている
- [ ] 対象 domain の初期 lesson 群が learner-facing 画面から開ける
- [ ] 各 lesson に `lesson_objectives` があり、0 件 lesson が残っていない
- [ ] 新 domain goal を入力して、初回 plan が 1 本以上組まれる
- [ ] deploy verification の SQL と smoke test が通る

## 推奨 SQL

```sql
SELECT slug, label, sort_order
FROM domains
ORDER BY sort_order, slug;

SELECT d.slug, COUNT(*) AS capability_count
FROM capabilities c
JOIN domains d ON d.id = c.domain_id
GROUP BY d.slug
ORDER BY d.slug;

SELECT d.slug, COUNT(DISTINCT li.id) AS lesson_count
FROM lesson_identities li
JOIN domains d ON d.id = ANY(li.domain_ids)
GROUP BY d.slug
ORDER BY d.slug;
```
