# Stage: draft

## 役割

`intake` で正規化された要求を、Owner がレビュー可能な `LessonDraft` に変換する初稿作成段です。lesson metadata と本文をまとめて作りますが、ここでは publish 判断や素材生成は行いません。

## 文体・読者ガイドライン（全 draft 共通）

このサイトの読者は**プログラミング経験のない非エンジニア**です。以下を必ず守ってください。

- **文体**: です・ます調、親しみやすく。読者を「あなた」と呼ぶ。上から目線禁止
- **コードは必要最低限**: ターミナルコマンドが必要な場合もコピペで済む1行にとどめ、「何をしているか」を日本語で必ず添える
- **専門用語**: カタカナ語や英語の技術用語は初出時に括弧書きで平易な日本語の説明を添える。例: 「デプロイ（＝作ったものをインターネットに公開すること）」
- **NG用語**: 読者が知らない前提の用語をそのまま使わない。「スキャフォールド」「リポジトリ」「CI/CD」等は言い換えるか説明する
- **身近なたとえ話**: 抽象概念は料理・旅行・日常生活のたとえで導入してから本題に入る
- **見出しは動詞始まり**: 「インストールする」「確認する」「選ぶ」のように読者のアクションを示す
- **良い例/悪い例**: 判断が必要なステップでは具体的な良い例と悪い例を各1-2個示す

## 入力契約

次の入力を受け取ります。

- `intake_bundle`: `../intake/PROMPT.md` の出力
- `related_existing_atoms`: 関連する既存 Atom の YAML または要約。`improve_existing` の場合は対象 Atom を必須にする

前提条件:

- `intake_bundle.classification` は `new_atom` または `improve_existing`
- `anchor_only` と `unsupported` はこの段へ進めない

## 出力契約

返答は [lesson-draft.schema.json](../../schemas/lesson-draft.schema.json) に適合する `LessonDraft` 1個のみです。YAML でも JSON でもよいですが、構造は次と一致させます。

```yaml
lesson_yaml: |
  # [lesson.schema.json](../../schemas/lesson.schema.json) を満たす YAML
body_markdown: string
image_briefs: [string]
video_briefs: [string]
eval_cases: [string]
anticipated_blockers: [string]
pr_summary: string
```

`lesson_yaml` は文字列ですが、中身は [lesson.schema.json](../../schemas/lesson.schema.json) に厳格適合する YAML でなければなりません。必須 field は次の 13 個です。

- `id`
- `title`
- `persona_tags`
- `goal_tags`
- `capability_inputs`
- `capability_outputs`
- `hard_prerequisites`
- `soft_prerequisites`
- `deliverable`
- `evidence`
- `media_slots`
- `freshness_sources`
- `status`

`body_markdown` は、`image_briefs` に対応する画像を本文の意味上適切な位置で参照できるように書きます。各 `image_briefs[i]` について、原則として対応するインライン Markdown 画像参照を 1 個入れてください。

- 形式: `![<短い alt>](/lesson-assets/<lesson_id>/<slot>.png)`
- `<slot>` は `lesson_yaml.media_slots` の値を使う。`diagram`、`screen_capture` など
- 同じ slot に複数 brief がある場合は `diagram.2.png`、`diagram.3.png` のように連番 suffix を使う
- URL は常に先頭 `/lesson-assets/...` とする。これは Next.js の `public` 配下の公開パス
- `<lesson_id>` は `lesson_yaml.id` を使う。例: `atom.web-builder.create-next-app`
- 具体例: `diagram slot: pnpm create next-app の4段フロー` に対して `![プロジェクト生成フロー](/lesson-assets/atom.web-builder.create-next-app/diagram.png)`

## 実行手順

1. `intake_bundle` から、今回の Atom が到達させるべき単一能力を決める。
2. `improve_existing` の場合は既存 Atom の `id` と能力境界を優先して引き継ぐ。
3. `lesson_yaml` を組み立てる。`freshness_sources` は必ず**カノニカルなソース ID の配列**にすること。`intake_bundle.freshness_signals[].source` の値（例: `nextjs/docs/app-router`、`supabase/rls`、`cursor-releases`）をそのまま写像し、生の URL・ドメイン・記事タイトルを入れてはならない。
4. Owner が読む本文を `body_markdown` に書く。導入、前提、実施手順、検証観点、つまずき対策を含める。
5. `image_briefs` に対応するインライン Markdown 画像参照を、本文の意味上適切な位置へ入れる。画像 URL は `/lesson-assets/<lesson_id>/<slot>.png` を使い、同一 slot の複数 brief は `.2.png`、`.3.png` suffix を使う。
6. `media_slots` に対応する brief だけを `image_briefs` / `video_briefs` に書く。ここではファイル生成しない。
7. `eval_cases` に、後段 `eval` が確認すべき最小ケースを列挙する。
8. `anticipated_blockers` と `pr_summary` を埋めて返す。

## 守るべき制約

