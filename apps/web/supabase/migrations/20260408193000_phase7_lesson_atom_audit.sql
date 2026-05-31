BEGIN;

CREATE TABLE IF NOT EXISTS lesson_atom_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  atom_id text NOT NULL REFERENCES lesson_atoms(atom_id) ON DELETE CASCADE,
  version_id uuid REFERENCES lesson_atom_versions(version_id) ON DELETE SET NULL,
  before_state jsonb,
  after_state jsonb
);

CREATE INDEX IF NOT EXISTS idx_lesson_atom_audit_atom_occurred
  ON lesson_atom_audit (atom_id, occurred_at DESC);

ALTER TABLE lesson_atom_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_audit'
      AND policyname = 'lesson_atom_audit_admin_select'
  ) THEN
    CREATE POLICY lesson_atom_audit_admin_select
      ON lesson_atom_audit
      FOR SELECT
      TO authenticated
      USING (
        COALESCE(
          NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', ''),
          NULLIF(auth.jwt() -> 'user_metadata' ->> 'role', '')
        ) = 'admin'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_audit'
      AND policyname = 'lesson_atom_audit_service_insert'
  ) THEN
    CREATE POLICY lesson_atom_audit_service_insert
      ON lesson_atom_audit
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END
$$;

COMMIT;
