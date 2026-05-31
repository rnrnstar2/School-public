-- ============================================
-- Plan versioning: version + parent_plan_id
-- TQ-64: プラン改訂履歴+バージョン管理
-- ============================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN plans.version IS 'Revision number starting from 1.';
COMMENT ON COLUMN plans.parent_plan_id IS 'Points to the previous version of this plan (revision chain).';

CREATE INDEX IF NOT EXISTS idx_plans_parent_plan_id ON plans(parent_plan_id);
CREATE INDEX IF NOT EXISTS idx_plans_user_version ON plans(user_id, version);
