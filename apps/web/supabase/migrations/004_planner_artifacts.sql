-- ============================================
-- Planner artifacts and checkpoints
-- Created: 2026-03-12
-- ============================================

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planner_goal TEXT,
  track_id TEXT,
  milestone_id TEXT NOT NULL,
  milestone_title TEXT,
  step_id TEXT NOT NULL,
  step_title TEXT,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('url', 'text', 'note')),
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE artifacts IS 'Learner-saved artifacts and checkpoint notes for planner milestones and steps.';
COMMENT ON COLUMN artifacts.user_id IS 'Authenticated learner user ID.';
COMMENT ON COLUMN artifacts.planner_goal IS 'Goal text used when the artifact was recorded.';
COMMENT ON COLUMN artifacts.track_id IS 'Optional curriculum track identifier.';
COMMENT ON COLUMN artifacts.milestone_id IS 'Planner milestone identifier.';
COMMENT ON COLUMN artifacts.milestone_title IS 'Display title of the milestone at save time.';
COMMENT ON COLUMN artifacts.step_id IS 'Planner step identifier.';
COMMENT ON COLUMN artifacts.step_title IS 'Display title of the step at save time.';
COMMENT ON COLUMN artifacts.artifact_type IS 'Artifact kind: url, text, or note.';
COMMENT ON COLUMN artifacts.title IS 'Optional short label for the artifact.';
COMMENT ON COLUMN artifacts.content IS 'Artifact body or URL.';

CREATE INDEX IF NOT EXISTS idx_artifacts_user_id_created_at
  ON artifacts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_user_id_milestone_step
  ON artifacts(user_id, milestone_id, step_id, created_at DESC);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'artifacts' AND policyname = 'artifacts_select'
  ) THEN
    CREATE POLICY "artifacts_select" ON artifacts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'artifacts' AND policyname = 'artifacts_insert'
  ) THEN
    CREATE POLICY "artifacts_insert" ON artifacts
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'artifacts' AND policyname = 'artifacts_update'
  ) THEN
    CREATE POLICY "artifacts_update" ON artifacts
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
