/**
 * P1-2: Plan cache entry point.
 *
 * Single wrapper around {@link buildAtomPlanFromGoal} that:
 *   1. Computes a deterministic SHA256 seed from the caller inputs.
 *   2. Looks up an existing ACTIVE compiled_plans row by
 *      (user_id, plan_seed) via {@link getCompiledPlanBySeed}.
 *   3. Returns the cached plan verbatim on hit, otherwise builds the
 *      plan fresh via buildAtomPlanFromGoal.
 *
 * Callers that want caching (plan page, /api/plans/compile, etc.)
 * should go through this function instead of calling
 * buildAtomPlanFromGoal directly. The wrapper ALWAYS returns a plan:
 * on any cache-layer error (no userId, no Supabase client, DB error)
 * it transparently falls back to buildAtomPlanFromGoal.
 *
 * This module intentionally does NOT persist the newly-built plan —
 * persistence is the caller's responsibility (via
 * persistCompiledPlanSnapshot), so the cache write path stays
 * explicit and observable. Callers SHOULD pass the returned `seed`
 * to persistCompiledPlanSnapshot so subsequent calls can cache-hit.
 */

import {
  buildAtomPlanFromGoal,
  shouldRefreshPlanForLeanStart,
  type AtomCompiledPlan,
  type BuildAtomPlanFromGoalInput,
} from './plan-compiler'
import { computePlanSeedFromGoalInput } from './plan-seed'
import { getCompiledPlanBySeed } from '@/lib/compiled-plans'

export interface CachedAtomPlanResult {
  plan: AtomCompiledPlan
  /** SHA256 seed that represents the inputs. Stable across runs. */
  seed: string
  /** True if the plan was served from compiled_plans cache; false if freshly built. */
  fromCache: boolean
  /** Cached plan_id when fromCache is true. */
  cachedPlanId: string | null
}

export interface BuildAtomPlanFromGoalCachedInput extends BuildAtomPlanFromGoalInput {
  /** Tool names — included in the seed hash so AI-tool selection change invalidates cache. */
  tools?: string[]
}

export async function buildAtomPlanFromGoalCached(
  input: BuildAtomPlanFromGoalCachedInput,
): Promise<CachedAtomPlanResult> {
  const seed = computePlanSeedFromGoalInput(input)

  if (input.userId) {
    try {
      const cached = await getCompiledPlanBySeed({
        userId: input.userId,
        seed,
      })

      if (
        cached
        && cached.plan.steps.length > 0
        && !shouldRefreshPlanForLeanStart(cached.plan, input.learnerState)
      ) {
        return {
          plan: cached.plan,
          seed,
          fromCache: true,
          cachedPlanId: cached.planId,
        }
      }
    } catch (error) {
      console.warn('[plan-cache] getCompiledPlanBySeed failed, falling back to fresh build', error)
    }
  }

  const plan = await buildAtomPlanFromGoal(input)

  return {
    plan,
    seed,
    fromCache: false,
    cachedPlanId: null,
  }
}
