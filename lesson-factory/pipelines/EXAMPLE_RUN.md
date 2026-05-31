# Example Run

この文書は実行ログではなく、Supabase RLS 題材で 6 段パイプラインがどのように連鎖するかを示す最小例です。値は説明用であり、実際の生成や publish は行いません。

## 1. intake

入力イメージ:

```yaml
owner_request: |
  既存の Supabase RLS 入門 Atom を改善したい。
  web-builder が policy を1本書けるところまで持っていきたい。
  15分以内、最新 docs の観点を入れる。
existing_atoms:
  - id: atom.supabase.rls-basics
    title: Supabase RLSの基礎
    capability_outputs: [understand-rls, write-basic-policy]
    status: draft
freshness_sources:
  - supabase/rls
```

出力イメージ:

```yaml
goal:
  summary: Supabase RLS 入門 Atom を、policy を1本書き切る内容へ改善する
  constraints:
    - 15分以内
  hints:
    - 最新 docs の観点を反映する
target_personas:
  - tag: web-builder
    reason: RLS の初手で止まりやすい
candidate_capabilities:
  - capability: write-basic-policy
    rationale: 既存 Atom と連続性がある
freshness_signals:
  - source: supabase/rls
    reason: RLS の説明順を確認したい
classification: improve_existing
classification_reason: 既存 Atom の中心能力を磨く依頼であり、新規 Atom 化は不要
related_atom_ids:
  - atom.supabase.rls-basics
```

## 2. draft

入力イメージ:

- `intake` の出力
- 既存 Atom: [atom.supabase.rls-basics.yaml](../lessons/atoms/atom.supabase.rls-basics.yaml)

出力イメージ:

```yaml
lesson_yaml: |
  id: atom.supabase.rls-basics
  title: Supabase RLSの基礎
  persona_tags: [web-builder]
  goal_tags: [db-security, user-data]
  capability_inputs: [supabase-project-created]
  capability_outputs: [write-basic-policy]
  hard_prerequisites: [atom.supabase.project-create]
  soft_prerequisites: [atom.postgres-basics]
  deliverable:
    type: sql_policy
    validation: rls_policy_basic_v1
  evidence: [sql_snippet, test_result]
  media_slots: [diagram, screen_capture]
  freshness_sources: [supabase/rls]
  status: draft
body_markdown: |
  # Supabase RLSの基礎

  この Atom では `profiles` テーブルに対する最小の select policy を書きます。

  ## 手順

  1. RLS を有効化する
  2. `auth.uid() = user_id` の policy を追加する
  3. テストユーザーで確認する
image_briefs:
  - "diagram slot: RLS有効化 -> policy追加 -> テスト確認 の3段フロー"
video_briefs:
  - "screen_capture slot: Supabase dashboard で policy を追加して確認する短い録画"
eval_cases:
  - "自分の行だけ取得できる"
anticipated_blockers:
  - "RLS 有効化と policy 作成の順序を誤る"
pr_summary: "Supabase RLS Atom を実践寄りに改善した初稿"
```

## 3. critique

入力イメージ:

- `draft` の `LessonDraft`

出力イメージ:

```yaml
lesson_id: atom.supabase.rls-basics
critic_model: local-second-pass
issues:
  - severity: low
    category: pedagogy
    location: body_markdown > 手順
    message: policy の目的説明が短く、初学者には少し飛躍がある
    suggested_fix: 手順前に「他ユーザー行を見せないための最小 policy」という説明を入れる
overall_score: 92
recommend_status: accept
```

注記:

- 運用上は `accept_draft` 相当でも、現行 schema では `accept` を使う

## 4. media

入力イメージ:

- 承認済み `LessonDraft.image_briefs`
- 承認済み `LessonDraft.video_briefs`

出力イメージ:

```yaml
- asset_id: asset.supabase.rls-basics.diagram
  type: image
  source_adapter: local-image
  source_model: local-image-run-01
  prompt_used: "diagram slot: RLS有効化 -> policy追加 -> テスト確認 の3段フロー"
  file_path: lesson-factory/assets/images/atom.supabase.rls-basics.diagram.png
  metadata:
    lesson_id: atom.supabase.rls-basics
    slot: diagram
    mime_type: image/png
  created_at: 2026-04-08T10:00:00Z
- asset_id: asset.supabase.rls-basics.screen-capture
  type: video
  source_adapter: local-video
  source_model: local-video-run-01
  prompt_used: "screen_capture slot: Supabase dashboard で policy を追加して確認する短い録画"
  file_path: lesson-factory/assets/videos/atom.supabase.rls-basics.screen_capture.mp4
  metadata:
    lesson_id: atom.supabase.rls-basics
    slot: screen_capture
    mime_type: video/mp4
  created_at: 2026-04-08T10:03:00Z
```

## 5. eval

入力イメージ:

- `LessonDraft`
- `Critique`
- `Asset[]`
- rubric

出力イメージ:

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
      "15分以内で完了できる",
      "失敗例を1つ増やす余地がある"
    ]
  },
  "execution_eval": {
    "status": "pass",
    "trace": [
      "RLS を有効化する",
      "policy を追加する",
      "テストユーザーで確認する"
    ],
    "failed_steps": []
  },
  "persona_simulation": {
    "status": "pass",
    "stuck_points": [
      {
        "persona": "web-builder",
        "step": "policy を書く",
        "issue": "auth.uid() の意味で止まりうる",
        "mitigation": "本文に1行説明を加える"
      },
      {
        "persona": "crm-builder",
        "step": "確認する",
        "issue": "期待結果が曖昧になりうる",
        "mitigation": "eval case を画面文言つきで明示する"
      },
      {
        "persona": "solo-founder",
        "step": "ダッシュボード操作",
        "issue": "操作導線で迷う可能性がある",
        "mitigation": "screen capture asset を添える"
      }
    ]
  },
  "recommend_status": "reviewed_candidate",
  "status_rationale": "4観点すべて pass。Owner review 候補には進めるが stable 自動昇格は禁止"
}
```

## 6. publish

入力イメージ:

- `eval` pass 済み `LessonDraft`
- `Asset[]`

出力イメージ:

```yaml
lesson_id: atom.supabase.rls-basics
files_to_write:
  - path: lesson-factory/lessons/atoms/atom.supabase.rls-basics.yaml
    source: LessonDraft.lesson_yaml
    notes: status を reviewed にするかは Owner が最終判断する
  - path: lesson-factory/assets/images/atom.supabase.rls-basics.diagram.png
    source: asset.supabase.rls-basics.diagram
    notes: diagram slot
  - path: lesson-factory/assets/videos/atom.supabase.rls-basics.screen_capture.mp4
    source: asset.supabase.rls-basics.screen-capture
    notes: screen_capture slot
pr_summary: "Supabase RLS Atom の draft と media を Git 反映する準備"
unresolved_risks:
  - "Supabase dashboard UI の微変更で screen capture が古くなる可能性がある"
suggested_status: reviewed
owner_review_required: true
```

注記:

- `suggested_status` は `reviewed` または `experimental` だけ
- `stable` への自動昇格はしない
- 最終レビューと commit 判断は Owner が行う
