-- ============================================
-- Learner base models
-- Created: 2026-03-11
-- ============================================

CREATE TABLE IF NOT EXISTS learner_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'ja',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE learner_profile IS 'Persistent learner identity and locale preferences.';
COMMENT ON COLUMN learner_profile.user_id IS 'Authenticated learner user ID.';
COMMENT ON COLUMN learner_profile.display_name IS 'Preferred display name for learner-facing experiences.';
COMMENT ON COLUMN learner_profile.locale IS 'Preferred locale used by the planner and learner UI.';

CREATE TABLE IF NOT EXISTS learner_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_outcome TEXT,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  preferred_pace TEXT CHECK (preferred_pace IN ('relaxed', 'steady', 'intensive')),
  active_track_id TEXT,
  active_task_id TEXT,
  blockers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signals JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE learner_state IS 'Current learner sequencing state and declared constraints.';
COMMENT ON COLUMN learner_state.user_id IS 'Authenticated learner user ID.';
COMMENT ON COLUMN learner_state.target_outcome IS 'Outcome the learner is trying to reach next.';
COMMENT ON COLUMN learner_state.skill_level IS 'Self-reported level used for sequencing decisions.';
COMMENT ON COLUMN learner_state.preferred_pace IS 'Learner pacing preference.';
COMMENT ON COLUMN learner_state.active_track_id IS 'Current curriculum track identifier.';
COMMENT ON COLUMN learner_state.active_task_id IS 'Current mentor workspace task identifier.';
COMMENT ON COLUMN learner_state.blockers IS 'Known blockers that may trigger remediation.';
COMMENT ON COLUMN learner_state.signals IS 'Flexible environment and preference signals for sequencing.';

CREATE TABLE IF NOT EXISTS mentor_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id TEXT,
  task_id TEXT,
  title TEXT NOT NULL,
  bullets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source TEXT NOT NULL DEFAULT 'planner' CHECK (source IN ('planner', 'mentor', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mentor_memory IS 'Short mentor-facing memory entries that preserve learner context.';
COMMENT ON COLUMN mentor_memory.user_id IS 'Authenticated learner user ID.';
COMMENT ON COLUMN mentor_memory.track_id IS 'Optional curriculum track context.';
COMMENT ON COLUMN mentor_memory.task_id IS 'Optional mentor workspace task context.';
COMMENT ON COLUMN mentor_memory.title IS 'Short label for the memory entry.';
COMMENT ON COLUMN mentor_memory.bullets IS 'Structured summary bullets shown to the mentor.';
COMMENT ON COLUMN mentor_memory.source IS 'Origin of the memory entry.';

CREATE INDEX idx_mentor_memory_user_id_created_at
  ON mentor_memory(user_id, created_at DESC);

ALTER TABLE learner_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learner_profile_select" ON learner_profile
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "learner_profile_insert" ON learner_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "learner_profile_update" ON learner_profile
  FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE learner_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learner_state_select" ON learner_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "learner_state_insert" ON learner_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "learner_state_update" ON learner_state
  FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE mentor_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_memory_select" ON mentor_memory
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mentor_memory_insert" ON mentor_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mentor_memory_update" ON mentor_memory
  FOR UPDATE USING (auth.uid() = user_id);
