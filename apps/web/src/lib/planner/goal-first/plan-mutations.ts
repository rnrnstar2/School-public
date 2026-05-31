/**
 * Plan mutation helpers (TQ-195).
 *
 * Pure, deterministic transforms over an {@link AtomCompiledPlan} that
 * mentor actions (skip_lesson, focus_lesson, …) can apply without
 * re-running the planner pipeline.
 *
 * These are intentionally UI- and DB-agnostic: callers are expected to
 * compose them with {@link persistCompiledPlanSnapshot} when they want
 * to commit the resulting plan.
 */

import type { AtomCompiledPlan, AtomPlanStep } from './plan-compiler'

/**
 * Return a shallow clone of the plan where any step whose atomId matches
 * `targetAtomId` has `skipped: true`. Steps without a match are preserved
 * byref; the overall `steps` array identity is always a fresh copy.
 *
 * If no step matches, the plan is returned unchanged (same object
 * identity) so callers can short-circuit persistence.
 */
export function markPlanStepSkipped(
  plan: AtomCompiledPlan,
  targetAtomId: string,
): { plan: AtomCompiledPlan; mutated: boolean } {
  const matchIndex = plan.steps.findIndex((step) => step.atomId === targetAtomId)
  if (matchIndex < 0) {
    return { plan, mutated: false }
  }

  const step = plan.steps[matchIndex]
  if (step.skipped === true) {
    return { plan, mutated: false }
  }

  const nextSteps: AtomPlanStep[] = plan.steps.slice()
  nextSteps[matchIndex] = { ...step, skipped: true }

  return {
    plan: { ...plan, steps: nextSteps },
    mutated: true,
  }
}
