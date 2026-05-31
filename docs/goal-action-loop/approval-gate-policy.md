# Approval Gate Policy

This policy governs how `@school/flywheel-scheduler` assigns
`decision_ledger.lesson_dev_proposals.owner_approval`.

## Default rule

- Default to `pending_owner_review`.
- Only one class is allowed to bypass owner review: a micro patch on an existing lesson.
- Anything that would publish directly or mutate data destructively is blocked.

## Auto

- `micro_patch_existing_lesson`
- Scope: copy fixes, rubric tweaks, typo fixes, or narrow lesson-body edits that stay inside an existing lesson artifact.
- Result: `owner_approval = 'auto'`, proposal status becomes `approved`, and the AI PR worker may be triggered immediately.

## Owner Review

- `copy_refresh_existing_lesson`
- `new_lesson_scaffold`
- `lesson_rewrite`
- `curriculum_resequence`
- `cross_track_refactor`
- Result: `owner_approval = 'pending_owner_review'`, proposal status stays `proposed`.
- Scheduler must also create `decision_ledger.approval_gates` with
  `gate_type = 'lesson_proposal'` and
  `metadata.lesson_dev_proposal_id = <proposal id>`.
- Owner action:
  Approve sets `owner_approval = 'approved'` and status `approved`.
  It also updates the linked `approval_gates` row to `status = 'approved'`.
  Reject sets `owner_approval = 'rejected'` and status `rejected`, with a required reason in the audit trail.
  It also updates the linked `approval_gates` row to `status = 'rejected'`.
  Linked `lesson_gaps` referenced by `lesson_dev_proposals.gap_ids` are dismissed
  atomically by `decision_ledger.reject_lesson_proposal(...)`.

## Bridge Runtime Mode

- `decision_ledger.lesson_dev_proposals` bridge execution defaults to `mock`.
- Shelling out to the lesson-factory CLI is opt-in only:
  set `G2A_BRIDGE_MODE=exec` to enable exec mode explicitly.
- `G2A_BRIDGE_PIPELINE_MODE` remains a legacy alias, but new callers should use
  `G2A_BRIDGE_MODE`.
- `PLAYWRIGHT=1` is the only implicit exception that may allow `exec` without
  `G2A_BRIDGE_MODE=exec`.
- Playwright or CI flows that need deterministic non-shell execution should pin
  `G2A_BRIDGE_MODE=mock` explicitly.

## Blocked

- `direct_publish`
- `destructive_migration`
- Result: `owner_approval = 'blocked'`, proposal status becomes `blocked`.
- Blocked items are logged but must not be handed to the AI PR worker.

## Audit requirements

- Every scheduler run appends `scheduler.run.started`, `scheduler.run.completed`, or `scheduler.run.failed`.
- Every persisted decision appends `scheduler.decision.persisted`.
- Every owner action appends `scheduler.decision.approved` or `scheduler.decision.rejected`.
- Every proposal-gate row must preserve `lesson_dev_proposal_id`, `capability_slug`,
  `outcome_slug`, and `gap_ids` in `approval_gates.metadata`.
- Every AI PR worker handoff appends `scheduler.ai_pr_worker.triggered` or `scheduler.ai_pr_worker.requested_by_owner`.
