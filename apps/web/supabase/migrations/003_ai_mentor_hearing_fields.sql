-- ============================================
-- AI mentor hearing fields
-- Created: 2026-03-11
-- ============================================

ALTER TABLE learner_profile
  ADD COLUMN IF NOT EXISTS experience_summary TEXT,
  ADD COLUMN IF NOT EXISTS operating_system TEXT,
  ADD COLUMN IF NOT EXISTS cli_familiarity TEXT,
  ADD COLUMN IF NOT EXISTS available_ai_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS can_use_local_tools BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'learner_profile_cli_familiarity_check'
  ) THEN
    ALTER TABLE learner_profile
      ADD CONSTRAINT learner_profile_cli_familiarity_check
      CHECK (cli_familiarity IS NULL OR cli_familiarity IN ('none', 'basic', 'comfortable'));
  END IF;
END $$;

COMMENT ON COLUMN learner_profile.experience_summary IS 'Freeform summary of the learner experience level gathered during hearing.';
COMMENT ON COLUMN learner_profile.operating_system IS 'Primary operating system used for the current track.';
COMMENT ON COLUMN learner_profile.cli_familiarity IS 'Comfort level with terminal or CLI workflows.';
COMMENT ON COLUMN learner_profile.available_ai_tools IS 'AI tools currently available to the learner.';
COMMENT ON COLUMN learner_profile.can_use_local_tools IS 'Whether the learner can work locally on their own machine.';

ALTER TABLE learner_state
  ADD COLUMN IF NOT EXISTS deadline_text TEXT,
  ADD COLUMN IF NOT EXISTS weekly_time_budget TEXT,
  ADD COLUMN IF NOT EXISTS existing_materials TEXT;

COMMENT ON COLUMN learner_state.deadline_text IS 'Learner-stated delivery target or deadline.';
COMMENT ON COLUMN learner_state.weekly_time_budget IS 'Freeform summary of available time per week.';
COMMENT ON COLUMN learner_state.existing_materials IS 'Existing copy, assets, references, or drafts that can be reused.';
