-- TQ-31: lesson_chat_messages — チャット履歴永続化+会話要約
CREATE TABLE IF NOT EXISTS lesson_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  summary_key_points TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_chat_messages_user_lesson
  ON lesson_chat_messages (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_chat_messages_user_updated
  ON lesson_chat_messages (user_id, updated_at DESC);

-- RLS
ALTER TABLE lesson_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_chat_messages_select ON lesson_chat_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY lesson_chat_messages_insert ON lesson_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY lesson_chat_messages_update ON lesson_chat_messages
  FOR UPDATE USING (auth.uid() = user_id);
