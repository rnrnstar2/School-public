-- ============================================================
-- 022: Certificate sharing support
-- Adds shared_at column for opt-in public sharing of certificates
-- ============================================================

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS shared_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN certificates.shared_at IS 'When the certificate was shared publicly. NULL = private (not shared).';

-- Allow certificate owners to update (set shared_at)
CREATE POLICY "Users can update own certificates"
  ON certificates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
