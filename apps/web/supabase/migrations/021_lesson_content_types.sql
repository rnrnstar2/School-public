-- ============================================
-- TQ-81: レッスン content_types 配列列追加
-- コンテンツタイプ: concept / comparison / installation / troubleshoot / selection-guide
-- ============================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS content_types TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN lessons.content_types IS
  'コンテンツタイプ配列 (concept, comparison, installation, troubleshoot, selection-guide)';

-- 検索・フィルタ用 GIN インデックス
CREATE INDEX IF NOT EXISTS idx_lessons_content_types
  ON lessons USING GIN (content_types);
