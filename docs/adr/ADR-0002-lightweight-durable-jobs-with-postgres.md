# ADR-0002: 専用ワークフローエンジンを導入せず Postgres jobs で耐久ジョブを実装する

- Status: Accepted
- Date: 2026-04-08

## Context

イベントを受けた後には、即時レスポンスに載せない耐久ジョブが必要になる。例として、draft 受け入れ後の非同期処理、レポート生成、再集計、再試行付きの外部 API 呼び出しがある。

ただし、MVP には次の制約がある。

- Temporal、Inngest、EventBridge などの専用基盤は採用しない。
- レッスン生成と改善ループは Owner ローカル実行のみであり、サーバー側で長大な生成ワークフローを持たない。
- AWS は使わない。
- 失敗時の再試行と冪等性は必要だが、巨大なオーケストレーション機能は不要である。

この条件では、耐久性は必要だが、専用エンジンが提供する高度な分散ワークフロー機能までは過剰になる。

## Decision

MVP の耐久ジョブは Postgres の `jobs` テーブルで実装する。

- `job_id` を外部公開可能な冪等キーとして持ち、重複投入を防ぐ。
- `job_type`、`status`、`payload_json`、`attempt_count`、`run_after`、`leased_until`、`last_error` を持つ。
- 状態遷移は `queued`、`running`、`succeeded`、`failed`、`retry_waiting`、`dead_letter` を基本とする。
- Worker は行ロックを使ってジョブを取得し、Lease 期限切れジョブを再取得可能にする。
- `pg_cron` で retry sweeper と stalled job 回収を回す。
- Job 実行側は副作用先にも `job_id` を伝播させ、冪等更新を徹底する。
- この jobs 基盤は、サーバー責務に含まれる処理だけに使う。ADR-0006 により、レッスン本文の生成や自動改修には使わない。

将来的に、日跨ぎの human-in-the-loop 承認、多段 Saga、複数サービスをまたぐ長期オーケストレーションが必要になった時点で Temporal Cloud を再評価する。

## Consequences

- 耐久ジョブの状態を SQL で直接確認でき、運用が単純になる。
- Supabase に責務を寄せるため、新しい常駐ミドルウェアを導入しなくてよい。
- 失敗再試行、重複防止、手動再実行を MVP に必要な粒度で実装できる。
- 一方で、分散ワークフローエンジンのような履歴 UI、補償 Saga、長期タイマー、複雑な分岐 DSL は自前で持たない。
- 状態遷移設計を雑にすると application code に複雑さが戻るため、ジョブ種類は少なく保つ必要がある。

## Alternatives Considered

### Temporal Cloud

不採用。強力だが、Workflow/Activity モデル、専用 SDK、リプレイ制約、運用知識の導入コストがある。MVP のサーバー側ジョブは比較的短く、ADR-0006 により最も重い生成ワークフローはローカルに閉じるため、現時点では過剰である。

### Inngest

不採用。イベント駆動ワークフローとしては便利だが、外部サービス依存と独自実行モデルを増やす。既に Postgres に置くイベントテーブルと jobs テーブルで足りる範囲の問題に、別の実行基盤を追加する形になる。

### Redis/BullMQ 系キュー

不採用。Redis を別途運用する必要があり、MVP の採用基盤を Supabase に絞る方針に反する。ジョブ状態と業務データが別ストアに分かれ、調査も複雑になる。
