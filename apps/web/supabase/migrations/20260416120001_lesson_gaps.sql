BEGIN;

CREATE TABLE IF NOT EXISTS decision_ledger.lesson_gaps (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id          text NOT NULL,
  goal_id            uuid REFERENCES decision_ledger.goals(id) ON DELETE CASCADE,
  weakest_axis       text NOT NULL
                       CHECK (weakest_axis IN ('capability', 'prerequisite', 'blocker', 'evidence')),
  score              numeric(4,3) NOT NULL CHECK (score BETWEEN 0 AND 1),
  capability_score   numeric(4,3),
  prerequisite_score numeric(4,3),
  blocker_score      numeric(4,3),
  evidence_score     numeric(4,3),
  evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_mappings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'proposed', 'addressed', 'dismissed')),
  detected_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE NULLS NOT DISTINCT (action_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_gaps_status
  ON decision_ledger.lesson_gaps (status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_gaps_goal
  ON decision_ledger.lesson_gaps (goal_id, status);

ALTER TABLE decision_ledger.lesson_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON decision_ledger.lesson_gaps;
CREATE POLICY service_role_all ON decision_ledger.lesson_gaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON decision_ledger.lesson_gaps TO service_role;

COMMIT;
