/**
 * TQ-249 (Auditor C8): in-memory edit helpers that mutate an
 * `AtomCompiledPlan` to reflect mentor-driven dynamic edits before
 * persisting the result back to `compiled_plans.steps`.
 *
 * Pre-TQ-249 the dynamic-edit handlers only updated
 * `task_progress.relevant_lesson_ids`, so the canonical plan
 * (`compiled_plans.steps`) drifted away from what the learner saw — Owner
 * Directive #20/#21 ("順序変更がプランに反映されない"). These helpers
 * produce a new plan object that the caller writes back via
 * {@link updateCompiledPlanSteps}.
 *
 * Each helper is **pure** (no DB / no telemetry side effects) so they are
 * trivially unit-testable. They never throw; if the requested edit cannot
 * be applied (e.g. unknown lessonId) they return the input plan unchanged
 * with `applied=false` so the caller can decide whether to fall back.
 */

import type {
  AtomCompiledPlan,
  AtomPlanStep,
} from '@/lib/planner/goal-first/plan-compiler'

export interface PlanEditResult {
  /** Whether the edit changed the plan. False means input is returned unchanged. */
  applied: boolean
  /** New plan object (referentially distinct when `applied=true`). */
  plan: AtomCompiledPlan
}

function clonePlan(plan: AtomCompiledPlan): AtomCompiledPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({ ...step })),
    milestones: plan.milestones.map((m) => ({ ...m, atomIds: [...m.atomIds] })),
    goalTags: [...plan.goalTags],
    unsupportedCapabilities: [...plan.unsupportedCapabilities],
    ...(plan.telemetry ? { telemetry: { ...plan.telemetry } } : {}),
  }
}

/** TQ-249: skip an existing step (sets `skipped=true`). No-op if not found. */
export function applySkipLesson(
  plan: AtomCompiledPlan,
  targetLessonId: string,
): PlanEditResult {
  if (!targetLessonId) return { applied: false, plan }
  const idx = plan.steps.findIndex((s) => s.atomId === targetLessonId)
  if (idx < 0) return { applied: false, plan }
  if (plan.steps[idx]?.skipped === true) {
    return { applied: false, plan }
  }
  const next = clonePlan(plan)
  next.steps[idx] = { ...next.steps[idx]!, skipped: true }
  return { applied: true, plan: next }
}

/**
 * TQ-249: move the target lesson to the front of the *incomplete* portion of
 * the plan so it becomes the next eligible step.
 *
 * If the lesson is missing from the plan, it is appended at the front of the
 * incomplete portion using the `extra` step shape (best-effort title /
 * rationale supplied by the caller).
 */
export function applyChangeNextLesson(
  plan: AtomCompiledPlan,
  args: {
    targetLessonId: string
    targetLessonTitle?: string | null
    rationale?: string | null
    estimatedMinutes?: number | null
    milestoneId?: string | null
  },
): PlanEditResult {
  const { targetLessonId } = args
  if (!targetLessonId) return { applied: false, plan }

  const next = clonePlan(plan)
  const completedIdxs = next.steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => Boolean(s.completedAt) || s.skipped === true)
    .map(({ i }) => i)
  const insertAt = completedIdxs.length // first incomplete index

  const existingIdx = next.steps.findIndex((s) => s.atomId === targetLessonId)
  if (existingIdx >= 0) {
    if (existingIdx === insertAt) {
      return { applied: false, plan }
    }
    const [moved] = next.steps.splice(existingIdx, 1)
    if (!moved) return { applied: false, plan }
    // unskip if previously skipped — learner is choosing it as next.
    moved.skipped = false
    next.steps.splice(insertAt, 0, moved)
    return { applied: true, plan: next }
  }

  // Insert a new step (delegation-ish placeholder) for the unknown lesson.
  const newStep: AtomPlanStep = {
    atomId: targetLessonId,
    title: args.targetLessonTitle?.trim() || targetLessonId,
    rationale: args.rationale?.trim() || 'メンターの提案により次のレッスンとして追加されました。',
    estimatedMinutes:
      typeof args.estimatedMinutes === 'number' && args.estimatedMinutes > 0
        ? args.estimatedMinutes
        : 30,
    milestoneId: args.milestoneId ?? null,
    prerequisiteAtomIds: [],
    softPrerequisiteAtomIds: [],
    completedAt: null,
  }
  next.steps.splice(insertAt, 0, newStep)
  return { applied: true, plan: next }
}

