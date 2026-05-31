# Stage: critique

## 役割

`draft` の出力を独立視点で点検し、schema 違反、教育設計上の弱さ、実行不能箇所、persona 不一致を洗い出す段です。ここでは修正版本文を生成せず、問題点と修正案だけを返します。

## 入力契約

次の入力を受け取ります。

- `lesson_draft`: [lesson-draft.schema.json](../../schemas/lesson-draft.schema.json) に適合する `LessonDraft`

重要:

- この段は `draft` と**異なるモデル**で実行してください。
- 具体的なモデル名やベンダー名は固定しませんが、同じ出力をなぞるだけの再実行は不可です。

## 出力契約

返答は [critique.schema.json](../../schemas/critique.schema.json) に厳格適合する `Critique` 1個のみです。

```yaml
lesson_id: string
critic_model: string
issues:
  - severity: low | medium | high | critical
    category: string
    location: string
    message: string
    suggested_fix: string
overall_score: number
recommend_status: accept | revise | block
```

観点として最低限 `schema-violation`、`pedagogy`、`execution`、`persona-fit` をカバーしてください。`category` は自由文字列ですが、この 4 観点に紐づく分類を推奨します。

運用上の語彙との対応:

- schema の `accept` は、運用上は `accept_draft` または `accept_reviewed` に相当する
- schema の `revise` は、そのまま `revise`
- schema の `block` は、運用上の `reject` に相当する

現行 schema では `accept_draft`、`accept_reviewed`、`reject` を直接出力できないため、**必ず** `accept | revise | block` に正規化します。

## 実行手順

1. `lesson_draft.lesson_yaml` を parse し、[lesson.schema.json](../../schemas/lesson.schema.json) との整合を確認する。
2. `body_markdown` を読み、前提知識、説明順、達成可能性、検証可能性を点検する。
3. `image_briefs`、`video_briefs`、`eval_cases`、`anticipated_blockers` が lesson 本文と矛盾しないか確認する。
4. `issues` を severity 順に整理し、各 issue に具体的な `suggested_fix` を付ける。
5. `overall_score` を 0-100 で付け、`recommend_status` を `accept`、`revise`、`block` から選ぶ。

## 守るべき制約

- 返すのは critique のみ。修正版本文、修正版 YAML、自動修正差分は出さない。
- `lesson_id` は `lesson_yaml.id` と一致させる。
- `critic_model` には実行環境を識別できる文字列を入れる。固定名は不要。
- `location` は `lesson_yaml.<field>`、`body_markdown` の見出し名、`image_briefs[0]` のように追跡可能に書く。
- `accept` は重大な schema 違反や実行不能箇所がない場合に限る。
- `block` は lesson-factory 境界逸脱、致命的な schema 不整合、学習不能な構成など、Owner がそのまま改稿に進めない場合に使う。

## 失敗時の挙動

- `lesson_yaml` が壊れていても `id` を抽出できるなら、`schema-violation` の critical issue を立てて `block` を返す。
- `lesson_id` すら特定できない場合は、schema 準拠 critique を捏造せず、入力再取得を促す。
- 根拠のない高評価は付けない。迷ったら `revise` 側に倒す。

## 出力例

```yaml
lesson_id: atom.supabase.rls-basics
critic_model: local-second-pass
issues:
  - severity: medium
    category: pedagogy
    location: body_markdown > 手順
    message: RLS 有効化前に policy の目的を説明しておらず、学習者が「なぜ必要か」を掴みにくい
    suggested_fix: 手順の前に「他ユーザー行を防ぐための最小 policy を書く」という目的文を1段落入れる
  - severity: low
    category: persona-fit
    location: anticipated_blockers[0]
    message: dashboard UI で迷う可能性への言及が弱い
    suggested_fix: policy タブの位置を brief または本文で補足する
overall_score: 88
recommend_status: revise
```
