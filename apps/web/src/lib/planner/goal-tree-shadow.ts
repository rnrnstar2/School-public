import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  buildCoverageIndex,
} from '../../../../../packages/goal-action/coverage/src/build'
import {
  COVERAGE_INDEX_SCHEMA_VERSION,
  CoverageIndexSchema,
  type CoverageIndex,
} from '../../../../../packages/goal-action/coverage/src/schema'
import { matchActions } from '../../../../../packages/goal-action/matcher/src/match'
import type { ActionLessonMapping } from '../../../../../packages/goal-action/matcher/src/schema'
import {
  normalizeActions,
} from '../../../../../packages/goal-action/normalizer/src/normalize'
import type { CanonicalAction } from '../../../../../packages/goal-action/normalizer/src/schema'

import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import {
  createGoal,
  insertGoalContexts,
  insertGoalNodeLessonMatches,
  insertGoalNodes,
  insertProposedActions,
  type GoalContextInsert,
  type GoalNodeInsert,
  type GoalNodeLessonMatchInsert,
  type ProposedActionInsert,
} from '@/lib/supabase/decision-ledger'
import { createServiceClient } from '@/lib/supabase/service'

type ShadowLearnerState = {
  skillLevel?: string | null
  blockers?: string[]
  signals?: unknown
}

export interface GoalTreeShadowWriteInput {
  userId?: string | null
  goal: string
  goalTags?: string[]
  personaIds?: string[]
  learnerState?: ShadowLearnerState
  planId: string | null
  planSeed: string | null
  atomPlan: AtomCompiledPlan
}

type CoverageSnapshotRecord = {
  id: string
  coverageIndex: CoverageIndex
}

type CoverageSnapshotInsert = {
  schema_version: string
  content_hash: string
  built_at: string
  payload: Record<string, unknown>
}

type CoverageSnapshotSelectResult = Promise<{
  data: { id: string; payload: unknown } | null
  error: { message: string } | null
}>

type CoverageSnapshotInsertResult = Promise<{
  data: { id: string } | null
  error: { message: string } | null
}>

type CoverageSnapshotSelectBuilder = {
  eq: (
    column: 'schema_version',
    value: typeof COVERAGE_INDEX_SCHEMA_VERSION,
  ) => {
    order: (
      column: 'built_at',
      options: { ascending: boolean },
    ) => {
      limit: (count: number) => {
        maybeSingle: () => CoverageSnapshotSelectResult
      }
    }
  }
}

type CoverageSnapshotsClient = {
  from: (table: 'coverage_index_snapshots') => {
    select: (columns: 'id, payload') => CoverageSnapshotSelectBuilder
    insert: (input: CoverageSnapshotInsert) => {
      select: (columns: 'id') => {
        single: () => CoverageSnapshotInsertResult
      }
    }
  }
}

type ShadowLeafNode = {
  goalNodeId: string
  step: AtomCompiledPlan['steps'][number]
  canonicalAction: CanonicalAction
}

