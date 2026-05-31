BEGIN;

DROP FUNCTION IF EXISTS decision_ledger.decide_lesson_proposal(uuid, text, text);

CREATE OR REPLACE FUNCTION decision_ledger.decide_lesson_proposal(
  p_gate_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS decision_ledger.approval_gates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = decision_ledger, public
AS $$
DECLARE
  v_gate decision_ledger.approval_gates;
  v_proposal_id uuid;
BEGIN
  IF auth.jwt() -> 'app_metadata' ->> 'role' IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'forbidden: owner role required';
  END IF;

  IF p_decision IS DISTINCT FROM 'approved'
     AND p_decision IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'invalid decision: %', p_decision;
  END IF;

  UPDATE decision_ledger.approval_gates
     SET status = p_decision,
         decided_by = auth.jwt() ->> 'email',
         decided_at = now(),
         reason = p_reason
   WHERE id = p_gate_id
     AND gate_type = 'lesson_proposal'
     AND status = 'pending'
  RETURNING *
       INTO v_gate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate not found or not pending (id=%)', p_gate_id;
  END IF;

  v_proposal_id := nullif(v_gate.metadata ->> 'lesson_dev_proposal_id', '')::uuid;

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'linked lesson proposal not found';
  END IF;

  UPDATE decision_ledger.lesson_dev_proposals
     SET owner_approval = p_decision::decision_ledger.owner_approval_state,
         owner_reviewed_by = auth.jwt() ->> 'email',
         owner_reviewed_at = now(),
         owner_review_reason = p_reason,
         status = p_decision,
         updated_at = now()
   WHERE id = v_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'linked lesson proposal not found';
  END IF;

  RETURN v_gate;
END;
$$;

REVOKE ALL ON FUNCTION decision_ledger.decide_lesson_proposal(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision_ledger.decide_lesson_proposal(uuid, text, text) TO authenticated;

COMMIT;
