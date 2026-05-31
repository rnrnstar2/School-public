BEGIN;

ALTER TABLE decision_ledger.approval_gates
  DROP CONSTRAINT IF EXISTS approval_gates_gate_type_check;

ALTER TABLE decision_ledger.approval_gates
  ADD CONSTRAINT approval_gates_gate_type_check
  CHECK (
    gate_type IN (
      'deploy',
      'migration',
      'schedule_confirm',
      'budget',
      'general',
      'lesson_proposal'
    )
  );

CREATE INDEX IF NOT EXISTS idx_approval_gates_lesson_proposal_id
  ON decision_ledger.approval_gates ((metadata ->> 'lesson_dev_proposal_id'))
  WHERE gate_type = 'lesson_proposal';

COMMIT;
