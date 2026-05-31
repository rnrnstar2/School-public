# Stage: media

## 役割

承認済み `LessonDraft` の `image_briefs` / `video_briefs` を、ローカルで利用可能な生成器を使って実ファイル化し、追跡可能な `Asset[]` に変換する段です。ここでは slot とファイル名規約を守り、素材の出所を記録します。

## 入力契約

次の入力を受け取ります。

- `approved_lesson_draft`: 承認済みの `LessonDraft`
- `lesson_id`: `lesson_yaml.id`
- `media_slots`: `lesson_yaml.media_slots`
- `image_briefs`: `LessonDraft.image_briefs`
- `video_briefs`: `LessonDraft.video_briefs`

前提条件:

- `approved_lesson_draft` は `critique` を通過済みであること
- brief 内の slot 指示は `media_slots` と矛盾しないこと

## 出力契約

成功時の返答は [asset.schema.json](../../schemas/asset.schema.json) に適合する `Asset` の配列のみです。YAML でも JSON でもよいですが、各要素は次を満たします。

```yaml
- asset_id: string
  type: image | video
  source_adapter: string
  source_model: string
  prompt_used: string
  file_path: string
  metadata: object
  created_at: date-time
```

ファイル配置規約:

- 画像: `lesson-factory/assets/images/<lesson_id>.<slot>.<ext>`
- 動画: `lesson-factory/assets/videos/<lesson_id>.<slot>.<ext>`

`slot` は `lesson_yaml.media_slots` で宣言された値をそのまま使います。勝手な改名は禁止です。

## 実行手順

標準の画像生成は Owner が契約している Codex / ChatGPT サブスクの built-in imagegen を使う。OpenAI API key、Image API、`imagegen` fallback CLI は標準動線では使わない。

1. `lesson_yaml.media_slots` を基準に、各 brief がどの slot を指すかを確定する。
2. `lesson:media:queue` で built-in imagegen 用 prompt と保存先を queue 化する。
3. Codex / ChatGPT の built-in imagegen で画像を生成し、queue の `target_file_path` に PNG として保存する。
4. `lesson:media:import` で保存済みファイルを検証し、各ファイルについて `Asset` を1件ずつ作る。
5. `metadata` に `lesson_id`、`slot`、拡張子やサイズなど追跡に必要な情報を入れる。
6. `Asset[]` だけを返す。

## 守るべき制約

- 特定のモデル名を前提にしない。`source_model` には実際に使った実行時識別子だけを入れる。
- `file_path` は repo ルートからの相対パスで書く。
- 実在しないファイルパスや空生成物を成功扱いしない。
- slot を尊重する。brief 側が曖昧でも、新しい slot 名は増やさない。
- `Asset` を捏造しない。生成できたものだけを返す。
- publish や配信登録はしない。

## 失敗時の挙動

- 生成に失敗した slot は `Asset` を作らない。
- すべて失敗した場合は空配列 `[]` を返したうえで、続けて人間向けに `brief_revisions` を YAML で提案する。
- 一部だけ成功した場合は成功分の `Asset[]` を返し、失敗 slot について brief 改善案を別記する。

失敗時の補助フォーマット例:

```yaml
brief_revisions:
  - slot: diagram
    reason: UI 構図が曖昧で要素不足
    revised_brief: "Supabase dashboard の Table Editor と Policy Editor を左右に並べた図にする"
```

## 出力例

```yaml
- asset_id: asset.supabase.rls-basics.diagram
  type: image
  source_adapter: local-image
  source_model: local-image-run-01
  prompt_used: "diagram slot: RLS有効化 -> policy追加 -> テスト確認 の3段フローを明るい UI 図で示す"
  file_path: lesson-factory/assets/images/atom.supabase.rls-basics.diagram.png
  metadata:
    lesson_id: atom.supabase.rls-basics
    slot: diagram
    mime_type: image/png
    width: 1600
    height: 900
  created_at: 2026-04-08T10:00:00Z
- asset_id: asset.supabase.rls-basics.screen-capture
  type: video
  source_adapter: local-video
  source_model: local-video-run-01
  prompt_used: "screen_capture slot: Supabase dashboard で policy を追加してテストする 30-45秒の短い録画"
  file_path: lesson-factory/assets/videos/atom.supabase.rls-basics.screen_capture.mp4
  metadata:
    lesson_id: atom.supabase.rls-basics
    slot: screen_capture
    mime_type: video/mp4
    duration_seconds: 38
  created_at: 2026-04-08T10:03:00Z
```
