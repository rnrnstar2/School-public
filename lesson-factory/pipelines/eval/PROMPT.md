# Stage: eval

## 役割

`LessonDraft`、`Critique`、`Asset[]` を rubric に照らして点検し、publish 候補に進めるかを判定する段です。ここでは 4 種の評価をまとめて返しますが、`stable` への自動昇格は行いません。

## 入力契約

次の入力を受け取ります。

- `lesson_draft`: [lesson-draft.schema.json](../../schemas/lesson-draft.schema.json) に適合する `LessonDraft`
- `critique`: [critique.schema.json](../../schemas/critique.schema.json) に適合する `Critique`
- `assets`: [asset.schema.json](../../schemas/asset.schema.json) に適合する `Asset[]`
- `rubric`: `lesson-factory/evals/rubrics/` 配下の評価基準

## 出力契約

返答は JSON 1個のみとし、次の shape に合わせます。

```json
{
  "schema_eval": {
    "status": "pass",
    "violations": []
  },
  "pedagogy_eval": {
    "status": "pass",
    "score": 0,
    "comments": []
  },
  "execution_eval": {
    "status": "pass",
    "trace": [],
    "failed_steps": []
  },
  "persona_simulation": {
    "status": "pass",
    "stuck_points": [
      {
        "persona": "string",
        "step": "string",
        "issue": "string",
        "mitigation": "string"
      }
    ]
  },
  "recommend_status": "revise | reviewed_candidate",
  "status_rationale": "string"
}
```

評価観点の意味:

- `schema_eval`: `lesson_yaml`、`Critique`、`Asset[]` の契約違反有無
- `pedagogy_eval`: 学習順序、説明密度、達成可能性
- `execution_eval`: 仮想実行トレース、依存関係、再現性
- `persona_simulation`: 3-5 件の persona 視点の詰まり点

判定ルール:

- 1つでも `status: fail` があれば `recommend_status` は必ず `revise`
- 4つすべて `pass` のときだけ `reviewed_candidate`
- `reviewed_candidate` は `stable` を意味しない

## 実行手順

1. `lesson_draft.lesson_yaml` を parse し、[lesson.schema.json](../../schemas/lesson.schema.json) に照らして `schema_eval` を作る。
2. `critique.issues` を読み、重大 issue が未解消のまま残っていないか確認する。
3. rubric を使って `pedagogy_eval.score` を 0-5 で採点し、コメントを残す。
4. 学習者が実際に手順を追う想定で `execution_eval.trace` を作り、失敗ステップを記録する。
5. 3-5 件の persona 詰まり点を `persona_simulation.stuck_points` にまとめる。
6. fail が 1件でもあれば `revise`、全 pass なら `reviewed_candidate` を返す。

## 守るべき制約

- 4 種評価をすべて埋める。空欄のまま pass にしない。
- `pedagogy_eval.score` は 0-5 の数値にする。
- `execution_eval.trace` には仮想実行の順序を残し、`failed_steps` には失敗した step 名だけでなく原因も分かる語を入れる。
- `persona_simulation.stuck_points` は 3-5 件にする。
- `reviewed_candidate` は publish 準備候補にすぎない。`stable` を提案してはならない。
- 不足 input を推測で補わない。不足していれば संबंधित eval を fail にする。

## 失敗時の挙動

- 必須入力が欠ける場合は、その観点を `fail` にして `violations` や `comments` に不足内容を書く。
- `assets` が空でも lesson に media が不要なら直ちに fail とは限らないが、`media_slots` と不整合なら `schema_eval` または `execution_eval` を fail にする。
- rubric が足りない場合は独断で pass にせず、`pedagogy_eval.status: fail` として理由を書く。

## 出力例

```json
{
  "schema_eval": {
    "status": "pass",
    "violations": []
  },
  "pedagogy_eval": {
    "status": "pass",
    "score": 4,
    "comments": [
      "目的と deliverable の対応が明確",
      "policy の失敗例をもう1つ入れると理解が安定する"
    ]
  },
  "execution_eval": {
    "status": "pass",
    "trace": [
      "RLS を有効化する",
      "profiles テーブルに select policy を追加する",
      "テストユーザーで結果を確認する"
    ],
    "failed_steps": []
  },
  "persona_simulation": {
    "status": "pass",
    "stuck_points": [
      {
        "persona": "web-builder",
        "step": "policy を書く",
        "issue": "auth.uid() と user_id の型対応で迷う",
        "mitigation": "本文に最小 SQL 例を残す"
      },
      {
        "persona": "crm-builder",
        "step": "テストする",
        "issue": "他ユーザー行が見えない状態をどう確認するか曖昧",
        "mitigation": "テストケースに期待結果を明示する"
      },
      {
        "persona": "solo-founder",
        "step": "RLS を有効化する",
        "issue": "dashboard 上の導線を見失う可能性がある",
        "mitigation": "screen capture asset で操作導線を補う"
      }
    ]
  },
  "recommend_status": "reviewed_candidate",
  "status_rationale": "4観点すべて pass であり、stable 自動昇格は禁止したまま Owner review に進める"
}
```
