import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { CompiledPlan } from '@/lib/planner/goal-first/types'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import { createServiceClient } from '@/lib/supabase/service'

type Client = SupabaseClient<Database>

export type CompiledPlanStatus = 'active' | 'superseded' | 'archived'

export interface ActiveCompiledPlanSnapshot {
  planId: string
  goal: string
  personaId: string | null
  /** SHA256 plan_seed if the active row has one; null for legacy rows. */
  planSeed: string | null
  /**
   * W47 (CR-1): Conductor 経由で persist された plan を `/api/plans/compile`
   * の skip 経路で再利用するために `created_at` と deserialized plan を
   * exposing する。`null` の場合は legacy row。
   */
  createdAt?: string | null
  /**
   * W47 (CR-1): skip 経路で API response の `data.plan` にそのまま流すための
   * deserialized plan。caller (route 層) が再 compile を回避する判定 + 返却に使う。
   */
  plan?: AtomCompiledPlan | null
}

export interface PersistCompiledPlanSnapshotResult {
  synced: boolean
  message: string | null
  planId: string | null
  parentPlanId: string | null
}

export interface CompiledPlanRecord {
  planId: string
  goal: string
  personaId: string | null
  parentPlanId: string | null
  status: CompiledPlanStatus
  coverageScore: number
  unsupportedCapabilities: string[]
  rationale: string
  createdAt: string | null
  updatedAt: string | null
  stepsRaw: unknown[]
  plan: AtomCompiledPlan
  /** SHA256 hex of the normalized planner inputs. Null for legacy rows
   *  predating migration 20260412000418. */
  planSeed: string | null
}

interface PersistCompiledPlanSnapshotOptions {
  userId: string
  goal: string
  plan?: AtomCompiledPlan | CompiledPlan | null
  steps?: Json
  coverageScore?: number | null
  unsupportedCapabilities?: string[]
  rationale?: string | null
  personaId?: string | null
  parentPlanId?: string | null
  supersedePlanIds?: string[]
  status?: CompiledPlanStatus
  client?: Client | null
  /** SHA256 hex digest of the normalized planner inputs. Optional for
   *  backward compatibility; omit if the caller does not know the seed. */
  planSeed?: string | null
}

