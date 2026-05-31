CREATE TABLE IF NOT EXISTS mentor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  goal TEXT NOT NULL,
  canonical_goal_key TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  history_summary TEXT,
  phase TEXT NOT NULL DEFAULT 'discovering',
  hearing_answers JSONB NOT NULL DEFAULT '{}'::JSONB,
  hearing_insights JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary_key_points TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  persona_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active_plan_id TEXT,
  current_lesson_id TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, canonical_goal_key)
);

CREATE INDEX IF NOT EXISTS idx_mentor_sessions_user_updated
  ON mentor_sessions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mentor_sessions_user_goal_key
  ON mentor_sessions (user_id, canonical_goal_key);

ALTER TABLE mentor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mentor_sessions_select ON mentor_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY mentor_sessions_insert ON mentor_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY mentor_sessions_update ON mentor_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY mentor_sessions_delete ON mentor_sessions
  FOR DELETE USING (auth.uid() = user_id);

DROP TABLE IF EXISTS hearing_chat_messages;
