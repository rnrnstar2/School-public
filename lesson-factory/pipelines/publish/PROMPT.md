# Stage: publish

## 役割

`eval` を通過した draft と asset を、Owner が Git に反映しやすい publish bundle に整理する段です。ここでは commit、push、merge、配信登録は行わず、「どのファイルをどう反映するか」を明示するだけに留めます。

## 入力契約

次の入力を受け取ります。

- `passed_lesson_draft`: `eval.recommend_status == reviewed_candidate` の `LessonDraft`
- `assets`: lesson に紐づく `Asset[]`
- `eval_bundle`: 可能なら `eval` の結果全文

前提条件:

- `eval` で 4観点すべて pass していること
- `lesson_yaml.status` はまだ `stable` でないこと

## 出力契約

返答は YAML または JSON の publish bundle 1個のみとし、最低限次の key を含めます。

```yaml
lesson_id: string
files_to_write:
  - path: string
    source: string
    notes: string
pr_summary: string
unresolved_risks: [string]
suggested_status: reviewed | experimental
owner_review_required: true
```

`files_to_write` には少なくとも次を含めます。

- `lesson-factory/lessons/atoms/<lesson_id>.yaml`
- `lesson-factory/assets/images/...` または `lesson-factory/assets/videos/...` の該当 asset

## 実行手順

1. `lesson_yaml.id` から `lesson_id` を確定する。
2. `LessonDraft.lesson_yaml` をどのパスへ書くべきか決め、`files_to_write` に追加する。
3. `Asset[]` を走査し、各 asset の `file_path` を `files_to_write` に追加する。
4. `eval_bundle` の pass 結果と残留リスクをもとに `pr_summary` と `unresolved_risks` をまとめる。
5. `suggested_status` を `reviewed` または `experimental` のどちらかで提案する。
6. `owner_review_required: true` を明示して返す。

## 守るべき制約

- `stable` へ自動昇格しない。提案可能なのは `reviewed` か `experimental` だけ。
- Owner の人間レビューを必須にする。
- Git への push、無人 merge、無人 publish はしない。
- lesson 本体以外の runtime 実装、schema、ADR 変更を publish bundle に紛れ込ませない。
- `experimental` は未解決リスクが残るが限定運用なら進められる場合に使う。
- `reviewed` は human review 候補であり、公開確定を意味しない。

## 失敗時の挙動

- `eval_bundle.recommend_status` が `reviewed_candidate` でない場合は publish bundle を作らず、どの評価で落ちたかを短く返す。
- `Asset[]` の `file_path` が欠落している場合は、該当 asset を publish 対象に入れない。
- `lesson_id` が確定できない場合は処理を止め、入力修正を要求する。

## 出力例

```yaml
lesson_id: atom.supabase.rls-basics
files_to_write:
  - path: lesson-factory/lessons/atoms/atom.supabase.rls-basics.yaml
    source: LessonDraft.lesson_yaml
    notes: status は reviewed へ更新候補だが、最終決定は Owner が行う
  - path: lesson-factory/assets/images/atom.supabase.rls-basics.diagram.png
    source: asset.supabase.rls-basics.diagram
    notes: diagram slot
  - path: lesson-factory/assets/videos/atom.supabase.rls-basics.screen_capture.mp4
    source: asset.supabase.rls-basics.screen-capture
    notes: screen_capture slot
pr_summary: "Supabase RLS Atom の draft、media、eval pass 結果を Git 反映する準備"
unresolved_risks:
  - "Supabase dashboard UI の細かな変化で screen capture の見た目が古くなる可能性がある"
suggested_status: reviewed
owner_review_required: true
```
