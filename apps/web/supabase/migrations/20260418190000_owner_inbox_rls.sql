BEGIN;

GRANT USAGE ON SCHEMA decision_ledger TO authenticated;

DROP POLICY IF EXISTS owner_select_approval_gates
  ON decision_ledger.approval_gates;
CREATE POLICY owner_select_approval_gates
  ON decision_ledger.approval_gates
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

DROP POLICY IF EXISTS owner_select_lesson_dev_proposals
  ON decision_ledger.lesson_dev_proposals;
CREATE POLICY owner_select_lesson_dev_proposals
  ON decision_ledger.lesson_dev_proposals
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

DROP POLICY IF EXISTS owner_select_lesson_gaps
  ON decision_ledger.lesson_gaps;
CREATE POLICY owner_select_lesson_gaps
  ON decision_ledger.lesson_gaps
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

CREATE OR REPLACE VIEW decision_ledger.v_owner_pending_lesson_proposals
WITH (security_invoker = on) AS
SELECT
  g.id AS gate_id,
  g.requested_at,
  g.status AS gate_status,
  g.metadata AS gate_metadata,
  p.id AS proposal_id,
  p.capability_slug,
  p.outcome_slug,
  p.priority,
  p.weakest_axis,
  p.rationale,
  p.candidate_lesson_slug,
  p.gap_ids,
  p.status AS proposal_status,
  p.owner_approval
FROM decision_ledger.approval_gates g
LEFT JOIN decision_ledger.lesson_dev_proposals p
  ON p.id::text = g.metadata ->> 'lesson_dev_proposal_id'
WHERE g.gate_type = 'lesson_proposal'
  AND g.status = 'pending';

GRANT SELECT ON decision_ledger.approval_gates TO authenticated;
GRANT SELECT ON decision_ledger.lesson_dev_proposals TO authenticated;
GRANT SELECT ON decision_ledger.lesson_gaps TO authenticated;
GRANT SELECT ON decision_ledger.v_owner_pending_lesson_proposals TO authenticated;

COMMIT;
