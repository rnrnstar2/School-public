# ADR-0004: MVP の可観測性は Sentry・Supabase Logs・PostHog に限定する

- Status: Accepted
- Date: 2026-04-08

## Context

MVP では、少ない構成要素で「壊れた時に追えること」を優先する。現時点の主な構成要素は Next.js アプリ群、Supabase、外部 LLM API であり、マイクロサービス群ではない。

必要なのは次の 3 系統である。

- 例外、クラッシュ、重要な非同期失敗の検知
- DB、Auth、SQL 実行、Cron 起点を含む Supabase 側の確認
- プロダクト利用状況やファネルの把握

一方で、OTel Collector や APM 基盤を入れると、収集経路、属性規約、サンプリング、保存先まで一気に設計対象が増える。MVP ではその複雑さを避けたい。

## Decision

MVP の可観測性は Sentry、Supabase Logs、PostHog の 3 つに限定する。

- アプリケーション例外、API エラー、ジョブ失敗は Sentry に送る。
- Next.js サーバー側ログは JSON 形式で出力し、`request_id`、`job_id`、`user_id`、`persona_id`、`lesson_id` など相関用 ID を必ず含める。
- 重要なステップは Sentry breadcrumb と tag にも写し、エラー時の経路を辿れるようにする。
- DB、Auth、Cron、SQL 実行の確認は Supabase Logs を一次ソースとする。
- プロダクト分析は PostHog に限定し、ファネル、イベント、画面遷移を追う。
- OTel Collector は導入しない。

## Consequences

- ツール数を抑えつつ、障害調査、ログ確認、利用分析の最低限が揃う。
- 共通の相関 ID を持たせることで、Sentry、Supabase Logs、PostHog を人力でも横断できる。
- Collector や Agent の常駐運用が不要で、ローカル開発でも再現しやすい。
- 一方で、分散トレースは限定的で、サービス間の詳細な span 可視化までは行えない。
- 3 ツール横断の分析は多少手作業になるため、運用ルールとして相関 ID の付与が重要になる。
- サービス数や非同期経路が増えた時点で、OTel ベースの再評価余地を残す。

## Alternatives Considered

### OTel Collector

不採用。Collector 自体が常駐コンポーネントとなり、送信経路、属性設計、サンプリング、保存先の決定まで必要になる。MVP の構成規模に対して導入コストが高く、Supabase と Sentry を中心にした最小構成を崩す。

### Datadog

不採用。ログ、APM、RUM を一括で持てるが、導入コストと継続コストが高い。Sentry と PostHog ですでにカバーできる範囲と大きく重なり、MVP 段階では過剰である。

### New Relic

不採用。Datadog と同様に総合 APM としては強いが、MVP で必要な問題は「クラッシュを見つける」「Supabase 側を確認する」「利用状況を見る」に集約できる。可観測性のためだけに基盤を増やす優先度は低い。
