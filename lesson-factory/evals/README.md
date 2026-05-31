# evals

`lesson-factory/evals/` は公開前評価に使う rubric、persona、dataset の置き場です。ここに置くのは Owner ローカル専用の評価素材だけで、サーバー側の自動改修や無人 publish を前提にしません。責務境界は [ADR-0006](../../docs/adr/ADR-0006-owner-local-only-lesson-generation-boundary.md) に従います。

## 4種評価の概要

- `schema`: `lesson-factory/schemas/` を直接使う契約検証。rubric は置かない
- `pedagogy`: 初学者が 1 capability を獲得できるかを採点する
- `execution`: 手順の再現性、検証可能性、version 依存、フォールバックを採点する
- `persona-simulation`: 想定 persona が詰まらず前進できるかを、scenario と persona-fit rubric で点検する

## Rubrics

- `rubrics/pedagogy.rubric.yaml`
- `rubrics/execution.rubric.yaml`
- `rubrics/persona-fit.rubric.yaml`

## Personas

- `personas/web-builder.persona.yaml`
- `personas/instagram-automator.persona.yaml`
- `personas/crm-builder.persona.yaml`
- `personas/meal-planner.persona.yaml`
- `personas/ai-content-creator.persona.yaml`

各 persona は [persona.schema.json](../schemas/persona.schema.json) に適合させること。schema が許す field 以外は追加しません。

## Datasets

- `datasets/pedagogy-cases/`: pedagogical good/bad examples
- `datasets/execution-cases/`: runnable/broken runbook examples
- `datasets/persona-simulation-cases/`: stuck/success scenario examples

各サブディレクトリの `README.md` に case format と追加時の注意があります。

## 追加方法

1. 対応する rubric の `criteria[].id` を確認する
2. 対象 dataset に YAML 1件を追加し、`case_id` と `target_rubric` を埋める
3. `expected_scores` か scenario field を、Phase 3 eval runner が機械的に読める素朴な shape に保つ
4. YAML パースと persona schema 検証を通す

## 運用メモ

- Phase 3 の eval runner はこのディレクトリを直接読む前提
- rubric や case 用の新しい JSON Schema は追加しない
- `stable` 判定の自動化には使わない。最終判断は Owner が行う
