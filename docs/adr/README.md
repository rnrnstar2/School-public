# ADR Index

Phase 0 のアーキテクチャ決定記録（ADR）一覧です。対象は「ペルソナベース自律進化型レッスン生成プラットフォーム」MVP で、2026-04-08 時点の合意事項を記録しています。

1. [ADR-0001: Supabase Postgres をイベントバックボーンとして採用する](/Users/rnrnstar/github/School/docs/adr/ADR-0001-lightweight-event-bus-with-supabase-postgres.md)
   Supabase Postgres のイベントテーブルを正本にし、`LISTEN/NOTIFY` と `pg_cron` を組み合わせて MVP の疎結合イベント連携を実現する。
2. [ADR-0002: 専用ワークフローエンジンを導入せず Postgres jobs で耐久ジョブを実装する](/Users/rnrnstar/github/School/docs/adr/ADR-0002-lightweight-durable-jobs-with-postgres.md)
   `jobs` テーブル、明示的な状態遷移、`pg_cron` 再試行、`job_id` 冪等性で MVP に必要な耐久ジョブを賄う。
3. [ADR-0003: 埋め込み検索と RAG に pgvector を採用する](/Users/rnrnstar/github/School/docs/adr/ADR-0003-pgvector-for-embeddings-and-rag.md)
   会話ログとレッスン埋め込みを Supabase Postgres に同居させ、SQL フィルタ付きのハイブリッド検索を行う。
4. [ADR-0004: MVP の可観測性は Sentry・Supabase Logs・PostHog に限定する](/Users/rnrnstar/github/School/docs/adr/ADR-0004-observability-with-sentry-supabase-logs-and-posthog.md)
   Next.js の JSON ログと Sentry breadcrumb を基本に、エラー監視・DB ログ・プロダクト分析を最小構成で揃える。
5. [ADR-0005: LLM は OpenAI と Anthropic の dual 構成にし Model Registry でルーティングする](/Users/rnrnstar/github/School/docs/adr/ADR-0005-dual-llm-routing-with-openai-and-anthropic.md)
   OpenAI と Anthropic をタスク単位で使い分け、フォールバック、キャッシュ、Batch API 利用方針を Model Registry に集約する。
6. [ADR-0006: レッスン生成と改善は Owner ローカル実行に限定する](/Users/rnrnstar/github/School/docs/adr/ADR-0006-owner-local-only-lesson-generation-boundary.md)
   サーバーは draft 受け入れ、version 管理、公開までに責務を限定し、改善提案レポートを超える自動改修は行わない。
