BEGIN;

WITH ranked_pending AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY metadata ->> 'lesson_dev_proposal_id'
      ORDER BY requested_at ASC, id ASC
    ) AS duplicate_rank
  FROM decision_ledger.approval_gates
  WHERE gate_type = 'lesson_proposal'
    AND status = 'pending'
    AND metadata ? 'lesson_dev_proposal_id'
)
DELETE FROM decision_ledger.approval_gates
WHERE id IN (
  SELECT id
  FROM ranked_pending
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_gates_unique_pending_lesson_proposal
  ON decision_ledger.approval_gates ((metadata ->> 'lesson_dev_proposal_id'))
  WHERE gate_type = 'lesson_proposal'
    AND status = 'pending';

COMMIT;
