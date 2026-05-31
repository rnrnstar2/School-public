# `apps/web/src/test`

This folder hosts cross-cutting integration and contract specs that do not
naturally belong next to a single module.

## RLS tests

We maintain two complementary layers of tests for Postgres Row Level Security.

### Layer 1 — migration SQL text assertions (always on)

Files:

- `rls-phase5.spec.ts`
- `rls-improvement.spec.ts`

These tests read the migration `.sql` files from disk and assert on their
contents ("the migration contains `CREATE POLICY compiled_plans_owner_select`",
etc.). They run by default with `pnpm test:vitest` and act as a regression
guard: if someone rewrites a migration and accidentally drops a policy,
these tests fail immediately.

**Limitation:** they verify the SQL says the right thing, not that the DB
actually enforces it.

### Layer 2 — live DB behavioral tests (opt-in)

Files:

- `rls-live-helpers.ts` — shared helper: service-role client, user
  provisioning via `auth.admin.createUser`, `seedRow`, per-test cleanup.
- `rls-phase5.live.spec.ts` — live behavioral tests for `compiled_plans`.
- `rls-goals.live.spec.ts` — live behavioral tests for `goals`.

These tests actually talk to a local Supabase instance. Each test creates
two users (A, B), inserts rows as A, then verifies B cannot SELECT / UPDATE
/ DELETE those rows via an authenticated PostgREST client. They assert on
real DB behavior, catching cases where the policy exists but is incorrectly
scoped (e.g., missing `user_id` filter, wrong role target, or incorrect
`USING` / `WITH CHECK` clauses).

### Why both layers

| Question                                                | Layer 1 | Layer 2 |
|---------------------------------------------------------|---------|---------|
| Did someone accidentally drop the policy from the file? | yes     | no      |
| Does the live DB actually block user B from user A's rows? | no    | yes     |
| Catches schema drift on a deployed DB                   | no      | yes     |
| Runs in CI without external services                    | yes     | no      |

## Running the live tests locally

Live RLS tests are opt-in so that `pnpm test` / `pnpm test:vitest` stay green
in environments without a database. To run them:

1. Start the local Supabase stack:

   ```bash
   cd apps/web
   supabase start
   ```

   This gives you Postgres + Auth + PostgREST on
   `http://127.0.0.1:54341` with the usual well-known local JWT keys.

2. Run the live suite:

   ```bash
   pnpm --filter web test:rls-live
   ```

   Under the hood this runs:

   ```bash
   RUN_LIVE_RLS_TESTS=1 vitest run src/test/rls-*.live.spec.ts
   ```

### Environment variables

| Var                           | Default (local dev)          | Purpose                         |
|-------------------------------|-------------------------------|---------------------------------|
| `RUN_LIVE_RLS_TESTS`          | unset (tests skipped)        | Must be `1` to run live tests.  |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54341` | Local Supabase REST endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY`   | CLI local default            | Bypass RLS for setup/teardown.  |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CLI local default    | Anon client for sign-in.        |

The helper (`rls-live-helpers.ts`) defaults to the `supabase start`
well-known JWT keys, which are only valid against ephemeral local stacks
and are documented by Supabase — they do **not** grant access to any
production environment.

If `RUN_LIVE_RLS_TESTS=1` is set but the local Supabase is unreachable,
tests fail loudly during `beforeAll` so you can't accidentally get a
silent pass.

## What these tests protect against

- A migration that *looks* correct but uses the wrong `auth.uid()` column
  (e.g., `auth.uid() = owner_id` instead of `user_id`).
- A policy targeted at the wrong role (e.g., `TO service_role` instead of
  `TO authenticated`, which would silently let the authenticated path bypass
  intended restrictions).
- Missing `WITH CHECK` on an INSERT policy, which would allow users to
  write rows owned by other users.
- Regressions introduced by ALTER POLICY or cascading drops during later
  migrations.