/**
 * TQ-249: insert a lesson before `beforeLessonId`, or append before the last
 * incomplete step when `beforeLessonId` is missing.
 */
export function applyAddLesson(
  plan: AtomCompiledPlan,
  args: {
    targetLessonId: string
    targetLessonTitle?: string | null
    beforeLessonId?: string | null
    rationale?: string | null
    estimatedMinutes?: number | null
    milestoneId?: string | null
  },
): PlanEditResult {
  const { targetLessonId, beforeLessonId } = args
  if (!targetLessonId) return { applied: false, plan }
  if (plan.steps.some((s) => s.atomId === targetLessonId)) {
    // Already present — nothing to do.
    return { applied: false, plan }
  }

  const next = clonePlan(plan)
  let insertAt = next.steps.length
  if (beforeLessonId) {
    const found = next.steps.findIndex((s) => s.atomId === beforeLessonId)
    if (found >= 0) insertAt = found
  }

  const newStep: AtomPlanStep = {
    atomId: targetLessonId,
    title: args.targetLessonTitle?.trim() || targetLessonId,
    rationale: args.rationale?.trim() || 'メンターの提案により追加されたレッスン。',
    estimatedMinutes:
      typeof args.estimatedMinutes === 'number' && args.estimatedMinutes > 0
        ? args.estimatedMinutes
        : 30,
    milestoneId: args.milestoneId ?? null,
    prerequisiteAtomIds: [],
    softPrerequisiteAtomIds: [],
    completedAt: null,
  }
  next.steps.splice(insertAt, 0, newStep)
  return { applied: true, plan: next }
}

/**
 * TQ-249: reorder the *incomplete* portion of the plan to the supplied
 * lesson-id sequence. Completed steps retain their relative position at the
 * front. Lesson IDs not present in the plan are silently dropped (we don't
 * synthesize delegation steps from a reorder request).
 */
export function applyReorderSchedule(
  plan: AtomCompiledPlan,
  newOrderLessonIds: string[],
): PlanEditResult {
  if (newOrderLessonIds.length === 0) return { applied: false, plan }

  const next = clonePlan(plan)
  const completed: AtomPlanStep[] = []
  const incompleteByAtomId = new Map<string, AtomPlanStep>()

  for (const step of next.steps) {
    if (step.completedAt || step.skipped === true) {
      completed.push(step)
    } else {
      incompleteByAtomId.set(step.atomId, step)
    }
  }

  const reorderedIncomplete: AtomPlanStep[] = []
  const seen = new Set<string>()
  for (const id of newOrderLessonIds) {
    if (seen.has(id)) continue
    const step = incompleteByAtomId.get(id)
    if (!step) continue
    reorderedIncomplete.push(step)
    seen.add(id)
  }
  // append any incomplete steps the new order forgot — we never drop steps.
  for (const [id, step] of incompleteByAtomId.entries()) {
    if (!seen.has(id)) {
      reorderedIncomplete.push(step)
    }
  }

  // No-op detection: if the resulting sequence equals current.
  const before = next.steps.map((s) => s.atomId).join('|')
  const after = [...completed, ...reorderedIncomplete].map((s) => s.atomId).join('|')
  if (before === after) {
    return { applied: false, plan }
  }

  next.steps = [...completed, ...reorderedIncomplete]
  return { applied: true, plan: next }
}

/**
 * TQ-256 / TQ-220: replace the recommended_tool on a single step. When
 * `fromToolId` is supplied we additionally guard against switching from a
 * different tool than expected (defensive — UI may race against a recompile).
 */
export function applySwitchTool(
  plan: AtomCompiledPlan,
  args: {
    stepId: string
    toToolId: string
    fromToolId?: string | null
  },
): PlanEditResult {
  if (!args.stepId || !args.toToolId) return { applied: false, plan }
  const idx = plan.steps.findIndex((s) => s.atomId === args.stepId)
  if (idx < 0) return { applied: false, plan }
  const current = plan.steps[idx]!
  if (
    args.fromToolId
    && current.recommendedTool
    && current.recommendedTool !== args.fromToolId
  ) {
    return { applied: false, plan }
  }
  if (current.recommendedTool === args.toToolId) {
    return { applied: false, plan }
  }
  const next = clonePlan(plan)
  next.steps[idx] = {
    ...next.steps[idx]!,
    recommendedTool: args.toToolId,
  }
  return { applied: true, plan: next }
}
