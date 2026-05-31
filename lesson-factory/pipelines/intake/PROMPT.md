# Stage: intake

## 役割

Owner の自由記述を、次段の `draft` が安全に読める正規化済み intake bundle に変換する段です。ここでは「何を作るべきか」「既存 Atom を改善すべきか」「この依頼自体が lesson-factory の責務外か」を判定し、本文や lesson YAML はまだ書きません。

## 入力契約

次の入力を受け取ります。

- `owner_request`: Owner の自由記述。最低でも `目標`、あれば `persona`、`制約`、`ヒント` を含む
- `existing_atoms`: 既存 Atom の一覧。最低でも `id`、`title`、`capability_outputs`、`status` が分かること
- `freshness_sources`: 利用可能な freshness source 候補一覧

入力例:

```yaml
owner_request: |
  既存の Supabase RLS 入門 Atom を見直したい。
  web-builder が「RLS を有効化したのに policy で詰まる」を超えられる内容にしたい。
  15分以内、SQL を1本書かせる形式、最新 docs の観点を入れたい。
existing_atoms:
  - id: atom.supabase.rls-basics
    title: Supabase RLSの基礎
    capability_outputs: [understand-rls, write-basic-policy]
    status: draft
freshness_sources:
  - supabase/rls
  - postgres/create-policy
```

## 出力契約

返答は YAML の intake bundle 1個のみとし、少なくとも次のトップレベル key を含めます。

- `goal`
- `target_personas`
- `candidate_capabilities`
- `freshness_signals`
- `classification`

推奨 shape:

```yaml
goal:
  summary: string
  constraints: [string]
  hints: [string]
target_personas:
  - tag: string
    reason: string
candidate_capabilities:
  - capability: string
    rationale: string
freshness_signals:
  - source: string
    reason: string
classification: new_atom | improve_existing | anchor_only | unsupported
classification_reason: string
related_atom_ids: [string]
```

判定語彙の意味:

- `new_atom`: 新しい Atom を起こすのが妥当
- `improve_existing`: 既存 Atom の更新で吸収すべき
- `anchor_only`: Atom 追加ではなく Anchor の並び替えや参照変更で十分
- `unsupported`: lesson-factory の責務外、または Owner ローカル制作境界を越える

`classification` が `unsupported` のときは、その bundle を `unsupported_goal` 記録として扱います。`classification_reason` を必須にし、`lesson-factory/logs/unsupported-goals/` に残しても意味が通る粒度で書きます。

## 実行手順

1. 自由記述から `goal.summary`、制約、ヒントを抽出し、曖昧表現を短い文に正規化する。
2. `target_personas` を 1-3 件に絞り、各 persona がこの lesson を必要とする理由を付ける。
3. `existing_atoms` を見て、要求が既存 capability の改善か、新規 capability か、Anchor 再編だけで足りるかを判断する。
4. `freshness_sources` から今回必要な確認対象だけを `freshness_signals` に残す。
5. `classification` を 1つだけ選び、`classification_reason` に根拠を書く。
6. `improve_existing` または `anchor_only` のときは `related_atom_ids` を埋める。
7. YAML bundle だけを返す。

## 守るべき制約

- 本文、見出し、step-by-step 手順、lesson YAML は書かない。
- ここで行うのは分類と正規化だけ。実制作は `draft` 以降に渡す。
- 1 Atom は 1つの学習能力に焦点を当てる前提で分類する。
- `unsupported` は必ず理由付きにする。
- `anchor_only` は「新しい能力追加なしで順序や参照の調整だけで解決する」場合に限る。
- ADR-0006 に反する依頼は `unsupported` にする。
  - 例: サーバー側での自動生成、無人 publish、自動改修の適用、自動 stable 昇格
- lesson-factory の責務外である runtime 実装、配信面の挙動変更、SDK 導入要求は `unsupported` に寄せる。

## 失敗時の挙動

- 入力が曖昧でも、lesson-factory の責務内に収まるなら最も近い `classification` を選び、`classification_reason` に不足情報を書く。
- 依頼が単一 Atom に収まらず複数 capability を横断する場合は、無理に本文を書かず `unsupported` か `anchor_only` に倒す。
- freshness source が不足している場合は `freshness_signals: []` を許容し、推測で source 名を増やさない。

## 出力例

```yaml
goal:
  summary: Supabase RLS 入門 Atom を、policy を1本書き切る実践寄りの内容へ更新する
  constraints:
    - 15分以内で終える
    - SQL を1本書かせる
  hints:
    - policy の where 句で詰まりやすい点を先回りで扱う
target_personas:
  - tag: web-builder
    reason: Supabase 導入直後に RLS の最初の壁で止まりやすい
candidate_capabilities:
  - capability: write-basic-policy
    rationale: 既存 Atom の中心能力と一致し、改善対象として妥当
freshness_signals:
  - source: supabase/rls
    reason: RLS の推奨説明順と用語揺れを確認したい
classification: improve_existing
classification_reason: 既存 Atom が同一 capability を持っており、新規 Atom 化より内容更新のほうが境界に合う
related_atom_ids:
  - atom.supabase.rls-basics
```
