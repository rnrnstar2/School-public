# ADR-0005: LLM は OpenAI と Anthropic の dual 構成にし Model Registry でルーティングする

- Status: Accepted
- Date: 2026-04-08

## Context

MVP では、実行系、生成系、改善系で求めるモデル特性が異なる。厳密な構造化出力、長文コンテキスト処理、品質重視のレビュー、埋め込み生成、コスト最適化を 1 つのベンダーに固定すると、品質、価格、可用性のどこかで歪みが出やすい。

また、方針として次が決まっている。

- LLM は OpenAI と Anthropic の dual 構成にする。
- AWS は使わないので Bedrock は候補から外す。
- モデル選択はコードへのベタ書きではなく、差し替え可能な経路に寄せたい。
- キャッシュと Batch API は、対話品質を壊さない範囲でだけ使う。

## Decision

OpenAI と Anthropic の dual 構成を採用し、アプリケーションコードは Provider ではなく Model Registry を参照してルーティングする。

- Model Registry は `task_kind` ごとに primary、fallback、timeout、max_tokens、supports_json_schema、supports_batch、cache_policy を持つ。
- 初期方針として、厳密な構造化出力、埋め込み生成、バッチ化しやすい処理は OpenAI を優先する。
- 長文コンテキストでの推論やレビュー品質を重視する処理は Anthropic を優先候補に置く。
- Provider 障害やレート制限時は Registry 定義に従って fallback する。
- キャッシュは、入力正規化、プロンプトテンプレート版管理、個人情報取り扱いルールを満たす決定論的タスクに限定する。
- Batch API は対話リクエスト経路では使わず、埋め込み再生成、オフライン評価、改善提案レポートなどの非対話バッチに限定する。
- ADR-0006 に従い、レッスン本文の生成と改善ループは Owner ローカル実行であり、サーバー側のモデル利用は runtime と report generation の範囲に留める。

## Consequences

- Provider 固有コードが散らばらず、モデル差し替えや A/B 比較をやりやすい。
- 単一ベンダー障害時にも fallback 経路を確保できる。
- タスクごとにコストと品質の最適点を選びやすい。
- 一方で、評価指標、回帰テスト、キャッシュ無効化、プロンプト版管理の運用が必要になる。
- dual 構成は単一ベンダーよりも設定項目が増えるため、Registry を単純に保つことが重要である。

## Alternatives Considered

### OpenAI 単独

不採用。実装は単純だが、障害時の逃げ道がなく、価格改定や品質変動の影響を直接受ける。埋め込みや構造化出力は強みだが、すべての推論系タスクを 1 社に寄せる必要はない。

### Anthropic 単独

不採用。長文推論やレビュー品質には魅力があるが、埋め込み、Batch API、構造化出力周りを含めた全用途の最適解とは限らない。用途ごとに得手不得手を分けた方が合理的である。

### Bedrock

不採用。AWS 不使用方針に反する。加えて、Provider の上にさらに AWS の制御面を挟むため、MVP の単純さと運用境界を崩す。

### Gemini

現時点では不採用。3 社目を入れると Registry、評価、フォールバック、課金監視が一段複雑になる。現時点では OpenAI と Anthropic で十分に比較軸を持てるため、必要性が具体化した時に再検討する。
