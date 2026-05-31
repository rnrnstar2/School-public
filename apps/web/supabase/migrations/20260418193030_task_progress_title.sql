-- ============================================
-- Persist inline-edited task titles in task_progress
-- ============================================

ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN task_progress.title IS 'User-edited task title snapshot.';
