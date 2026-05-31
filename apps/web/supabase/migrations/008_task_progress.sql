-- ============================================
-- Task progress persistence for planner tasks
-- 作成日: 2026-03-15
-- ============================================

CREATE TABLE IF NOT EXISTS task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not-started'
    CHECK (status IN ('not-started', 'in-progress', 'completed', 'on-hold', 'blocked', 'skipped')),
  do_text TEXT,
  learn_text TEXT,
  why_text TEXT,
  relevant_lesson_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, task_id)
);

COMMENT ON TABLE task_progress IS 'Per-task progress within a learning plan.';
COMMENT ON COLUMN task_progress.task_id IS 'Matches PlannerContinuationStep.id from the planner.';
COMMENT ON COLUMN task_progress.status IS 'One of: not-started, in-progress, completed, on-hold, blocked, skipped.';
COMMENT ON COLUMN task_progress.do_text IS 'User-facing Do description snapshot.';
COMMENT ON COLUMN task_progress.learn_text IS 'User-facing Learn description snapshot.';
COMMENT ON COLUMN task_progress.why_text IS 'User-facing Why description snapshot.';
COMMENT ON COLUMN task_progress.relevant_lesson_ids IS 'Lesson IDs relevant to this task step.';

CREATE INDEX IF NOT EXISTS idx_task_progress_plan_id ON task_progress(plan_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_plan_task ON task_progress(plan_id, task_id);

ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_progress_select" ON task_progress;
CREATE POLICY "task_progress_select"
  ON task_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = task_progress.plan_id
        AND (plans.user_id IS NULL OR plans.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_progress_insert" ON task_progress;
CREATE POLICY "task_progress_insert"
  ON task_progress
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = task_progress.plan_id
        AND plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task_progress_update" ON task_progress;
CREATE POLICY "task_progress_update"
  ON task_progress
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = task_progress.plan_id
        AND plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task_progress_delete" ON task_progress;
CREATE POLICY "task_progress_delete"
  ON task_progress
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = task_progress.plan_id
        AND plans.user_id = auth.uid()
    )
  );