interface PersistedAtomStepRecord {
  atomId: string
  title: string
  milestoneId: string | null
  milestoneTitle: string | null
  milestoneDescription: string | null
  rationale: string
  estimatedMinutes: number
  prerequisiteAtomIds: string[]
  softPrerequisiteAtomIds: string[]
  completedAt: string | null
  sortOrder: number
  goalTags: string[]
  source: AtomCompiledPlan['source']
  skipped: boolean
  /** TQ-220: AI-recommended tool id from `ai-tools-catalog`. `null` for steps without an assignment. */
  recommendedTool: string | null
  /** TQ-220: delegation brief for the recommended tool. `null` when no recommendation. */
  delegationBrief: string | null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

function sanitizeJson(value: unknown, fallback: Json): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json
  } catch {
    return fallback
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLegacyCompiledPlan(plan: AtomCompiledPlan | CompiledPlan): plan is CompiledPlan {
  return 'nodes' in plan
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueStrings(value.filter((entry): entry is string => typeof entry === 'string'))
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function buildMilestoneLookup(plan: AtomCompiledPlan) {
  return new Map(plan.milestones.map((milestone) => [milestone.id, milestone]))
}

function normalizePersistedAtomStep(entry: unknown, index: number): PersistedAtomStepRecord | null {
  const record = isRecord(entry) ? entry : {}
  const atomId = toNullableString(record.atom_id)

  if (!atomId) {
    return null
  }

  return {
    atomId,
    title: toNullableString(record.atom_title) ?? atomId,
    milestoneId: toNullableString(record.milestone_id),
    milestoneTitle: toNullableString(record.milestone_title),
    milestoneDescription: toNullableString(record.milestone_description),
    rationale: toNullableString(record.rationale) ?? '',
    estimatedMinutes: Math.max(0, toNumber(record.estimated_minutes, 0)),
    prerequisiteAtomIds: toStringArray(record.prerequisite_atom_ids),
    softPrerequisiteAtomIds: toStringArray(record.soft_prerequisite_atom_ids),
    completedAt: toNullableString(record.completed_at),
    sortOrder: toNumber(record.sort_order, index + 1),
    goalTags: toStringArray(record.goal_tags),
    source: record.plan_source === 'anchor' ? 'anchor' : record.plan_source === 'ai' ? 'ai' : 'topo',
    skipped: record.skipped === true,
    // TQ-220: optional recommended tool / delegation brief. Older rows
    // predate these fields and will read as null.
    recommendedTool: toNullableString(record.recommended_tool),
    delegationBrief: toNullableString(record.delegation_brief),
  }
}

function buildMilestonesFromPersistedSteps(steps: PersistedAtomStepRecord[]) {
  const milestones: AtomCompiledPlan['milestones'] = []
  const milestoneIndexById = new Map<string, number>()

  for (const step of steps) {
    const milestoneId = step.milestoneId ?? `milestone-${String(milestones.length + 1).padStart(3, '0')}`
    const existingIndex = milestoneIndexById.get(milestoneId)

    if (typeof existingIndex === 'number') {
      milestones[existingIndex]?.atomIds.push(step.atomId)
      continue
    }

    milestoneIndexById.set(milestoneId, milestones.length)
    milestones.push({
      id: milestoneId,
      title: step.milestoneTitle ?? milestoneId,
      description:
        step.milestoneDescription ??
        '関連する atom を順に進めて、このマイルストーンを完了します。',
      atomIds: [step.atomId],
    })
  }

  return milestones
}

export function deserializeAtomCompiledPlan(params: {
  goal: string
  steps: unknown
  coverageScore?: number | null
  unsupportedCapabilities?: unknown
  rationale?: string | null
}): AtomCompiledPlan {
  const normalizedSteps = Array.isArray(params.steps)
    ? params.steps
        .map((entry, index) => normalizePersistedAtomStep(entry, index))
        .filter((step): step is PersistedAtomStepRecord => Boolean(step))
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : []

  const milestones = buildMilestonesFromPersistedSteps(normalizedSteps)
  const goalTags = uniqueStrings(normalizedSteps.flatMap((step) => step.goalTags))
  const source = normalizedSteps.some((step) => step.source === 'ai')
    ? 'ai'
    : normalizedSteps.some((step) => step.source === 'anchor')
      ? 'anchor'
      : 'topo'

  return {
    goal: params.goal,
    goalTags,
    steps: normalizedSteps.map((step) => ({
      atomId: step.atomId,
      title: step.title,
      rationale: step.rationale,
      estimatedMinutes: step.estimatedMinutes,
      milestoneId: step.milestoneId,
      prerequisiteAtomIds: step.prerequisiteAtomIds,
      softPrerequisiteAtomIds: step.softPrerequisiteAtomIds,
      completedAt: step.completedAt,
      skipped: step.skipped || undefined,
      recommendedTool: step.recommendedTool,
      delegationBrief: step.delegationBrief,
    })),
    milestones,
    coverageScore: Number((params.coverageScore ?? 0).toFixed(2)),
    unsupportedCapabilities: toStringArray(params.unsupportedCapabilities),
    rationale: params.rationale?.trim() || `${params.goal} の atom plan です。`,
    source,
  }
}

export function buildCompiledPlanSteps(plan: AtomCompiledPlan | CompiledPlan): Json {
  if (!isLegacyCompiledPlan(plan)) {
    const milestoneById = buildMilestoneLookup(plan)

    return sanitizeJson(
      plan.steps.map((step, index) => {
        const milestone = step.milestoneId ? milestoneById.get(step.milestoneId) : null

        return {
          atom_id: step.atomId,
          atom_title: step.title,
          milestone_id: step.milestoneId,
          milestone_title: milestone?.title ?? null,
          milestone_description: milestone?.description ?? null,
          sort_order: index + 1,
          rationale: step.rationale,
          estimated_minutes: step.estimatedMinutes,
          prerequisite_atom_ids: step.prerequisiteAtomIds,
          soft_prerequisite_atom_ids: step.softPrerequisiteAtomIds,
          completed_at: step.completedAt,
          goal_tags: plan.goalTags,
          plan_source: plan.source,
          skipped: step.skipped === true,
          // TQ-220: per-step AI tool assignment. Use snake_case to match the
          // rest of the persisted schema. Always write `null` (rather than
          // omitting) so the column shape is consistent across rows.
          recommended_tool: step.recommendedTool ?? null,
          delegation_brief: step.delegationBrief ?? null,
        }
      }),
      [],
    )
  }

  const milestoneTitleById = new Map(plan.milestones.map((milestone) => [milestone.id, milestone.title]))

  return sanitizeJson(
    plan.nodes.map((node) => ({
      id: node.id,
      lesson_id: node.lessonId,
      lesson_title: node.lessonTitle,
      milestone_id: node.milestoneId,
      milestone_title: milestoneTitleById.get(node.milestoneId) ?? node.milestoneId,
      sort_order: node.sortOrder,
      rationale: node.rationale,
      difficulty: node.difficulty,
      estimated_minutes: node.estimatedMinutes,
      prerequisite_node_ids: node.prerequisiteNodeIds,
    })),
    [],
  )
}

export function buildRevisionSteps(
  steps: Array<{
    id: string
    title: string
    description: string
    outcome?: string | null
    purpose?: string | null
    isNew?: boolean
    originalStepId?: string | null
}>,
): Json {
  return sanitizeJson(
    steps.map((step, index) => ({
      atom_id: step.id,
      atom_title: step.title,
      milestone_id: `revision-milestone-${String(index + 1).padStart(3, '0')}`,
      milestone_title: step.title,
      milestone_description: step.description,
      sort_order: index + 1,
      rationale: step.purpose?.trim() || step.description,
      estimated_minutes: 15,
      prerequisite_atom_ids: [],
      soft_prerequisite_atom_ids: [],
      completed_at: null,
      goal_tags: [],
      plan_source: 'ai',
      metadata: {
        outcome: step.outcome ?? null,
        purpose: step.purpose ?? null,
        is_new: Boolean(step.isNew),
        original_step_id: step.originalStepId ?? null,
      },
    })),
    [],
  )
}

export function deriveUnsupportedCapabilities(plan: AtomCompiledPlan | CompiledPlan): string[] {
  if (!isLegacyCompiledPlan(plan)) {
    return uniqueStrings(plan.unsupportedCapabilities)
  }

  return uniqueStrings(plan.gapTasks.map((gapTask) => gapTask.missingCapability))
}

export function calculateCoverageScore(stepCount: number, unsupportedCapabilityCount: number): number | null {
  const coveredCount = Math.max(stepCount, 0)
  const unsupportedCount = Math.max(unsupportedCapabilityCount, 0)
  const total = coveredCount + unsupportedCount

  if (total === 0) {
    return 0
  }

  return Number((coveredCount / total).toFixed(2))
}

export async function getCompiledPlanRecord(params: {
  userId: string
  planId?: string | null
  status?: CompiledPlanStatus | null
  client?: Client | null
}): Promise<CompiledPlanRecord | null> {
  const reader = params.client ?? createServiceClient()

  if (!reader) {
    return null
  }

  let query = reader
    .from('compiled_plans')
    .select(`
      plan_id,
      goal,
      persona_id,
      parent_plan_id,
      status,
      steps,
      coverage_score,
      unsupported_capabilities,
      rationale,
      created_at,
      plan_seed
    `)
    .eq('user_id', params.userId)

  if (params.planId?.trim()) {
    query = query.eq('plan_id', params.planId.trim())
  } else {
    query = query
      .eq('status', params.status ?? 'active')
      .order('created_at', { ascending: false })
      .limit(1)
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    plan_id: string
    goal: string
    persona_id: string | null
    parent_plan_id: string | null
    status: CompiledPlanStatus
    steps: unknown
    coverage_score: number | null
    unsupported_capabilities: unknown
    rationale: string | null
    created_at: string | null
    plan_seed?: string | null
  }
  const stepsRaw = Array.isArray(row.steps) ? row.steps : []

  return {
    planId: row.plan_id,
    goal: row.goal,
    personaId: row.persona_id,
    parentPlanId: row.parent_plan_id,
    status: row.status,
    coverageScore: row.coverage_score ?? 0,
    unsupportedCapabilities: toStringArray(row.unsupported_capabilities),
    rationale: row.rationale ?? `${row.goal} の atom plan です。`,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    stepsRaw,
    plan: deserializeAtomCompiledPlan({
      goal: row.goal,
      steps: stepsRaw,
      coverageScore: row.coverage_score,
      unsupportedCapabilities: row.unsupported_capabilities,
      rationale: row.rationale,
    }),
    planSeed: toNullableString(row.plan_seed),
  }
}

/**
 * P1-2: Plan cache fast-path.
 *
 * Returns the user's most recent ACTIVE compiled_plans row whose
 * plan_seed matches the supplied hash, or null if none exists. The
 * caller is expected to have computed the seed via
 * {@link computePlanSeed} using the exact inputs that would be passed
 * to buildAtomPlanFromGoal.
 *
 * Design note: we deliberately scope to `status = 'active'` so that
 * superseded plans (e.g. old revisions after a re-plan) do not
 * accidentally short-circuit a legitimate regeneration.
 */
export async function getCompiledPlanBySeed(params: {
  userId: string
  seed: string
  client?: Client | null
}): Promise<CompiledPlanRecord | null> {
  const seed = params.seed?.trim()
  if (!seed) {
    return null
  }

  const reader = params.client ?? createServiceClient()
  if (!reader) {
    return null
  }

  const { data, error } = await reader
    .from('compiled_plans')
    .select(`
      plan_id,
      goal,
      persona_id,
      parent_plan_id,
      status,
      steps,
      coverage_score,
      unsupported_capabilities,
      rationale,
      created_at,
      plan_seed
    `)
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .eq('plan_seed', seed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    plan_id: string
    goal: string
    persona_id: string | null
    parent_plan_id: string | null
    status: CompiledPlanStatus
    steps: unknown
    coverage_score: number | null
    unsupported_capabilities: unknown
    rationale: string | null
    created_at: string | null
    plan_seed: string | null
  }
  const stepsRaw = Array.isArray(row.steps) ? row.steps : []

  return {
    planId: row.plan_id,
    goal: row.goal,
    personaId: row.persona_id,
    parentPlanId: row.parent_plan_id,
    status: row.status,
    coverageScore: row.coverage_score ?? 0,
    unsupportedCapabilities: toStringArray(row.unsupported_capabilities),
    rationale: row.rationale ?? `${row.goal} の atom plan です。`,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    stepsRaw,
    plan: deserializeAtomCompiledPlan({
      goal: row.goal,
      steps: stepsRaw,
      coverageScore: row.coverage_score,
      unsupportedCapabilities: row.unsupported_capabilities,
      rationale: row.rationale,
    }),
    planSeed: toNullableString(row.plan_seed),
  }
}

export async function getLatestActiveCompiledPlan(params: {
  userId: string
  goal?: string | null
  client?: Client | null
}): Promise<ActiveCompiledPlanSnapshot | null> {
  const record = await getCompiledPlanRecord({
    userId: params.userId,
    status: 'active',
    client: params.client,
  })

  if (!record) {
    return null
  }

  if (params.goal?.trim() && record.goal !== params.goal.trim()) {
    return null
  }

  return {
    planId: record.planId,
    goal: record.goal,
    personaId: record.personaId,
    planSeed: record.planSeed,
    // W47 (CR-1): Conductor 経由で persist された plan を `/api/plans/compile`
    // で skip + 既存返却するために `created_at` と deserialized plan を載せる。
    createdAt: record.createdAt,
    plan: record.plan,
  }
}

/**
 * TQ-249 (Auditor C8): in-place update of `compiled_plans.steps` for a single
 * plan row. Used by dynamic-edit mentor actions (skip_lesson /
 * change_next_lesson / add_lesson / reorder_schedule) so the persisted plan
 * actually reflects the learner's edit instead of only mutating the
 * task_progress mirror.
 *
 * Unlike {@link persistCompiledPlanSnapshot} this **updates the existing row**
 * (no new revision, no parent_plan_id). For "create a new revision" semantics
 * use the snapshot helper. Coverage / rationale / capability are recomputed
 * from the supplied plan because step count changes can move all three.
 *
 * Returns `synced=false` when the service-role client is unavailable so the
 * caller can degrade gracefully (the action handlers also write to
 * task_progress and mentor_memory, so we still want them to succeed).
 */
export async function updateCompiledPlanSteps(options: {
  planId: string
  userId: string
  plan: AtomCompiledPlan
  client?: Client | null
}): Promise<{ synced: boolean; message: string | null }> {
  const writer = createServiceClient() ?? options.client ?? null
  if (!writer) {
    return {
      synced: false,
      message:
        'SUPABASE_SERVICE_ROLE_KEY が未設定のため compiled_plans を更新できません。',
    }
  }

  const persistedSteps = buildCompiledPlanSteps(options.plan)
  const persistedUnsupportedCapabilities = deriveUnsupportedCapabilities(options.plan)
  const persistedCoverageScore = options.plan.coverageScore

  const { error } = await writer
    .from('compiled_plans')
    .update({
      steps: persistedSteps,
      coverage_score: persistedCoverageScore,
      unsupported_capabilities: sanitizeJson(persistedUnsupportedCapabilities, []),
      rationale: options.plan.rationale,
    })
    .eq('plan_id', options.planId)
    .eq('user_id', options.userId)

  if (error) {
    return {
      synced: false,
      message: error.message ?? 'compiled_plans の更新に失敗しました。',
    }
  }

  return { synced: true, message: null }
}

export async function persistCompiledPlanSnapshot(
  options: PersistCompiledPlanSnapshotOptions,
): Promise<PersistCompiledPlanSnapshotResult> {
  const writer = createServiceClient() ?? options.client ?? null

  if (!writer) {
    return {
      synced: false,
      message: 'SUPABASE_SERVICE_ROLE_KEY が未設定のため compiled_plans を更新できません。',
      planId: null,
      parentPlanId: options.parentPlanId ?? null,
    }
  }

  const persistedSteps = options.plan
    ? buildCompiledPlanSteps(options.plan)
    : sanitizeJson(options.steps ?? [], [])
  const persistedUnsupportedCapabilities = options.plan
    ? deriveUnsupportedCapabilities(options.plan)
    : options.unsupportedCapabilities ?? []
  const persistedCoverageScore = options.plan
    ? (!isLegacyCompiledPlan(options.plan)
        ? options.plan.coverageScore
        : options.coverageScore ?? calculateCoverageScore(
            options.plan.nodes.length,
            deriveUnsupportedCapabilities(options.plan).length,
          ))
    : options.coverageScore ?? null
  const persistedRationale = options.plan && !isLegacyCompiledPlan(options.plan)
    ? options.plan.rationale
    : options.rationale ?? null

  const payload = {
    user_id: options.userId,
    persona_id: options.personaId ?? null,
    goal: options.goal,
    steps: persistedSteps,
    coverage_score: persistedCoverageScore,
    unsupported_capabilities: sanitizeJson(persistedUnsupportedCapabilities, []),
    rationale: persistedRationale,
    status: options.status ?? 'active',
    parent_plan_id: options.parentPlanId ?? null,
    // P1-2: cache key for plan reuse. When the column is NULL (legacy rows
    // or callers that omit planSeed), getCompiledPlanBySeed simply won't
    // match, so behavior is backward-compatible.
    plan_seed: toNullableString(options.planSeed),
  }

  const { data, error } = await writer
    .from('compiled_plans')
    .insert(payload)
    .select('plan_id')
    .single()

  if (error || !data) {
    return {
      synced: false,
      message: error?.message ?? 'compiled_plans への保存に失敗しました。',
      planId: null,
      parentPlanId: options.parentPlanId ?? null,
    }
  }

  const insertedPlanId = (data as { plan_id: string }).plan_id
  const supersedePlanIds = uniqueStrings(options.supersedePlanIds ?? []).filter(
    (planId) => planId !== insertedPlanId,
  )

  if (supersedePlanIds.length > 0) {
    const { error: supersedeError } = await writer
      .from('compiled_plans')
      .update({ status: 'superseded' })
      .eq('user_id', options.userId)
      .in('plan_id', supersedePlanIds)

    if (supersedeError) {
      return {
        synced: true,
        message: `compiled_plans は保存しましたが旧プランの supersede に失敗しました: ${supersedeError.message}`,
        planId: insertedPlanId,
        parentPlanId: options.parentPlanId ?? null,
      }
    }
  }

  return {
    synced: true,
    message: null,
    planId: insertedPlanId,
    parentPlanId: options.parentPlanId ?? null,
  }
}
