-- Migration: learner_api_keys (TQ-226)
-- Purpose: Store Bring-Your-Own-Key (BYOK) provider API keys per learner so the
--          Conductor / sub-agent fan-out (TQ-227+) can authenticate against the
--          learner's own Anthropic / OpenAI / Gemini / ZAI account.
--
-- Encryption strategy:
--   The application layer encrypts each provider key with AES-256-GCM using
--   the BYOK_ENCRYPTION_KEY env (32 bytes / base64) BEFORE inserting. The DB
--   only sees ciphertext+iv+authTag bundled as a single base64 string in
--   `encrypted_key`. This keeps the migration portable across local supabase
--   resets and remote projects without requiring pgsodium / vault setup
--   (which can vary between Supabase project tiers). See
--   apps/web/src/lib/byok/api-keys.ts for the encryption / decryption helper.
--
-- RLS: own-row only — select / insert / update / delete restricted to
--      auth.uid() = user_id. No public read.

CREATE TABLE IF NOT EXISTS learner_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'zai')),
  encrypted_key TEXT NOT NULL,
  -- key_hint stores the masked hint (e.g. "sk-ant-...****abcd") so the UI can
  -- render "設定済み" with a partial fingerprint without ever decrypting the
  -- ciphertext on read. Generated client-side at upsert time.
  key_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

COMMENT ON TABLE learner_api_keys IS 'BYOK: 学習者ごとの provider API key (AES-256-GCM 暗号化済み)';
COMMENT ON COLUMN learner_api_keys.provider IS 'anthropic / openai / gemini / zai のいずれか';
COMMENT ON COLUMN learner_api_keys.encrypted_key IS 'アプリ層で AES-256-GCM 暗号化したペイロード (base64: iv|tag|ciphertext)';
COMMENT ON COLUMN learner_api_keys.key_hint IS '画面表示用のマスク済みヒント（例: sk-ant-...****abcd）';

CREATE INDEX IF NOT EXISTS idx_learner_api_keys_user
  ON learner_api_keys (user_id);

ALTER TABLE learner_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY learner_api_keys_select ON learner_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY learner_api_keys_insert ON learner_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY learner_api_keys_update ON learner_api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY learner_api_keys_delete ON learner_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_learner_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learner_api_keys_updated_at ON learner_api_keys;
CREATE TRIGGER trg_learner_api_keys_updated_at
  BEFORE UPDATE ON learner_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_learner_api_keys_updated_at();
