-- ============================================
-- Milestone progress tracking
-- Created: 2026-03-15
-- ============================================

CREATE TABLE IF NOT EXISTS milestone_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL,
  milestone_title TEXT,
  status TEXT NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'completed')),
  evidence_rule TEXT,
  verified_at TIMESTAMPTZ,
  verification_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_id, milestone_id)
);

COMMENT ON TABLE milestone_progress IS 'Tracks milestone completion status per learner and plan.';
COMMENT ON COLUMN milestone_progress.milestone_id IS 'Planner milestone identifier (matches continuation plan milestone ID).';
COMMENT ON COLUMN milestone_progress.status IS 'Current milestone status: in-progress or completed.';
COMMENT ON COLUMN milestone_progress.evidence_rule IS 'Evidence rule used for verification at completion time.';
COMMENT ON COLUMN milestone_progress.verified_at IS 'Timestamp when AI verified milestone completion.';
COMMENT ON COLUMN milestone_progress.verification_summary IS 'AI-generated summary of why milestone is considered complete.';

CREATE INDEX IF NOT EXISTS idx_milestone_progress_user_plan
  ON milestone_progress(user_id, plan_id);

ALTER TABLE milestone_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'milestone_progress' AND policyname = 'milestone_progress_select'
  ) THEN
    CREATE POLICY "milestone_progress_select" ON milestone_progress
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'milestone_progress' AND policyname = 'milestone_progress_insert'
  ) THEN
    CREATE POLICY "milestone_progress_insert" ON milestone_progress
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'milestone_progress' AND policyname = 'milestone_progress_update'
  ) THEN
    CREATE POLICY "milestone_progress_update" ON milestone_progress
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
