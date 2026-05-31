ALTER TABLE decision_ledger.goal_contexts
  DROP CONSTRAINT IF EXISTS goal_contexts_source_type_check;

ALTER TABLE decision_ledger.goal_contexts
  ADD CONSTRAINT goal_contexts_source_type_check
  CHECK (
    source_type IN (
      'doc',
      'telemetry',
      'meeting_note',
      'issue',
      'eval_result',
      'ai_delegation_brief',
      'other'
    )
  );
