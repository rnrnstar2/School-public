-- mentor_memory_archive: 圧縮前の原本を保持するアーカイブテーブル
CREATE TABLE IF NOT EXISTS mentor_memory_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id TEXT,
  task_id TEXT,
  title TEXT NOT NULL,
  bullets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source TEXT NOT NULL DEFAULT 'planner' CHECK (source IN ('planner', 'mentor', 'system')),
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  compaction_id UUID
);

CREATE INDEX IF NOT EXISTS idx_mentor_memory_archive_user
  ON mentor_memory_archive (user_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_mentor_memory_archive_compaction
  ON mentor_memory_archive (compaction_id);

ALTER TABLE mentor_memory_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY mentor_memory_archive_select
  ON mentor_memory_archive FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY mentor_memory_archive_insert
  ON mentor_memory_archive FOR INSERT
  WITH CHECK (auth.uid() = user_id);
