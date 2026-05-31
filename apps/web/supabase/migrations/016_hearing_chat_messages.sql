-- TQ-65: hearing_chat_messages — ヒアリング会話履歴永続化
CREATE TABLE IF NOT EXISTS hearing_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  summary_key_points TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, goal)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hearing_chat_messages_user_goal
  ON hearing_chat_messages (user_id, goal);
CREATE INDEX IF NOT EXISTS idx_hearing_chat_messages_user_updated
  ON hearing_chat_messages (user_id, updated_at DESC);

-- RLS
ALTER TABLE hearing_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY hearing_chat_messages_select ON hearing_chat_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY hearing_chat_messages_insert ON hearing_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY hearing_chat_messages_update ON hearing_chat_messages
  FOR UPDATE USING (auth.uid() = user_id);
