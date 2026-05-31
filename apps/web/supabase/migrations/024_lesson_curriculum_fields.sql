-- ============================================
-- TQ-92: レッスンカリキュラムスキーマ統合
-- track_id, difficulty_level, tags, prerequisite_ids,
-- 4要素構造 (why_this_matters, how_to_do, common_blockers, confirmation_method)
-- ============================================

-- ── track_id: トラック紐付け ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS track_id TEXT;

COMMENT ON COLUMN lessons.track_id IS '所属トラックID（例: web-builder-ai）';
CREATE INDEX IF NOT EXISTS idx_lessons_track_id ON lessons(track_id);

-- ── difficulty_level: 難易度 ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS difficulty_level TEXT
  DEFAULT 'beginner'
  CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));

COMMENT ON COLUMN lessons.difficulty_level IS '難易度 (beginner/intermediate/advanced)';

-- ── tags: タグ配列 ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN lessons.tags IS 'タグ配列（検索・フィルタ用）';
CREATE INDEX IF NOT EXISTS idx_lessons_tags ON lessons USING GIN (tags);

-- ── prerequisite_ids: 前提レッスンID配列 ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS prerequisite_ids TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN lessons.prerequisite_ids IS '前提レッスンID配列';

-- ── 4要素構造フィールド ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS why_this_matters TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS how_to_do TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS common_blockers TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS confirmation_method TEXT;

COMMENT ON COLUMN lessons.why_this_matters IS 'なぜ重要か（4要素構造: WHY）';
COMMENT ON COLUMN lessons.how_to_do IS 'やり方（4要素構造: HOW）';
COMMENT ON COLUMN lessons.common_blockers IS 'よくあるつまずき（4要素構造: BLOCKERS）';
COMMENT ON COLUMN lessons.confirmation_method IS '確認方法（4要素構造: CONFIRM）';
