# Stage: context-fetch

## 役割

`intake_bundle.freshness_signals` を起点に、外部ソース（X/Twitter、Web、RSS など）から最新の話題・実例・つまずき事例を集める段です。集めた `FreshContext[]` は次段 `draft` のプロンプト入力 `fresh_context_bundle` として参照されます。

> MVP メモ: 現状の実装はこのプロンプトを呼び出さず、`TwitterAdapter` のキーワード検索結果を ID で deduplicate するだけのプリプロセス層です。本プロンプトは Phase 2 のセマンティック・フィルタ段（重複・関連度・品質スコアリング）を導入する際に有効化します。

## 入力契約（Phase 2 想定）

- `intake_bundle`: `../intake/PROMPT.md` の出力
- `raw_contexts`: 各アダプタが集めた `FreshContext[]`（重複・低品質を含む）

## 出力契約（Phase 2 想定）

- `filtered_contexts`: 重複排除・関連度判定・低品質排除を済ませた `FreshContext[]`
- `notes`: なぜそのコンテキストを残したか／落としたかの 1 行根拠

## MVP の挙動

`runContextFetchPipeline` は本ファイルを読み込みません。MVP の責務は次の 2 点だけです:

1. アダプタ呼び出し（現状は `TwitterAdapter`）
2. `id` ベースの dedup

セマンティック判定は `draft` 段の LLM が `fresh_context_bundle` を見ながら行い、引用元として `freshness_sources` に追加します。
