# lesson-factory

`lesson-factory/` は、教材の draft、批評、素材、評価を Owner がローカルで制作するための作業場です。配信面から制作ループを分離し、生成物の差分と判断は Git を唯一の SoT として管理します。常駐サーバーでの実行や無人 publish は行いません。

方針は [ADR-0006: レッスン生成と改善は Owner ローカル実行に限定する](../docs/adr/ADR-0006-owner-local-only-lesson-generation-boundary.md) に従います。

## 目的

- 配信系アプリと教材制作ループを分離する
- Owner ローカル専用の下書き、批評、素材生成、評価の場を固定する
- Git に原本、差分、判断履歴を残し、公開前の責務境界を明確にする

## ディレクトリマップ

- `lessons/`: Atom、Anchor、Persona のソース置き場
- `assets/`: 画像と動画の生成物置き場
- `evals/`: dataset、persona、rubric など評価用素材
- `adapters/`: モデルやメディア生成器を差し替えるための抽象境界
- `pipelines/`: intake から publish までの制作段階の責務定義
- `schemas/`: JSON Schema による入出力契約
- `logs/`: 実行履歴と unsupported goal の記録

## 3層モデルとの関係

学習体験の 3 層モデルは `Atoms`、`Anchors`、`Compiled Plan` です。これらの runtime 実装、配信、公開制御は本ディレクトリの責務ではありません。`lesson-factory/` は、その 3 層へ入稿する前の原稿、素材、評価、契約を Owner ローカルで扱う制作領域です。

## Pipeline 6段概要

1. `intake`: 目標、ペルソナ、制約、既存 Atom を正規化する
2. `draft`: レッスン本文と lesson YAML を下書きする
3. `critique`: draft の問題点と修正方針を整理する
4. `media`: 画像・動画 brief から Asset を生成する
5. `eval`: schema、pedagogy、execution、persona-simulation の 4 観点で評価する
6. `publish`: Owner 承認済みの成果物を Git に反映する準備を行う

## Eval 4種

- `schema`: JSON Schema への適合
- `pedagogy`: 学習順序、説明負荷、達成可能性
- `execution`: 手順の再現性、依存関係、検証可能性
- `persona-simulation`: 想定 persona が詰まらず進めるか

## Status 4段

- `draft`: 初稿。未レビュー
- `reviewed`: 人手レビュー済み
- `experimental`: 限定運用または追加検証中
- `stable`: 明示的な人手判断で安定版とみなす

`stable` への自動昇格は禁止します。評価結果は補助情報であり、最終判断は Owner が行います。

## Adapter 抽象化の意図

`adapters/` は、特定のモデル名や SDK に依存せず、出力契約だけを固定するための層です。`claude-code`、`gemini`、`image`、`video` の実装は将来差し替え可能であり、契約に適合する限り内部実装は自由に交換できます。

## フェーズ境界

Phase 1b では scaffold、schema、README、サンプルのみを置きます。実装コードは Phase 2 以降で追加し、このディレクトリからサーバー実行は行いません。

## 初回ブートストラップ（Owner 向け）

前提:

- Supabase プロジェクト作成済み
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を取得済み

手順:

1. `export SUPABASE_URL=...`
2. `export SUPABASE_SERVICE_ROLE_KEY=...`
3. `bash lesson-factory/scripts/bootstrap.sh`
4. 完了後、`apps/web` を Vercel にデプロイし、同じ Supabase プロジェクトを向く環境変数を揃える

期待結果:

- `lesson:sync` により `lesson_atoms` / `lesson_atom_versions` に初期 atom が反映される
- 既存の persona / anchor seed を含む初期 DB セットでは、20 atom + 5 personas + 1 anchor を想定する

## atom 改善ワークフロー（Owner 向け）

Claude Code サブスクを前提にした改善ループは次のとおりです。理想形は `lesson:improve <atom-id>` の 1-click flow ですが、現時点では `lesson:improve` は未実装です。そのため、Owner が `lessons/atoms/<id>.yaml` と `lessons/atoms/<id>.body.md` を直接編集し、Claude Code セッションで改善します。

1. `pnpm --filter @school/lesson-factory lesson:list` で改善対象 atom を決める
2. `pnpm --filter @school/lesson-factory lesson:improve atom.web-builder.create-next-app` 相当の作業として、対象の YAML と body markdown を Claude Code で直接改善する
3. 改善案を intake bundle にまとめ、`pnpm --filter @school/lesson-factory lesson:draft <intake-bundle.yaml>` で draft を生成する
4. `pnpm --filter @school/lesson-factory lesson:critique <draft.json> --adapter gemini` で別モデル批評をかける
5. `pnpm --filter @school/lesson-factory lesson:eval <draft.json> <critique.json>` で schema / pedagogy / execution / persona-simulation の 4 種評価を行う
6. `pnpm --filter @school/lesson-factory lesson:publish <draft.json> <eval-bundle.json>` で `lessons/atoms/<id>.yaml` を更新する
7. `pnpm --filter @school/lesson-factory lesson:sync` で DB に反映する
8. 既存 atom version を `/admin/atom-versions` から `reviewed` → `experimental` → `stable` に昇格する。`stable` は必ず手動確認を通す

## External Context Sources

`lesson:research` は intake bundle の `freshness_signals` を起点に、X/Twitter などの外部ソースから最新事例を集めて `FreshContextBundle` を保存する MVP コマンドです。draft 段に `--context <path>` で渡すと本文導入の素材として参照されます。

- 必須環境変数: `TWITTER_BEARER_TOKEN`（X API v2 Recent Search に Read 権限のある Bearer Token）
- 取得時のみ参照されます。import 時には要求されないため、未設定でも他のコマンドは動作します
- 例: `export TWITTER_BEARER_TOKEN=AAAA... && pnpm --filter @school/lesson-factory lesson:research path/to/intake.yaml --adapter twitter --output path/to/context.json`
- レート制限・認証エラーは即時 throw します（サイレントフォールバックなし）。429 が出たらリセット時刻まで待機してください
- MVP では Twitter のみ対応。Phase 2 で web-fetch / RSS / GitHub releases / news を追加予定

## 画像/動画生成

画像生成の標準動線は **Owner が契約している Codex / ChatGPT サブスクの built-in imagegen** を使う。OpenAI API key、Image API、`imagegen` fallback CLI は標準動線では使わない。

1. `pnpm --filter @school/lesson-factory lesson:media:queue <draft.json>` で Codex imagegen 用 queue と prompt guide を作る
2. Codex / ChatGPT の built-in imagegen で guide の prompt を 1 job ずつ生成する
3. 生成した PNG を queue の `target_file_path` に保存する
4. `pnpm --filter @school/lesson-factory lesson:media:import <queue.json>` で `Asset[]` bundle を作り、`apps/web/public/lesson-assets/<id>/` に mirror する

配置規約:

- Canonical images は `lesson-factory/assets/images/<id>/<slot>.png` に置く
- Next.js runtime 向けの copy は `apps/web/public/lesson-assets/<id>/<slot>.png` に置く
- draft の `body_markdown` は `![...](/lesson-assets/<id>/<slot>.png)` を本文内に出力する
- Web renderer は標準の Markdown 画像描画でそれを表示する
- 動画生成物は引き続き `lesson-factory/assets/videos/` に配置する

互換用に `pnpm --filter @school/lesson-factory lesson:media <draft.json>` も残しているが、これは `GEMINI_API_KEY` があれば Nano Banana、なければ stub image を生成する自動 adapter であり、サブスク imagegen 標準動線ではない。
