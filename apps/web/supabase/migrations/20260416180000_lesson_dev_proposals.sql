BEGIN;

CREATE TABLE IF NOT EXISTS decision_ledger.lesson_dev_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_slug  text NOT NULL,
  outcome_slug     text NOT NULL DEFAULT 'general',
  priority         text NOT NULL DEFAULT 'mid'
                     CHECK (priority IN ('high','mid','low')),
  status           text NOT NULL DEFAULT 'proposed'
                     CHECK (status IN ('proposed','approved','rejected','in_factory','addressed','cancelled')),
  gap_ids          uuid[] NOT NULL DEFAULT '{}',
  weakest_axis     text NOT NULL
                     CHECK (weakest_axis IN ('capability','prerequisite','blocker','evidence')),
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_lesson_slug text,
  rationale        text,
  proposed_by      text NOT NULL DEFAULT 'ai',
  proposed_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE NULLS NOT DISTINCT (capability_slug, outcome_slug)
);

CREATE INDEX IF NOT EXISTS idx_lesson_dev_proposals_status
  ON decision_ledger.lesson_dev_proposals (status, priority, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_dev_proposals_capability
  ON decision_ledger.lesson_dev_proposals (capability_slug);

ALTER TABLE decision_ledger.lesson_dev_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON decision_ledger.lesson_dev_proposals;
CREATE POLICY service_role_all ON decision_ledger.lesson_dev_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON decision_ledger.lesson_dev_proposals TO service_role;

COMMIT;
