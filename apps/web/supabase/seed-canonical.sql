-- ============================================================
-- Canonical Tables Seed Data
-- Goal-First Architecture 用シードデータ
-- ============================================================
-- ON CONFLICT DO NOTHING で冪等に適用可能。
-- migration 027 適用後に実行すること。
-- ============================================================

-- ============================================================
-- 1. Domains（4領域）
-- ============================================================
INSERT INTO domains (slug, label, description, icon, sort_order) VALUES
  ('web',        'Web開発',           'Webサイト・Webアプリ制作の学習領域', 'globe',    0),
  ('automation', 'AI業務自動化',      'AIを活用した業務効率化・自動化の学習領域', 'zap',      1),
  ('content',    'AIコンテンツ制作',  'AIを使ったコンテンツ制作の学習領域', 'pen-tool', 2),
  ('app',        'AIアプリ制作',      'AIを組み込んだアプリ開発の学習領域', 'cpu',      3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. Tool Profiles（削除済み）
-- ============================================================
-- tool_profiles テーブルは migration 20260409040000_phase8_drop_legacy_admin_tables.sql
-- で DROP されたため、この seed からも該当 INSERT を除外する。
-- full seed.sql 側にはすでに存在しないため、差分はここだけで閉じる。

-- ============================================================
-- 3. Track Views（削除済み）
-- ============================================================
-- removed: track_views no longer exists in schema (was dropped by 20260409040000_phase8_drop_legacy_admin_tables.sql)
-- 旧 INSERT INTO track_views (...) ブロックは phase8 で DROP 済みのため除外。

-- ============================================================
-- 4. Content Tags（削除済み）
-- ============================================================
-- removed: content_tags no longer exists in schema (was dropped by 20260409040000_phase8_drop_legacy_admin_tables.sql)
-- 旧 INSERT INTO content_tags (...) ブロックは phase8 で DROP 済みのため除外。

-- ============================================================
-- 5. Capabilities（ドメイン別スキル 13件）
-- ============================================================

-- Web開発ドメイン
INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT d.id, cap.slug, cap.label, cap.description, cap.rubric_criteria
FROM domains d
CROSS JOIN (VALUES
  ('html-css-basics',   'HTML/CSS基礎',       'HTMLとCSSでWebページの構造とスタイルを記述できる', '有効なHTML構造を作成できる。CSSでレイアウトとスタイリングを適用できる。'),
  ('responsive-design', 'レスポンシブデザイン', 'デバイスに応じたレイアウト調整ができる',           'モバイル・タブレット・デスクトップで適切に表示される。メディアクエリまたはTailwindのブレークポイントを使える。'),
  ('next-js-app',       'Next.jsアプリ構築',   'Next.jsでページルーティングとデータ取得を実装できる', 'App Routerでページを作成できる。Server/Client Componentを適切に使い分けられる。'),
  ('deployment',        'デプロイ',            'Webアプリを本番環境にデプロイできる',              'Vercelまたは同等のプラットフォームにデプロイし、公開URLでアクセスできる。'),
  ('ai-coding-tools',   'AIコーディングツール', 'AIツールを活用して効率的にコーディングできる',       'Claude CodeまたはCursorでコード生成・修正ができる。プロンプトで意図を伝えられる。')
) AS cap(slug, label, description, rubric_criteria)
WHERE d.slug = 'web'
ON CONFLICT (domain_id, slug) DO NOTHING;

-- AI業務自動化ドメイン
INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT d.id, cap.slug, cap.label, cap.description, cap.rubric_criteria
FROM domains d
CROSS JOIN (VALUES
  ('workflow-design',        'ワークフロー設計',        '業務プロセスを分析しAI活用ポイントを特定できる',   '現行業務フローを図式化し、AI自動化の候補を3つ以上提案できる。'),
  ('ai-prompt-engineering',  'AIプロンプトエンジニアリング', '目的に応じた効果的なプロンプトを設計できる', 'システムプロンプト・few-shot・chain-of-thoughtを使い分けられる。'),
  ('tool-integration',       'ツール連携',              '複数のAIツールやAPIを組み合わせてワークフローを構築できる', 'Zapier/Make等でAI APIを含むワークフローを構築・テストできる。')
) AS cap(slug, label, description, rubric_criteria)
WHERE d.slug = 'automation'
ON CONFLICT (domain_id, slug) DO NOTHING;

-- AIコンテンツ制作ドメイン
INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT d.id, cap.slug, cap.label, cap.description, cap.rubric_criteria
FROM domains d
CROSS JOIN (VALUES
  ('ai-writing',         'AIライティング',      'AIを活用して質の高い文章を効率的に作成できる', 'AIで下書きを生成し、編集・推敲して公開品質の記事を作成できる。'),
  ('content-strategy',   'コンテンツ戦略',      'ターゲットに合わせたコンテンツ企画ができる',   '読者ペルソナを設定し、コンテンツカレンダーを作成できる。'),
  ('multimedia-creation','マルチメディア制作',   'AIツールで画像・動画・音声コンテンツを制作できる', 'AI画像生成ツールでブログ用画像を作成できる。動画編集の基本ができる。')
) AS cap(slug, label, description, rubric_criteria)
WHERE d.slug = 'content'
ON CONFLICT (domain_id, slug) DO NOTHING;

-- AIアプリ制作ドメイン
INSERT INTO capabilities (domain_id, slug, label, description, rubric_criteria)
SELECT d.id, cap.slug, cap.label, cap.description, cap.rubric_criteria
FROM domains d
CROSS JOIN (VALUES
  ('prototyping',     'プロトタイピング',    'アイデアを素早くプロトタイプに落とし込める',           'v0やClaude Codeでプロトタイプを48時間以内に作成できる。'),
  ('ai-integration',  'AI機能統合',          'アプリにAI機能（チャット、生成、分類等）を組み込める', 'OpenAI/Anthropic APIを使い、アプリにAI機能を実装できる。')
) AS cap(slug, label, description, rubric_criteria)
WHERE d.slug = 'app'
ON CONFLICT (domain_id, slug) DO NOTHING;

-- ============================================================
-- 6. Minimal lesson_atoms fixture (TQ-125)
-- ============================================================
-- AC-16 (/lessons page E2E) and other specs that reach the SSR lesson
-- library require at least one atom row with a `current_version_id`.
-- The full `seed.sql` ships 500+ atoms, which is too heavy for the
-- `--minimal` fast-reset path used by verify.sh. We insert a small
-- handful of canonical atoms here so the /lessons page is non-empty
-- and exposes AI / ツール / コーディング keywords the critical-path
-- tests assert on.
INSERT INTO lesson_atoms (atom_id, source_path) VALUES
  ('atom.canonical.ai-tool-intro',      'lessons/atoms/atom.canonical.ai-tool-intro.yaml'),
  ('atom.canonical.ai-coding-basics',   'lessons/atoms/atom.canonical.ai-coding-basics.yaml'),
  ('atom.canonical.ai-workflow-design', 'lessons/atoms/atom.canonical.ai-workflow-design.yaml')
ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path, updated_at = now();

INSERT INTO lesson_atom_versions (atom_id, status, yaml_content, body_markdown, metadata)
VALUES
  (
    'atom.canonical.ai-tool-intro',
    'reviewed',
    jsonb_build_object(
      'id', 'atom.canonical.ai-tool-intro',
      'title', 'AIツールの選び方入門',
      'summary', '学習を進めるうえで役立つAIツールを目的別に整理します。',
      'persona_tags', jsonb_build_array('ai-first-learner'),
      'goal_tags', jsonb_build_array('understand-ai-tools'),
      'status', 'reviewed'
    ),
    '# AIツールの選び方入門' || E'\n\n' || '学習を進めるうえで役立つAIツールを目的別に整理します。',
    '{}'::jsonb
  ),
  (
    'atom.canonical.ai-coding-basics',
    'reviewed',
    jsonb_build_object(
      'id', 'atom.canonical.ai-coding-basics',
      'title', 'AIコーディングの基礎',
      'summary', 'AIアシスタントと一緒に書く基本の流れを体験します。',
      'persona_tags', jsonb_build_array('ai-first-learner'),
      'goal_tags', jsonb_build_array('learn-ai-coding'),
      'status', 'reviewed'
    ),
    '# AIコーディングの基礎' || E'\n\n' || 'AIアシスタントと一緒に書く基本の流れを体験します。',
    '{}'::jsonb
  ),
  (
    'atom.canonical.ai-workflow-design',
    'reviewed',
    jsonb_build_object(
      'id', 'atom.canonical.ai-workflow-design',
      'title', 'AI業務ワークフローの設計',
      'summary', '業務プロセスにAIを組み込むための最小構成を学びます。',
      'persona_tags', jsonb_build_array('ai-first-learner'),
      'goal_tags', jsonb_build_array('design-ai-workflow'),
      'status', 'reviewed'
    ),
    '# AI業務ワークフローの設計' || E'\n\n' || '業務プロセスにAIを組み込むための最小構成を学びます。',
    '{}'::jsonb
  );

-- Wire each atom's current_version_id to its freshly-inserted version row.
-- DISTINCT ON picks one version per atom_id; we just inserted one each above
-- so this is deterministic even if seed is re-applied without `db reset`.
UPDATE lesson_atoms la
   SET current_version_id = v.version_id,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (atom_id) atom_id, version_id
      FROM lesson_atom_versions
     WHERE atom_id IN (
       'atom.canonical.ai-tool-intro',
       'atom.canonical.ai-coding-basics',
       'atom.canonical.ai-workflow-design'
     )
     ORDER BY atom_id, imported_at DESC
  ) v
 WHERE la.atom_id = v.atom_id;
