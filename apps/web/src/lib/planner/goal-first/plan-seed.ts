/**
 * P1-2: Plan seed helper.
 *
 * Computes a deterministic SHA256 hash of the normalized planner inputs
 * so that two calls with the same goal + learner state + tool list
 * produce the same seed — and thus hit the compiled_plans cache.
 *
 * The seed is intentionally input-only: it is NOT a hash of the
 * generated plan output. This lets us short-circuit regeneration on
 * cache hit without re-computing the plan to verify.
 *
 * Determinism rules enforced here:
 *   - All string/array inputs are trimmed and sorted before serialization.
 *   - null / undefined / empty-string are collapsed to a single canonical
 *     form so callers that pass `undefined` vs missing key still hash
 *     identically.
 *   - Object key order is fixed (we build the canonical object ourselves,
 *     we do NOT rely on JSON.stringify's implementation order).
 */

import { createHash } from 'node:crypto'
import type { AtomPlanCompilerInput, BuildAtomPlanFromGoalInput } from './plan-compiler'

export interface PlanSeedInput {
  /** Raw or normalized goal text — whichever is stable for the caller. */
  goal: string
  /** Persona IDs explicitly requested by the caller, if any. */
  personaIds?: string[]
  /** Goal tags — will be normalized (trim + sort + dedupe). */
  goalTags?: string[]
  /** Hearing summary bullets — used to break cache ties for distinct conversations. */
  hearingSummaryKeyPoints?: string[]
  /** Recent mentor-memory bullets that affect deterministic tag inference. */
  mentorMemoryBullets?: string[]
  /** Already-completed atom/lesson IDs — normalized. */
  completedAtomIds?: string[]
  /** Tool names — normalized. */
  tools?: string[]
  /** Optional learner state summary fields. */
  learnerState?: {
    skillLevel?: string | null
    blockers?: string[]
    signals?: unknown
  }
}

function normalizeString(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeStringArray(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return []
  const cleaned = values
    .map((v) => normalizeString(v))
    .filter((v) => v.length > 0)
  // Dedupe + sort for stable hash.
  return Array.from(new Set(cleaned)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function normalizeSignals(signals: unknown): unknown {
  if (signals === null || signals === undefined) return null
  // Re-serialize to strip undefined + normalize key order at least at the
  // top level via JSON.stringify's own deterministic behavior for
  // primitive-valued plain objects. Nested objects' key order depends on
  // insertion order at the call-site — callers that want stable seeding
  // with complex signals should pre-canonicalize.
  try {
    return JSON.parse(JSON.stringify(signals))
  } catch {
    return null
  }
}

/**
 * Build a canonical JSON string for the planner inputs.
 *
 * Exported mainly for testing — most callers should use
 * {@link computePlanSeed} instead.
 */
export function canonicalizePlanSeedInput(input: PlanSeedInput): string {
  const canonical = {
    goal: normalizeString(input.goal),
    personaIds: normalizeStringArray(input.personaIds),
    goalTags: normalizeStringArray(input.goalTags),
    hearingSummaryKeyPoints: normalizeStringArray(input.hearingSummaryKeyPoints),
    mentorMemoryBullets: normalizeStringArray(input.mentorMemoryBullets),
    completedAtomIds: normalizeStringArray(input.completedAtomIds),
    tools: normalizeStringArray(input.tools),
    learnerState: {
      skillLevel: normalizeString(input.learnerState?.skillLevel ?? null) || null,
      blockers: normalizeStringArray(input.learnerState?.blockers),
      signals: normalizeSignals(input.learnerState?.signals),
    },
  }

  return JSON.stringify(canonical)
}

/**
 * Compute a SHA256 hex digest of the canonical planner inputs.
 *
 * @returns 64-character lowercase hex string. Deterministic across runs
 *          and machines for identical inputs (modulo nested signals
 *          object key-order, see canonicalizePlanSeedInput).
 */
export function computePlanSeed(input: PlanSeedInput): string {
  const canonical = canonicalizePlanSeedInput(input)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Convenience wrapper that computes a seed from a BuildAtomPlanFromGoalInput.
 */
export function computePlanSeedFromGoalInput(
  input: BuildAtomPlanFromGoalInput & { tools?: string[] },
): string {
  return computePlanSeed({
    goal: input.goal,
    personaIds: input.personaIds,
    goalTags: input.goalTags,
    hearingSummaryKeyPoints: input.hearingSummary?.keyPoints,
    mentorMemoryBullets: input.mentorMemoryBullets,
    completedAtomIds: input.completedAtomIds,
    tools: input.tools,
    learnerState: input.learnerState,
  })
}

/**
 * Convenience wrapper that computes a seed from a raw AtomPlanCompilerInput.
 */
export function computePlanSeedFromCompilerInput(
  input: AtomPlanCompilerInput & { tools?: string[] },
): string {
  return computePlanSeed({
    goal: input.goal,
    personaIds: input.userPersonas,
    goalTags: input.goalTags,
    completedAtomIds: input.completedAtomIds,
    tools: input.tools,
    learnerState: input.learnerState,
  })
}
