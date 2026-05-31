# Nightly Flywheel Overview

`G2A-012` closes the Goal→Action loop by orchestrating a single nightly run across:

1. `matcher_sweep`
2. `gap_scan`
3. `proposer_run`
4. `judge_run`
5. `nightly_digest`

## Runtime contract

- Workflow definition lives in [`packages/flywheel-scheduler/src/workflows/nightly.yaml`](../../packages/flywheel-scheduler/src/workflows/nightly.yaml).
- Each stage gets a 10 minute timeout and at least 1 retry with exponential backoff.
- If an upstream stage exhausts retries, downstream stages marked `skipOnUpstreamFailure` are written to `scheduler_runs` with `status = 'skipped_upstream_failed'`.
- The final `nightly_digest` stage still runs so owners see failures the next morning.

## Digest row

The nightly run upserts exactly one `public.nightly_digest` row per JST `run_date`.

- A fully successful day is stored as `status = 'completed'`.
- A partial day is stored as `status = 'completed_with_failures'`.
- A second trigger on a day that already has `status = 'completed'` is a no-op.
- A rerun after a partial/failed day reuses the same `run_date` row and preserves the append-only `audit_log`.

## Approval gate + PR worker

- `proposer_run` outputs still flow through the G2A-010 approval policy.
- `micro_patch_existing_lesson` proposals stay `owner_approval = 'auto'` and are handed off immediately.
- Pending items remain `pending_owner_review` and surface in both `/admin/scheduler` and `/admin/digest`.
- The real handoff path now creates or reuses a backing `decision_ledger.proposed_actions` row, then runs `@school/ai-pr-worker`, which keeps the `update_action_backlink` RPC as the only metadata backlink write path.

## Owner surfaces

- `/admin/digest` shows the last 7 nightly digests with counts, judge histogram, failed stages, and deep links to `/admin/scheduler#pending-approvals`.
- `/admin/scheduler` remains the review console for proposals that require explicit owner approval.