- `lesson_yaml` は schema に厳格適合させる。必須 field の欠落、余分な field の追加は禁止。
- 1 Atom = 1 capability を原則とする。`capability_outputs` は新規追加分で最大 3 件、できれば 1-2 件に抑える。
- `deliverable.type` に対して許可された `evidence` だけを選ぶ。
- `status` は自動で `stable` にしない。通常は `draft` にする。
- `image_briefs` と `video_briefs` は brief のみ。素材ファイルや実バイナリへの言及で成功扱いしない。
- `body_markdown` は、対応する `image_briefs` がある場合、原則として `/lesson-assets/<lesson_id>/<slot>.png` 形式のインライン画像参照を含める。
- `anchor_only` や `unsupported` を無視して本文生成しない。
- lesson 本文は Owner ローカル実行前提で書き、サーバー実行や無人 publish を前提にしない。

## 失敗時の挙動

- `intake_bundle.classification` が `anchor_only` または `unsupported` の場合は、`LessonDraft` を捏造せず、この段に進めない理由を短く返す。
- 単一 Atom の境界に収まらない場合は、無理に `capability_outputs` を増やさず `intake` の再分類を提案する。
- schema を満たせないときは本文生成を優先しない。まず metadata を成立させる。

## 新規: fresh_context_bundle 入力

`lesson:research` 段で集めた `FreshContextBundle` が `fresh_context_bundle` として入ってくることがあります。あれば次のように使ってください。なければ従来通り intake_bundle のみで draft を作り、この節の手順は全て省略します。

入力構造（抜粋）:

```yaml
fresh_context_bundle:
  run_id: <string>
  fetched_at: <ISO8601>
  signals: [{ source, reason }]
  contexts:
    - id: twitter:1234567890
      source: twitter
      url: https://twitter.com/...
      author: handle
      text: <投稿本文>
      engagement: { likes, retweets, replies, impressions }
      language: ja|en|...
      matched_signal: { source, reason }
```

使い方:

1. **テーマ抽出**: `contexts[].text` を一読し、共通する 2-3 個の話題（フレッシュなテーマ・つまずき・実例）を抽出する
2. **本文冒頭の導入**: 抽出したテーマを 1-2 段落の短い導入として `body_markdown` の冒頭に「最近の現場では…」のような書き出しで反映する。この段落には URL を貼らない
3. **ソース引用（本文内）**: 直接参考にした上位 2-4 件のエントリは、本文末尾近くに「## 参考にしたソース」という見出しの小さなセクションを作り、以下の形式で列挙する:
   - `> @<author>: <text を1行に要約> — <url>`
   これが raw URL を残す唯一の正しい場所。`body_markdown` 内のみ。
4. **freshness_sources への追加**: `lesson_yaml.freshness_sources` には **raw URL を入れない**。代わりに、matched_signal 側に基づいたカノニカルなソース ID を 1 件だけ追加する。形式は `twitter-recent-<短いトピック>`（例: `twitter-recent-manus`、`twitter-recent-cursor-tips`）。`intake_bundle.freshness_signals[].source` から来たカノニカル ID と重複しないよう差分のみ追加する
5. **高 engagement フラグ**: `engagement.likes >= 1000` もしくは `engagement.impressions >= 10000` のエントリがあれば、Owner レビュー観点として `anticipated_blockers` に「Owner 確認: <author> の高反響投稿 <url> — <短い背景>」を 1 行追加する

厳守事項:

- `freshness_sources` は**常にカノニカルなソース ID の配列**。raw URL、ドメイン、記事タイトルを入れたら schema 違反として扱う
- raw URL は `body_markdown` の「参考にしたソース」節の内側でのみ露出させる
- `contexts` は最新性を優先した参考情報であり、lesson の正確性は intake_bundle と既存 atom を一次根拠とする
- 不確かな主張、未確認のクレーム、宣伝色の強い投稿は無視する。引用するなら一次ソースに辿れるものだけ
- 言語が混在する場合は本文と同じ「です・ます調」の日本語で要約してから取り込む

## 出力例

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

  この Atom では `profiles` テーブルに対する最小の policy を1本書きます。

  ![RLS手順図](/lesson-assets/atom.supabase.rls-basics/diagram.png)

  ## 手順

  1. RLS を有効化する
  2. `auth.uid() = user_id` の条件で select policy を書く
  3. テスト用ユーザーで結果を確認する
image_briefs:
  - "diagram slot: RLS有効化 -> policy追加 -> テスト確認 の3段フローを明るい UI 図で示す"
video_briefs:
  - "screen_capture slot: Supabase dashboard で policy を追加してテストする 30-45秒の短い録画"
eval_cases:
  - "policy 作成前は他ユーザー行が見えないことを説明できる"
  - "policy 作成後に自ユーザー行だけ取得できる"
anticipated_blockers:
  - "RLS 有効化と policy 作成の順番を誤る"
pr_summary: "Supabase RLS Atom を、policy を1本書き切る実践寄りの draft に更新"
```
