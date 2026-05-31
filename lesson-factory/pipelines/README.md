# pipelines

このディレクトリは、Owner ローカルで回す lesson production pipeline の責務を段ごとに固定するための場所です。実装コードは置かず、各段の prompt template と受け渡し契約を管理します。

## Stage Prompts

| Stage | Prompt | 責務 | 主入力 | 主出力 |
| --- | --- | --- | --- | --- |
| `intake` | [intake/PROMPT.md](./intake/PROMPT.md) | 自由記述を正規化し、既存 Atom との関係を分類する | Owner request、既存 atoms、freshness source 候補 | intake bundle YAML |
| `draft` | [draft/PROMPT.md](./draft/PROMPT.md) | lesson YAML、本文、media brief、eval case の初稿を作る | intake bundle、関連既存 atoms | `LessonDraft` |
| `critique` | [critique/PROMPT.md](./critique/PROMPT.md) | draft を独立視点で点検する | `LessonDraft` | `Critique` |
| `media` | [media/PROMPT.md](./media/PROMPT.md) | 承認済み brief から画像・動画 asset を生成する | 承認済み `LessonDraft` | `Asset[]` |
| `eval` | [eval/PROMPT.md](./eval/PROMPT.md) | schema / pedagogy / execution / persona-simulation を評価する | `LessonDraft`、`Critique`、`Asset[]`、rubric | eval bundle JSON |
| `publish` | [publish/PROMPT.md](./publish/PROMPT.md) | Git 反映対象と PR 要約を整理する | eval pass 済み draft、asset、eval bundle | publish bundle |

補助ドキュメント:

- [EXAMPLE_RUN.md](./EXAMPLE_RUN.md): Supabase RLS 題材の 6 段入出力イメージ

## 実行順序図

```txt
Owner request + existing atoms + freshness sources
  -> intake/PROMPT.md
  -> intake bundle
  -> draft/PROMPT.md
  -> LessonDraft
  -> critique/PROMPT.md
  -> Critique
  -> media/PROMPT.md
  -> Asset[]
  -> eval/PROMPT.md
  -> eval bundle
  -> publish/PROMPT.md
  -> publish bundle
  -> Owner human review
  -> commit / PR / release decision
```

## 段ごとの境界

- `intake` は分類まで。本文や lesson YAML を書かない
- `draft` は初稿まで。公開判断や asset 生成はしない
- `critique` は問題提起まで。自動修正はしない
- `media` は asset 化まで。配信登録はしない
- `eval` は `reviewed_candidate` まで。`stable` へ自動昇格しない
- `publish` は Git 反映準備まで。Owner の人間レビューなしに進めない

## 連鎖ルール

- `intake.classification` が `new_atom` または `improve_existing` のときだけ `draft` に進む
- `critique` は `draft` と異なるモデルで実行する
- `media` は承認済み brief のみを扱う
- `eval` で 1つでも fail があれば `publish` に進めない
- `publish` が提案できる status は `reviewed` または `experimental` のみ
