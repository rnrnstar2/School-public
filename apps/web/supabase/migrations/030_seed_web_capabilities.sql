BEGIN;

INSERT INTO capabilities (domain_id, slug, label, description)
SELECT domain.id, seed.slug, seed.label, seed.description
FROM (
  VALUES
    ('ai-coding-cli-setup', 'AI coding CLI セットアップ', 'Codex や Claude Code などの AI coding CLI を導入し、Node.js / pnpm / PATH / 認証を整える能力'),
    ('mcp-connection', 'MCP 接続', 'MCP サーバーや各種コネクタを接続し、AI が必要なコンテキストやツールを参照できる状態にする能力'),
    ('vercel-deploy', 'Vercel デプロイ', 'Vercel にプロジェクトを接続し、本番設定・環境変数・公開確認まで進める能力'),
    ('supabase-setup', 'Supabase セットアップ', 'Supabase プロジェクト作成、接続設定、環境変数管理を行い開発に組み込む能力'),
    ('prompt-design', 'プロンプト設計', 'AI への依頼を目的・制約・出力形式まで含めて設計し、再現性のある結果を得る能力'),
    ('image-generation', '画像生成', '画像生成 AI を使って Web 用のビジュアルを作成し、用途に応じて調整する能力'),
    ('content-writing', 'コンテンツ執筆', 'Web サイトの説明文、記事、導線コピーなどを目的に合わせて執筆・改善する能力'),
    ('design-system', 'デザインシステム', '色・余白・タイポグラフィ・UI パターンを整理し、画面全体の一貫性を保つ能力'),
    ('responsive-layout', 'レスポンシブレイアウト', 'PC とモバイルの両方で破綻しないレイアウトと画面構成を作る能力'),
    ('seo-basics', 'SEO 基礎', 'タイトル・メタデータ・OGP・サイト構造を整え、検索流入の基礎を作る能力'),
    ('analytics-setup', 'アナリティクス設定', 'GA4 や PostHog などを導入し、主要な行動計測を取得できる状態にする能力'),
    ('form-handling', 'フォーム実装', '入力フォーム、バリデーション、送信フローを実装し、ユーザー操作を完結させる能力'),
    ('auth-flow', '認証フロー', 'ログイン、サインアップ、セッション管理を含む認証体験を設計・実装する能力'),
    ('database-modeling', 'データベース設計', '要件からテーブル・カラム・関係性を整理し、扱いやすいデータモデルを作る能力'),
    ('api-integration', 'API 連携', '外部 API やバックエンドとのデータ取得・更新フローを実装する能力'),
    ('error-handling', 'エラーハンドリング', '失敗時の分岐、再試行、ユーザー向けメッセージを整えて安全に運用する能力'),
    ('performance', 'パフォーマンス最適化', '読み込み速度や描画負荷を改善し、体感速度を高める能力'),
    ('accessibility', 'アクセシビリティ', 'キーボード操作、代替テキスト、コントラストなどを整え、使いやすさを広げる能力'),
    ('version-control', 'バージョン管理', 'Git / GitHub を使って変更履歴を管理し、安心して改善を進める能力'),
    ('project-scoping', 'プロジェクトスコーピング', '要件整理、MVP 定義、優先順位付けを通して実現可能な範囲に絞る能力')
) AS seed(slug, label, description)
CROSS JOIN LATERAL (
  SELECT id
  FROM domains
  WHERE slug = 'web'
) AS domain
ON CONFLICT (domain_id, slug) DO NOTHING;

COMMIT;
