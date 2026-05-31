# adapters

このディレクトリは、LLM とメディア生成器を差し替えるための抽象境界です。Phase 1b では実装コードを置かず、固定するのは関数シグネチャと出力契約だけです。

重要なのは「モデル名に依存せず出力契約のみ固定する」ことです。`claude-code`、`gemini`、`image`、`video` の各 adapter は将来入れ替え可能であり、同じ契約を満たす限り内部実装は自由に差し替えられます。

## 固定シグネチャ

```txt
draft_lesson(input: LessonDraftInput) -> LessonDraft
critique_lesson(lesson: LessonDraft) -> Critique
generate_image(scene_spec: SceneSpec) -> Asset
edit_image(asset_id, instruction) -> Asset
generate_video(script, style) -> Asset
```

## 契約

- `LessonDraft` は `../schemas/lesson-draft.schema.json` に適合する
- `Critique` は `../schemas/critique.schema.json` に適合する
- `Asset` は `../schemas/asset.schema.json` に適合する
- `LessonDraftInput` と `SceneSpec` は intake / pipeline 側で正規化し、adapter ごとの差分を呼び出し境界の内側へ閉じ込める

## この段階でやらないこと

- モデル SDK の導入
- API キー管理
- プロンプト最適化コード
- サーバー実行や自動 publish
