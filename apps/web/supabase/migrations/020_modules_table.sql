-- ============================================
-- モジュールテーブル追加 + lessons.module_id FK (TQ-80)
-- track内の作業フェーズをDB永続化
-- ============================================

-- ── modules テーブル ──
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  phase TEXT,
  outcome TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE modules IS 'トラック内モジュール（作業フェーズ）定義テーブル';
COMMENT ON COLUMN modules.id IS 'モジュールID（例: scope-the-build）';
COMMENT ON COLUMN modules.track_id IS '所属トラックID（例: web-builder-ai）';
COMMENT ON COLUMN modules.title IS 'モジュールタイトル';
COMMENT ON COLUMN modules.description IS 'モジュール説明';
COMMENT ON COLUMN modules.phase IS 'フェーズラベル（例: Module 1, discover, build）';
COMMENT ON COLUMN modules.outcome IS '到達目標';
COMMENT ON COLUMN modules.sort_order IS '表示順';
COMMENT ON COLUMN modules.status IS 'ステータス（active/draft/archived）';

-- ── インデックス ──
CREATE INDEX idx_modules_track_id ON modules(track_id);
CREATE INDEX idx_modules_sort_order ON modules(sort_order);

-- ── lessons に module_id カラム追加 ──
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES modules(id) ON DELETE SET NULL;

CREATE INDEX idx_lessons_module_id ON lessons(module_id);

COMMENT ON COLUMN lessons.module_id IS '所属モジュールID（FK → modules.id）';

-- ── RLS: modules は全員読み取り可能 ──
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules_select" ON modules FOR SELECT USING (true);

-- ── updated_at 自動更新トリガー ──
CREATE OR REPLACE FUNCTION update_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER modules_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW
  EXECUTE FUNCTION update_modules_updated_at();