function withGoalNodeDefaults(row: GoalNodeInsert): GoalNodeInsert {
  return {
    ...row,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'unknown error'
}

export function isG2AShadowWriteEnabled() {
  const flag = process.env.G2A_SHADOW_WRITE_ENABLED?.trim().toLowerCase()
  return flag !== 'off' && flag !== '0' && flag !== 'false'
}

function buildGoalMetadata(input: GoalTreeShadowWriteInput) {
  return {
    source: 'g2a_shadow_v2',
    plan_id: input.planId,
    plan_seed: input.planSeed,
    goal_tags: input.atomPlan.goalTags,
    persona_ids: input.personaIds ?? [],
    plan_source: input.atomPlan.source,
    plan_rationale: input.atomPlan.rationale,
    coverage_score: input.atomPlan.coverageScore,
    unsupported_capabilities: input.atomPlan.unsupportedCapabilities,
  }
}

function buildGoalContextRows(params: {
  goalId: string
  input: GoalTreeShadowWriteInput
}): GoalContextInsert[] {
  const learnerState = {
    skillLevel: params.input.learnerState?.skillLevel ?? null,
    blockers: params.input.learnerState?.blockers ?? [],
    signals: params.input.learnerState?.signals ?? {},
  }

  return [
    {
      goal_id: params.goalId,
      source_type: 'other',
      content: params.input.goal,
      metadata: {
        kind: 'goal_input',
        goal_tags: params.input.goalTags ?? params.input.atomPlan.goalTags,
        persona_ids: params.input.personaIds ?? [],
      },
    },
    {
      goal_id: params.goalId,
      source_type: 'other',
      content: JSON.stringify(learnerState),
      metadata: {
        kind: 'learner_state',
      },
    },
    {
      goal_id: params.goalId,
      source_type: 'other',
      content: params.input.atomPlan.rationale,
      metadata: {
        kind: 'compiled_plan',
        plan_id: params.input.planId,
        source: params.input.atomPlan.source,
        coverage_score: params.input.atomPlan.coverageScore,
      },
    },
  ]
}

function mapCanonicalActionType(capability: CanonicalAction['capability']) {
  switch (capability) {
    case 'research':
    case 'plan':
    case 'measure':
      return 'analysis' as const
    default:
      return 'task' as const
  }
}

function formatMatchRationale(mapping: ActionLessonMapping) {
  const { capability, prerequisite, blocker, evidence } = mapping.breakdown
  return `capability=${capability.toFixed(4)}, prerequisite=${prerequisite.toFixed(4)}, blocker=${blocker.toFixed(4)}, evidence=${evidence.toFixed(4)}`
}

function toEstimatedEffortHours(estimatedMinutes: number) {
  return Number((estimatedMinutes / 60).toFixed(2))
}

function toCoverageInsertPayload(snapshot: CoverageSnapshotRecord) {
  return {
    schema_version: snapshot.coverageIndex.schema_version,
    content_hash: snapshot.coverageIndex.content_hash,
    built_at: snapshot.coverageIndex.built_at,
    payload: snapshot.coverageIndex as unknown as Record<string, unknown>,
  }
}

async function dirExists(absPath: string) {
  try {
    const stat = await fs.stat(absPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function resolveFirstExistingDir(candidates: string[]) {
  for (const candidate of candidates) {
    if (await dirExists(candidate)) {
      return candidate
    }
  }

  return null
}

async function buildCoverageSnapshotRecord(): Promise<CoverageSnapshotRecord> {
  const cwd = process.cwd()
  const factoryDir = await resolveFirstExistingDir([
    path.join(cwd, 'lesson-factory', 'lessons', 'atoms'),
    path.join(cwd, '..', '..', 'lesson-factory', 'lessons', 'atoms'),
  ])

  if (!factoryDir) {
    throw new Error('lesson-factory/lessons/atoms directory could not be resolved')
  }

  const legacyAtomDir = await resolveFirstExistingDir([
    path.join(cwd, 'apps', 'web', 'src', 'data', 'atoms'),
    path.join(cwd, 'src', 'data', 'atoms'),
  ])

  const coverageIndex = await buildCoverageIndex({
    atomSources: legacyAtomDir ? [{ dir: legacyAtomDir }] : [],
    factorySources: [{ dir: factoryDir }],
    builtAt: new Date().toISOString(),
  })

  return {
    id: randomUUID(),
    coverageIndex,
  }
}

async function getLatestCoverageSnapshot(client: NonNullable<ReturnType<typeof createServiceClient>>) {
  const snapshotsClient = client as unknown as CoverageSnapshotsClient
  const { data, error } = await snapshotsClient
    .from('coverage_index_snapshots')
    .select('id, payload')
    .eq('schema_version', COVERAGE_INDEX_SCHEMA_VERSION)
    .order('built_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`coverage_index_snapshots lookup failed: ${error.message}`)
  }

  if (!data) {
    const created = await buildCoverageSnapshotRecord()
    const insertResult = await snapshotsClient
      .from('coverage_index_snapshots')
      .insert(toCoverageInsertPayload(created))
      .select('id')
      .single()

    if (insertResult.error || !insertResult.data) {
      throw new Error(
        `coverage_index_snapshots insert failed: ${insertResult.error?.message ?? 'unknown error'}`,
      )
    }

    return {
      id: (insertResult.data as { id: string }).id,
      coverageIndex: created.coverageIndex,
    }
  }

  try {
    return {
      id: (data as { id: string }).id,
      coverageIndex: CoverageIndexSchema.parse((data as { payload: unknown }).payload),
    }
  } catch {
    const rebuilt = await buildCoverageSnapshotRecord()
    const insertResult = await snapshotsClient
      .from('coverage_index_snapshots')
      .insert(toCoverageInsertPayload(rebuilt))
      .select('id')
      .single()

    if (insertResult.error || !insertResult.data) {
      throw new Error(
        `coverage_index_snapshots repair insert failed: ${insertResult.error?.message ?? 'unknown error'}`,
      )
    }

    return {
      id: (insertResult.data as { id: string }).id,
      coverageIndex: rebuilt.coverageIndex,
    }
  }
}

export async function runGoalTreeShadowWrite(
  input: GoalTreeShadowWriteInput,
): Promise<void> {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const goalResult = await createGoal({
    user_id: input.userId ?? null,
    title: input.goal,
    description: input.atomPlan.rationale,
    metadata: buildGoalMetadata(input),
  })

  if (goalResult.error || !goalResult.data) {
    throw new Error(goalResult.error ?? 'decision_ledger.goals insert failed')
  }

  const goalId = goalResult.data.id
  const objectiveNodeId = randomUUID()
  const milestoneNodeIds = new Map<string, string>()
  const goalNodeRows: GoalNodeInsert[] = [
    withGoalNodeDefaults({
      id: objectiveNodeId,
      goal_id: goalId,
      parent_node_id: null,
      label: input.goal,
      node_type: 'objective',
      sort_order: 0,
      metadata: {
        source: 'g2a_shadow_v2',
        goal_tags: input.atomPlan.goalTags,
        unsupported_capabilities: input.atomPlan.unsupportedCapabilities,
      },
    }),
  ]

  input.atomPlan.milestones.forEach((milestone, index) => {
    const milestoneNodeId = randomUUID()
    milestoneNodeIds.set(milestone.id, milestoneNodeId)
    goalNodeRows.push(withGoalNodeDefaults({
      id: milestoneNodeId,
      goal_id: goalId,
      parent_node_id: objectiveNodeId,
      label: milestone.title,
      node_type: 'milestone',
      sort_order: index,
      metadata: {
        description: milestone.description,
        atom_ids: milestone.atomIds,
      },
    }))
  })

  const leafNodes: ShadowLeafNode[] = input.atomPlan.steps.map((step, index) => {
    const goalNodeId = randomUUID()
    const normalized = normalizeActions({
      goal: input.goal,
      rawActions: [
        {
          id: `goal-node:${goalNodeId}`,
          title: step.title,
          description: step.rationale,
          blockers: input.learnerState?.blockers ?? [],
        },
      ],
    })[0]

    goalNodeRows.push(withGoalNodeDefaults({
      id: goalNodeId,
      goal_id: goalId,
      parent_node_id: step.milestoneId
        ? milestoneNodeIds.get(step.milestoneId) ?? objectiveNodeId
        : objectiveNodeId,
      label: step.title,
      node_type: 'task',
      sort_order: index,
      metadata: {
        source: 'g2a_shadow_v2',
        planner_selected_lesson_id: step.atomId,
        milestone_id: step.milestoneId,
        rationale: step.rationale,
        estimated_minutes: step.estimatedMinutes,
        prerequisite_atom_ids: step.prerequisiteAtomIds,
        soft_prerequisite_atom_ids: step.softPrerequisiteAtomIds,
        canonical_action: normalized,
      },
    }))

    return {
      goalNodeId,
      step,
      canonicalAction: normalized,
    }
  })

  const goalNodesResult = await insertGoalNodes(client, goalNodeRows)
  if (goalNodesResult.error) {
    throw new Error(goalNodesResult.error)
  }

  const goalContextsResult = await insertGoalContexts(
    client,
    buildGoalContextRows({ goalId, input }),
  )
  if (goalContextsResult.error) {
    throw new Error(goalContextsResult.error)
  }

  const proposedActionRows: ProposedActionInsert[] = leafNodes.map((leafNode) => ({
    goal_id: goalId,
    node_id: leafNode.goalNodeId,
    title: leafNode.step.title,
    description: leafNode.step.rationale,
    action_type: mapCanonicalActionType(leafNode.canonicalAction.capability),
    rationale: leafNode.step.rationale,
    estimated_effort_hours: toEstimatedEffortHours(leafNode.step.estimatedMinutes),
    metadata: {
      source: 'g2a_shadow_v2',
      canonical_action: leafNode.canonicalAction,
      planner_selected_lesson_id: leafNode.step.atomId,
      milestone_id: leafNode.step.milestoneId,
    },
  }))

  const proposedActionsResult = await insertProposedActions(client, proposedActionRows)
  if (proposedActionsResult.error) {
    throw new Error(proposedActionsResult.error)
  }

  if (leafNodes.length === 0) {
    return
  }

  const coverageSnapshot = await getLatestCoverageSnapshot(client)
  const leafNodeByActionId = new Map(
    leafNodes.map((leafNode) => [leafNode.canonicalAction.actionId, leafNode] as const),
  )
  const mappings: ActionLessonMapping[] = matchActions({
    actions: leafNodes.map((leafNode) => leafNode.canonicalAction),
    coverageIndex: coverageSnapshot.coverageIndex,
    topK: 3,
  })

  const matchRows: GoalNodeLessonMatchInsert[] = mappings.flatMap((mapping) => {
    const leafNode = leafNodeByActionId.get(mapping.action.actionId)
    if (!leafNode) {
      return []
    }

    return [
      {
        goal_node_id: leafNode.goalNodeId,
        lesson_id: mapping.lesson.id,
        lesson_version_id: null,
        score: Number(mapping.score.toFixed(4)),
        rationale: formatMatchRationale(mapping),
        selected: mapping.lesson.id === leafNode.step.atomId,
        coverage_snapshot_id: coverageSnapshot.id,
      },
    ]
  })

  for (const leafNode of leafNodes) {
    const hasSelectedRow = matchRows.some(
      (row) =>
        row.goal_node_id === leafNode.goalNodeId &&
        row.lesson_id === leafNode.step.atomId,
    )

    if (!hasSelectedRow) {
      matchRows.push({
        goal_node_id: leafNode.goalNodeId,
        lesson_id: leafNode.step.atomId,
        lesson_version_id: null,
        score: 1,
        rationale: 'planner_selected_atom',
        selected: true,
        coverage_snapshot_id: coverageSnapshot.id,
      })
    }
  }

  const matchesResult = await insertGoalNodeLessonMatches(client, matchRows)
  if (matchesResult.error) {
    throw new Error(matchesResult.error)
  }
}

export function formatGoalTreeShadowError(error: unknown) {
  return toErrorMessage(error)
}
