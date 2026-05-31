-- ============================================
-- Add time tracking columns to task_progress
-- started_at: when the learner began working on the task
-- completed_at: when the task was marked completed
-- elapsed_minutes: computed actual duration in minutes
-- ============================================

ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS elapsed_minutes INTEGER;

COMMENT ON COLUMN task_progress.started_at IS 'Timestamp when the task was first moved to in-progress.';
COMMENT ON COLUMN task_progress.completed_at IS 'Timestamp when the task was marked completed.';
COMMENT ON COLUMN task_progress.elapsed_minutes IS 'Actual elapsed minutes from started_at to completed_at.';
