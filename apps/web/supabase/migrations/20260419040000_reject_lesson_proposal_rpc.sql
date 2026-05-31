BEGIN;

DROP FUNCTION IF EXISTS decision_ledger.reject_lesson_proposal(uuid, text);

CREATE OR REPLACE FUNCTION decision_ledger.reject_lesson_proposal(
  p_gate_id uuid,
  p_reason text
)
RETURNS decision_ledger.approval_gates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = decision_ledger, public
AS $$
DECLARE
  v_gate decision_ledger.approval_gates;
  v_proposal_id uuid;
  v_gap_ids uuid[];
  v_reason text;
  v_expected_gap_count integer := 0;
  v_updated_gap_count integer := 0;
BEGIN
  IF auth.jwt() -> 'app_metadata' ->> 'role' IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'forbidden: owner role required';
  END IF;

  v_reason := nullif(btrim(p_reason), '');

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'rejection reason required';
  END IF;

  UPDATE decision_ledger.approval_gates
     SET status = 'rejected',
         decided_by = auth.jwt() ->> 'email',
         decided_at = now(),
         reason = v_reason
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
     SET owner_approval = 'rejected'::decision_ledger.owner_approval_state,
         owner_reviewed_by = auth.jwt() ->> 'email',
         owner_reviewed_at = now(),
         owner_review_reason = v_reason,
         status = 'rejected',
         updated_at = now()
   WHERE id = v_proposal_id
     AND owner_approval = 'pending_owner_review'
     AND status = 'proposed'
  RETURNING gap_ids
       INTO v_gap_ids;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'linked lesson proposal not found or not pending';
  END IF;

  SELECT COUNT(DISTINCT gap_id)
    INTO v_expected_gap_count
    FROM unnest(COALESCE(v_gap_ids, ARRAY[]::uuid[])) AS gap_id;

  IF v_expected_gap_count > 0 THEN
    UPDATE decision_ledger.lesson_gaps
       SET status = 'dismissed',
           updated_at = now()
     WHERE id = ANY(v_gap_ids);

    GET DIAGNOSTICS v_updated_gap_count = ROW_COUNT;

    IF v_updated_gap_count <> v_expected_gap_count THEN
      RAISE EXCEPTION 'linked lesson gaps not found (proposal_id=%)', v_proposal_id;
    END IF;
  END IF;

  RETURN v_gate;
END;
$$;

REVOKE ALL ON FUNCTION decision_ledger.reject_lesson_proposal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision_ledger.reject_lesson_proposal(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
