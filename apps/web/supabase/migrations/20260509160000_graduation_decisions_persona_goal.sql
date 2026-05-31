-- Migration: graduation_decisions persona × goal extension (TQ-251 / TQ-252)
-- Purpose:
--   `graduation_decisions` was originally created in 027 with
--   plan_id REFERENCES plans_v2(id). Phase 8 (20260409030000) dropped
--   plans_v2 CASCADE — which silently dropped graduation_decisions too.
--   This migration recreates the table referencing the canonical
--   compiled_plans(plan_id), and extends it with persona_slug / goal_slug
--   / decision (jsonb) so the dynamic graduation gate (TQ-240 / TQ-251)
--   can persist the learner's chosen gate alongside the evidence-based
--   competency_summary that /api/planner/graduation already computes.
--
-- Schema:
--   id              uuid PK
--   user_id         uuid FK auth.users (own-row RLS)
--   plan_id         uuid FK compiled_plans(plan_id) NULLABLE — gate may be
--                   chosen before any plan is persisted
--   goal_id         uuid FK goals(id) NULLABLE — same reason
--   persona_slug    text NULLABLE — e.g. "persona.web-builder"
--   goal_slug       text NULLABLE — domain hint (web/automation/content/app)
--   decision        jsonb DEFAULT '{}' — {kind, label, artifactValue, explanation?}
--   status          text DEFAULT 'gate_selected' — gate_selected|graduated|not_ready
--   competency_summary jsonb DEFAULT '{}' — written by /api/planner/graduation
--   certificate_id  uuid NULLABLE
--   decided_at      timestamptz DEFAULT now() — back-compat with old column
--   created_at      timestamptz DEFAULT now()
--   updated_at      timestamptz DEFAULT now()
--
-- RLS: own-row only (select / insert / update / delete by auth.uid()).
--
-- W50 (HI-2): the original draft of this file opened with
--   `DROP TABLE IF EXISTS graduation_decisions CASCADE;`
-- which would have wiped any production rows the moment a remote apply
-- ran. We rewrote it to be idempotent + non-destructive: we only CREATE
-- the table when missing, otherwise additive `ALTER TABLE ... ADD COLUMN
-- IF NOT EXISTS` patches bring an older shape (027 / 027-CASCADE) up to
-- the current schema without touching existing rows. RLS / index /
-- trigger / policy creation is gated on `IF NOT EXISTS` (or DO blocks)
-- so re-applying the migration on a DB where W41 already landed is a
-- safe no-op.

BEGIN;

-- Idempotent create: if the table already exists (e.g. remote already
-- has W41 applied, or 027 created it), keep all rows and only patch the
-- shape via ALTER TABLE below. No DROP / CASCADE.
CREATE TABLE IF NOT EXISTS graduation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES compiled_plans(plan_id) ON DELETE SET NULL,
  goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  persona_slug text,
  goal_slug text,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'gate_selected'
    CHECK (status IN ('gate_selected', 'graduated', 'not_ready')),
  competency_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  certificate_id uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Additive ALTER patches for older 027-era shape. Each is independently
-- idempotent so re-running this migration after a partial apply is safe.
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS persona_slug text;
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS goal_slug text;
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS decision jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS competency_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS certificate_id uuid;
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS decided_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE graduation_decisions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure the status CHECK constraint exists (027-era shape may have it
-- under a different name). We use a DO block so re-running is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'graduation_decisions'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'graduation_decisions_status_check'
  ) THEN
    ALTER TABLE graduation_decisions
      ADD CONSTRAINT graduation_decisions_status_check
      CHECK (status IN ('gate_selected', 'graduated', 'not_ready'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- already present under a different bookkeeping path; safe to ignore
  NULL;
END $$;

COMMENT ON TABLE graduation_decisions IS
  'Learner-chosen graduation gate (TQ-240 dynamic gate) + evidence-based graduation outcome (TQ-251/252)';
COMMENT ON COLUMN graduation_decisions.persona_slug IS
  'persona.<slug> — used to look up dynamic graduation_options';
COMMENT ON COLUMN graduation_decisions.goal_slug IS
  'goal domain hint (web/automation/content/app) for future persona×goal matrix';
COMMENT ON COLUMN graduation_decisions.decision IS
  'jsonb of { kind, label, artifactValue, explanation? } as submitted by GraduationGateSelect';

CREATE INDEX IF NOT EXISTS idx_graduation_decisions_user
  ON graduation_decisions (user_id);
CREATE INDEX IF NOT EXISTS idx_graduation_decisions_user_plan
  ON graduation_decisions (user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_graduation_decisions_user_goal
  ON graduation_decisions (user_id, goal_id);

ALTER TABLE graduation_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS graduation_decisions_owner_select ON graduation_decisions;
CREATE POLICY graduation_decisions_owner_select ON graduation_decisions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS graduation_decisions_owner_insert ON graduation_decisions;
CREATE POLICY graduation_decisions_owner_insert ON graduation_decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS graduation_decisions_owner_update ON graduation_decisions;
CREATE POLICY graduation_decisions_owner_update ON graduation_decisions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS graduation_decisions_owner_delete ON graduation_decisions;
CREATE POLICY graduation_decisions_owner_delete ON graduation_decisions
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_graduation_decisions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_graduation_decisions_updated_at ON graduation_decisions;
CREATE TRIGGER trg_graduation_decisions_updated_at
  BEFORE UPDATE ON graduation_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_graduation_decisions_updated_at();

COMMIT;
