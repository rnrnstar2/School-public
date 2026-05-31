-- ============================================
-- Artifacts API compatibility columns
-- Created: 2026-03-12
-- ============================================

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS task_id TEXT GENERATED ALWAYS AS (step_id) STORED,
  ADD COLUMN IF NOT EXISTS type TEXT GENERATED ALWAYS AS (artifact_type) STORED,
  ADD COLUMN IF NOT EXISTS body TEXT GENERATED ALWAYS AS (content) STORED;

COMMENT ON COLUMN artifacts.task_id IS 'API compatibility alias for step_id.';
COMMENT ON COLUMN artifacts.type IS 'API compatibility alias for artifact_type.';
COMMENT ON COLUMN artifacts.body IS 'API compatibility alias for content.';
