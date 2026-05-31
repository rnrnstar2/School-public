-- TQ-11: Lesson feedback table
-- Stores learner feedback on lesson difficulty and content
CREATE TABLE IF NOT EXISTS lesson_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  difficulty_rating INT NOT NULL CHECK (difficulty_rating BETWEEN 1 AND 5),
  clarity_rating INT NOT NULL CHECK (clarity_rating BETWEEN 1 AND 5),
  comment TEXT,
  adjustment_proposal JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

-- RLS policies
ALTER TABLE lesson_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON lesson_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON lesson_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON lesson_feedback FOR UPDATE
  USING (auth.uid() = user_id);
