ALTER TABLE decision_ledger.lesson_dev_proposals
  DROP CONSTRAINT IF EXISTS lesson_dev_proposals_status_check;

ALTER TABLE decision_ledger.lesson_dev_proposals
  ADD CONSTRAINT lesson_dev_proposals_status_check
  CHECK (status IN (
    'proposed',
    'approved',
    'reserved',
    'rejected',
    'blocked',
    'in_factory',
    'addressed',
    'cancelled'
  ));
