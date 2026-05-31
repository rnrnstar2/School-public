BEGIN;

INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT domain_row.id, capability.slug, capability.label, capability.description, capability.rubric_criteria
FROM domains AS domain_row
CROSS JOIN (
  VALUES
    ('scope-definition', '要件整理', '作るものの範囲と対象を定義できる', '目的・対象・制約を短く言語化し、着手範囲を絞れている。'),
    ('workflow-planning', '導線設計', '主要フローと MVP 導線を整理できる', '必要ページと主要導線を説明でき、MVP の範囲が明確である。'),
    ('task-breakdown', '実装分解', '実装を小さな作業単位へ分解できる', 'AI に渡せる粒度でタスクを列挙し、優先順位を付けられる。'),
    ('tooling-setup', 'ツール準備', '開発に必要なツールとアカウントを準備できる', '必要ツールが利用可能で、環境差分に応じた確認ができる。'),
    ('repo-initialization', 'リポジトリ初期化', 'Next.js の土台と GitHub 連携を整えられる', '初期アプリ・保存先・プレビュー導線が用意されている。'),
    ('local-development', 'ローカル開発', 'ローカルまたは preview ベースで反復できる', 'ローカル起動または preview で変更確認できる。'),
    ('version-control', 'Git 運用', '変更を GitHub ベースで安全に管理できる', '保存・共有・ロールバックの単位が明確である。'),
    ('codebase-orientation', 'コード読解', '既存コードの主要構造を把握できる', '主要ディレクトリ・エントリポイント・責務を説明できる。'),
    ('styling-setup', 'スタイリング導入', 'UI 実装前のスタイル基盤を整えられる', 'Tailwind 等のスタイル基盤が有効で、確認方法を知っている。'),
    ('component-composition', 'UI コンポーネント構成', '画面をコンポーネント単位で組み立てられる', 'レイアウトや再利用単位を意識して画面を分解できる。'),
    ('layout-building', 'レイアウト構築', 'アプリ全体の共通レイアウトを組み立てられる', 'ナビゲーションや共通 UI を一貫して配置できる。'),
    ('page-design', 'ページ設計', 'ページごとの訴求と構成を設計できる', '目的に対して必要な情報配置と CTA を説明できる。'),
    ('routing', '画面遷移', 'ページ遷移と情報設計を実装できる', 'ルーティング構成と画面間のつながりを説明できる。'),
    ('design-consistency', 'デザイン統一', '余白・タイポ・状態表現を揃えられる', '複数画面で一貫した見た目と操作感を維持できる。'),
    ('backend-setup', 'Supabase 準備', 'Supabase を使う前提条件を整えられる', '接続先・権限・使うデータ範囲を整理できる。'),
    ('env-management', '環境変数管理', '環境変数を安全に管理できる', '必要な env を列挙し、安全な保存場所と注入先を理解している。'),
    ('data-modeling', 'データ設計', '最初のテーブルやカラムを設計できる', 'テーブルの目的・主要カラム・制約を説明できる。'),
    ('database-read', 'データ取得', 'Supabase からデータを取得して表示できる', '取得クエリと UI のつながりを確認できる。'),
    ('database-write', 'データ更新', '入力からデータ保存までを実装できる', '保存フローで必要な検証とエラーハンドリングを説明できる。'),
    ('auth-basics', '認証の基礎', '認証フローの基本を実装できる', 'ログイン導線・セッション・制限対象を説明できる。'),
    ('deployment-prep', 'デプロイ前確認', '本番デプロイ前のチェックを整えられる', 'env・build warning・公開前チェック項目を確認できる。'),
    ('deployment', 'Vercel 設定', 'Vercel への接続と設定を行える', 'repo 接続・root directory・env 設定を適切に揃えられる。'),
    ('production-debugging', '本番デバッグ', '本番 build / runtime の失敗を切り分けられる', 'build log と production 差分を見て原因候補を説明できる。'),
    ('launch-verification', '公開確認', '公開後の確認項目を実行できる', '公開 URL・主要導線・環境変数の反映を検証できる。'),
    ('polish', '仕上げ改善', '公開後の見た目や体験を整えられる', '公開前後に小さな改善を選び、完了まで持っていける。'),
    ('handoff', '引き継ぎ整理', '作ったものを他者へ説明できる', '目的・構成・使い方・制約を短くまとめられる。'),
    ('roadmapping', '次の開発計画', '次に進める改善を優先順位付きで整理できる', '次の改善候補を列挙し、優先順位を付けられる。'),
    ('vercel-deploy', 'Vercel デプロイ', 'Vercel に公開し live URL まで確認できる', 'Vercel へ deploy し、公開 URL と初回 build の検証を完了している。')
) AS capability(slug, label, description, rubric_criteria)
WHERE domain_row.slug = 'web'
ON CONFLICT (domain_id, slug) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  rubric_criteria = EXCLUDED.rubric_criteria;

COMMIT;
