-- P1-2: Plan cache + deterministic seeding
--
-- Adds a nullable `plan_seed` column to compiled_plans so that plan
-- generation can cache-hit on (user_id, plan_seed) when the normalized
-- input JSON hashes to the same value as a previously-persisted active
-- plan. See apps/web/src/lib/planner/goal-first/plan-seed.ts for the
-- hash computation.
--
-- Nullable + no default keeps this backward compatible: existing rows
-- carry NULL seeds (and are therefore never cache-hit), while all new
-- writes populate the column via persistCompiledPlanSnapshot.

ALTER TABLE compiled_plans
  ADD COLUMN IF NOT EXISTS plan_seed text;

CREATE INDEX IF NOT EXISTS idx_compiled_plans_user_seed_status
  ON compiled_plans (user_id, plan_seed, status)
  WHERE plan_seed IS NOT NULL;

COMMENT ON COLUMN compiled_plans.plan_seed IS
  'SHA256 hex of JSON-stringified normalized planner inputs '
  '(goal, learnerState, tools). Used by plan cache to short-circuit '
  'regeneration when inputs match an existing active plan.';
