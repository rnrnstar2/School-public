-- Migration: BYOK add 'xai' provider (Wave 16 — adaptive multi-model routing)
--
-- Purpose: Extend the `learner_api_keys.provider` CHECK constraint to allow
--          'xai' (xAI / Grok) so learners can BYOK an X-platform key for the
--          new `trend_scout` role and any role where social-trend / realtime
--          X data improves quality. Owner directive (2026-05-09):
--            > 「Gemini は検索系とか強いし X は最新のトレンドとか強いしね」
--
-- Strategy: DROP + ADD the CHECK constraint atomically. CHECK constraints in
-- PostgreSQL do not support `ADD VALUE` like ENUM types — we have to drop
-- and recreate. Wrap in a DO block to make it idempotent (no-op on repeat).
--
-- Rollback (manual, NOT auto-applied):
--   ALTER TABLE learner_api_keys
--     DROP CONSTRAINT IF EXISTS learner_api_keys_provider_check;
--   ALTER TABLE learner_api_keys
--     ADD CONSTRAINT learner_api_keys_provider_check
--     CHECK (provider IN ('anthropic', 'openai', 'gemini', 'zai'));
--   -- Note: any rows with provider='xai' must be deleted before rollback,
--   -- otherwise the new CHECK fails.
--
-- Refs:
--   - W16 brief: adaptive multi-model routing + xai provider
--   - prior migration: 20260509000744_learner_api_keys.sql
--   - app code: apps/web/src/lib/byok/api-keys.ts (BYOK_PROVIDERS)
--               apps/web/src/lib/mentor/router.ts (Provider type)

DO $$
BEGIN
  -- Drop the existing CHECK if present (named or anonymous).
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'learner_api_keys_provider_check'
       AND conrelid = 'learner_api_keys'::regclass
  ) THEN
    ALTER TABLE learner_api_keys
      DROP CONSTRAINT learner_api_keys_provider_check;
  END IF;
END $$;

-- Re-add with the expanded provider whitelist.
ALTER TABLE learner_api_keys
  ADD CONSTRAINT learner_api_keys_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'gemini', 'zai', 'xai'));

COMMENT ON COLUMN learner_api_keys.provider IS
  'anthropic / openai / gemini / zai / xai のいずれか (W16 で xai 追加)';
