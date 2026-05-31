# Coverage Snapshot Cache Invalidation

- created_at: 2026-04-18 JST
- follow_up: TQ-151 (completed)
- scope: runtime + migration applied in repo; production apply remains owner-operated

## Context

Factory lesson payloads now normalize `track_id` to `null`.
That payload change requires a schema bump because `content_hash` includes the snapshot payload.

## TQ-151 outcome

- `COVERAGE_INDEX_SCHEMA_VERSION` is now `v1`.
- Migration `20260418180000_coverage_index_snapshots_invalidate_v0.sql` deletes all cached `v0` rows and constrains new writes to `schema_version = 'v1'`.
- Snapshot readers in shadow write, gap loop, and judge runner now query `coverage_index_snapshots` with `schema_version = COVERAGE_INDEX_SCHEMA_VERSION`, so older payloads are ignored even before a rebuild happens.
- `scripts/goal-action/build-coverage-index.ts` writes rebuilt rows as `schema_version = 'v1'`.

## Operating Rule

- The cache is a rebuildable derived artifact. When the payload shape changes again, bump `schema_version` to `v2` or later and ship an invalidation migration in the same TQ.
