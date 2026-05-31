# Goal Action Eval Dataset v0

`v0` は Goal→Action 閉ループの gold dataset 初版です。Action Normalizer / Matcher / Gap Detector / Proposer の回帰検知を目的に、goal / action / lesson / gap を固定しています。

## 構成

- `goals.jsonl`: goal 文と domain / persona の gold input
- `expected-actions.jsonl`: goal ごとの canonical action
- `expected-lessons.jsonl`: 各 action に対する gold lesson or atom 参照、または `gap: true`
- `expected-gaps.jsonl`: validation holdout に限定した gap gold
- `schema.json`: 4 ファイルを検証する JSON Schema Draft 2020-12
- `rubric.md`: 判定基準と初期閾値

## Split

- split は `goalId` に対する `sha256(goalId)` の先頭 8 hex を 10 で割った bucket で決まります
- bucket `0..6` は `train`
- bucket `7..9` は `validation`
- `expected-gaps.jsonl` は validation holdout の action のみを載せます

## Versioning

- `v0` は commit 後に凍結します。既存行の追加・削除・編集はしません。
- schema 拡張や sample 追加が必要な場合は `v1/` を新規作成します。
- 互換性のない変更は必ず新しい version directory で扱います。

## 追記フロー

1. `v0/` をコピーして `v1/` を作る。
2. `schema.json` の `$id` と README / rubric を `v1` に更新する。
3. goal / action / lesson / gap を追加し、必要な integrity rule も loader 側で更新する。
4. `pnpm --filter @school/goal-action-eval test` を通す。
5. reviewer が rubric と split 影響を確認してから freeze する。

## 運用メモ

- `expected-lessons.jsonl` は v0 では action ごとに 1 行です。
- `lessonOrAtomId` には workspace 上で実在する id だけを入れます。
- 実在 id の検証は `validateLessonIdsAgainstWorkspace()` が担当します。
