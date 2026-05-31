-- ============================================
-- 教育プラットフォーム初期スキーマ
-- 作成日: 2024-03-07
-- ============================================

-- ============================================
-- テーマ（カテゴリー）
-- ============================================
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE themes IS 'テーマ（カテゴリー）マスターテーブル';
COMMENT ON COLUMN themes.title IS 'テーマ名';
COMMENT ON COLUMN themes.description IS 'テーマの説明';
COMMENT ON COLUMN themes.icon IS 'アイコン（絵文字またはアイコン名）';

-- ============================================
-- コース
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE courses IS 'コースマスターテーブル';
COMMENT ON COLUMN courses.theme_id IS '親テーマID';
COMMENT ON COLUMN courses.title IS 'コース名';
COMMENT ON COLUMN courses.description IS 'コースの説明';
COMMENT ON COLUMN courses.thumbnail IS 'サムネイル画像URL';
COMMENT ON COLUMN courses.difficulty IS '難易度（beginner/intermediate/advanced）';
COMMENT ON COLUMN courses.order_index IS '表示順';

-- ============================================
-- 教材（レッスン）
-- ============================================
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lessons IS '教材（レッスン）テーブル';
COMMENT ON COLUMN lessons.course_id IS '親コースID';
COMMENT ON COLUMN lessons.title IS 'レッスンタイトル';
COMMENT ON COLUMN lessons.content IS 'レッスン本文';
COMMENT ON COLUMN lessons.video_url IS '動画URL';
COMMENT ON COLUMN lessons.order_index IS '表示順';

-- ============================================
-- 課題
-- ============================================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE assignments IS '課題テーブル';
COMMENT ON COLUMN assignments.lesson_id IS '親レッスンID';
COMMENT ON COLUMN assignments.title IS '課題タイトル';
COMMENT ON COLUMN assignments.description IS '課題の説明';
COMMENT ON COLUMN assignments.due_date IS '提出期限';

-- ============================================
-- ユーザー進捗
-- ============================================
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, lesson_id)
);

COMMENT ON TABLE user_progress IS 'ユーザー進捗テーブル';
COMMENT ON COLUMN user_progress.user_id IS 'ユーザーID';
COMMENT ON COLUMN user_progress.course_id IS 'コースID';
COMMENT ON COLUMN user_progress.lesson_id IS 'レッスンID';
COMMENT ON COLUMN user_progress.completed IS '完了フラグ';
COMMENT ON COLUMN user_progress.completed_at IS '完了日時';

-- ============================================
-- 提出物
-- ============================================
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  grade INTEGER CHECK (grade >= 0 AND grade <= 100),
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, assignment_id)
);

COMMENT ON TABLE submissions IS '提出物テーブル';
COMMENT ON COLUMN submissions.user_id IS 'ユーザーID';
COMMENT ON COLUMN submissions.assignment_id IS '課題ID';
COMMENT ON COLUMN submissions.content IS '提出内容（テキスト）';
COMMENT ON COLUMN submissions.file_url IS '添付ファイルURL';
COMMENT ON COLUMN submissions.grade IS '評価（0-100）';
COMMENT ON COLUMN submissions.feedback IS 'フィードバック';

-- ============================================
-- インデックス
-- ============================================
CREATE INDEX idx_courses_theme_id ON courses(theme_id);
CREATE INDEX idx_courses_order_index ON courses(order_index);
CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_lessons_order_index ON lessons(order_index);
CREATE INDEX idx_assignments_lesson_id ON assignments(lesson_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);
CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX idx_user_progress_lesson_id ON user_progress(lesson_id);
CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_assignment_id ON submissions(assignment_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- themes: 全員読み取り可能
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "themes_select" ON themes FOR SELECT USING (true);

-- courses: 全員読み取り可能
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses_select" ON courses FOR SELECT USING (true);

-- lessons: 全員読み取り可能
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_select" ON lessons FOR SELECT USING (true);

-- assignments: 全員読み取り可能
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments_select" ON assignments FOR SELECT USING (true);

-- user_progress: 自分のデータのみアクセス可能
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_progress_select" ON user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_progress_insert" ON user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_progress_update" ON user_progress FOR UPDATE USING (auth.uid() = user_id);

-- submissions: 自分の提出物は全操作可能、他人の提出物は読み取りのみ（評価確認用）
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- サンプルデータ（開発用）
-- ============================================

-- テーマ
INSERT INTO themes (title, description, icon) VALUES
('プログラミング', 'プログラミングスキルを学ぶ', '💻'),
('デザイン', 'UI/UXデザインを学ぶ', '🎨'),
('データサイエンス', 'データ分析と機械学習', '📊');

-- コース
INSERT INTO courses (theme_id, title, description, difficulty, order_index) VALUES
((SELECT id FROM themes WHERE title = 'プログラミング'), 'TypeScript入門', 'TypeScriptの基礎から応用まで', 'beginner', 1),
((SELECT id FROM themes WHERE title = 'プログラミング'), 'React実践', 'Reactを使ったモダンなWeb開発', 'intermediate', 2),
((SELECT id FROM themes WHERE title = 'デザイン'), 'Figmaマスター', 'Figmaを使ったUIデザイン', 'beginner', 1),
((SELECT id FROM themes WHERE title = 'データサイエンス'), 'Pythonで始める機械学習', '機械学習の基礎を学ぶ', 'intermediate', 1);

-- レッスン
INSERT INTO lessons (course_id, title, content, order_index) VALUES
((SELECT id FROM courses WHERE title = 'TypeScript入門'), 'TypeScriptとは', 'TypeScriptはJavaScriptに型システムを追加した言語です...', 1),
((SELECT id FROM courses WHERE title = 'TypeScript入門'), '基本的な型', 'TypeScriptで使用できる基本的な型について学びます...', 2),
((SELECT id FROM courses WHERE title = 'TypeScript入門'), '関数と型', '関数の型定義について詳しく見ていきましょう...', 3);

-- 課題
INSERT INTO assignments (lesson_id, title, description, due_date) VALUES
((SELECT id FROM lessons WHERE title = 'TypeScriptとは'), 'TypeScript環境構築', 'Node.jsとTypeScriptをインストールして、Hello Worldを出力してください', NOW() + INTERVAL '7 days'),
((SELECT id FROM lessons WHERE title = '基本的な型'), '型練習問題', '様々な型を使った変数を定義してください', NOW() + INTERVAL '14 days');
