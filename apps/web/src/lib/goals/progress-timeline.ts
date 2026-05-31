import { fetchAtomsByIds } from '@/lib/atoms/atom-repository'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  GoalProgressTimelineActor,
  GoalProgressTimelineEvent,
} from '@/types/goal-tree'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalContextRow = Database['decision_ledger']['Tables']['goal_contexts']['Row']
type GoalNodeLessonMatchRow =
  Database['decision_ledger']['Tables']['goal_node_lesson_matches']['Row']
type SelectedGoalNodeLessonMatchRow = GoalNodeLessonMatchRow & { selected: true }
type CompiledPlanRow = Database['public']['Tables']['compiled_plans']['Row']
type TaskProgressRow = Database['public']['Tables']['task_progress']['Row']
type CompletedTaskProgressRow = TaskProgressRow & { completed_at: string }
type UserProgressRow = Database['public']['Tables']['user_progress']['Row']
type TelemetryEventRow = Database['public']['Tables']['telemetry_events']['Row']
type CompiledPlanLineageRow = Pick<
  CompiledPlanRow,
  'plan_id' | 'parent_plan_id' | 'created_at'
>
type LessonCompletionRow = {
  id: string
  lesson_id: string
  occurred_at: string
}

type UntypedQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  neq: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  not: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  in: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  maybeSingle: () => Promise<{
    data: TRow | null
    error: { message: string } | null
  }>
  then: PromiseLike<{
    data: TRow[] | null
    error: { message: string } | null
  }>['then']
}

type UntypedLedgerSchemaClient = {
  from: <TRow = Record<string, unknown>>(table: string) => UntypedQueryBuilder<TRow>
}

export type ProgressTimelineLookupResult =
  | { kind: 'ok'; data: GoalProgressTimelineEvent[] }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 50
const MIN_SOURCE_LIMIT = 30

const ICON_BY_ACTOR: Record<GoalProgressTimelineActor, string> = {
  user: '👤',
  ai: '🤖',
  codex: '⚡',
  claude: '🧠',
}

const NODE_STATUS_LABELS: Record<string, string> = {
  in_progress: 'Node started',
  done: 'Node completed',
  blocked: 'Node blocked',
  skipped: 'Node skipped',
}

function getDecisionLedgerSchemaClient(client: ServiceClient): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'progress timeline lookup failed'
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.trunc(limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
}

function getSourceLimit(limit: number) {
  return Math.min(Math.max(limit, MIN_SOURCE_LIMIT), MAX_LIMIT)
}

function trimToNull(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function truncate(value: string | null | undefined, max = 160) {
  const normalized = trimToNull(value)
  if (!normalized) {
    return null
  }

  return normalized.length > max
    ? `${normalized.slice(0, max - 3)}...`
    : normalized
}

function toRecord(value: Json | Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function readString(
  value: Json | Record<string, unknown> | null | undefined,
  key: string,
) {
  const candidate = toRecord(value)[key]
  return typeof candidate === 'string' ? candidate : null
}

function humanizeSourceType(sourceType: string) {
  return sourceType.replace(/_/g, ' ')
}

function toActor(value: string | null | undefined): GoalProgressTimelineActor {
  switch (value) {
    case 'codex':
      return 'codex'
    case 'claude':
    case 'claude_code':
      return 'claude'
    case 'ai':
      return 'ai'
    default:
      return 'user'
  }
}

function resolveContextActor(context: GoalContextRow): GoalProgressTimelineActor {
  const metadata = toRecord(context.metadata)
  const agent = readString(metadata, 'agent')

  if (agent) {
    return toActor(agent)
  }

  if (
    context.source_type === 'ai_delegation_brief'
    || context.source_type === 'agent_delegation_brief'
    || context.source_type.startsWith('ai_')
  ) {
    return 'ai'
  }

  return 'user'
}

function resolveNodeActor(node: GoalNodeRow): GoalProgressTimelineActor {
  return node.owner_type === 'user' ? 'user' : 'ai'
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function loadGoal(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
) {
  const { data, error } = await ledger
    .from<GoalRow>('goals')
    .select('*')
    .eq('id', goalId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function loadGoalContexts(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
  limit: number,
) {
  const { data, error } = await ledger
    .from<GoalContextRow>('goal_contexts')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

async function loadGoalNodes(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
  limit: number,
) {
  const { data, error } = await ledger
    .from<GoalNodeRow>('goal_nodes')
    .select('*')
    .eq('goal_id', goalId)
    .neq('status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

async function loadSelectedLessonMatches(
  ledger: UntypedLedgerSchemaClient,
  nodeIds: string[],
  limit: number,
) {
  if (nodeIds.length === 0) {
    return [] as SelectedGoalNodeLessonMatchRow[]
  }

  const { data, error } = await ledger
    .from<GoalNodeLessonMatchRow>('goal_node_lesson_matches')
    .select('*')
    .in('goal_node_id', nodeIds)
    .eq('selected', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => ({
    ...row,
    selected: true as const,
  }))
}

function resolveGoalPlanId(goal: GoalRow, goalContexts: GoalContextRow[]) {
  const metadataPlanId = readString(goal.metadata, 'plan_id')
  if (metadataPlanId) {
    return metadataPlanId
  }

  for (const context of goalContexts) {
    const contextPlanId = readString(context.metadata, 'plan_id')
    if (contextPlanId) {
      return contextPlanId
    }
  }

  return null
}

async function loadPlanIds(
  client: ServiceClient,
  userId: string,
  goal: GoalRow,
  goalContexts: GoalContextRow[],
  limit: number,
) {
  const currentPlanId = resolveGoalPlanId(goal, goalContexts)
  if (!currentPlanId) {
    return [] as string[]
  }

  const { data, error } = await client
    .from('compiled_plans')
    .select('plan_id, parent_plan_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  const planRows = [...((data ?? []) as CompiledPlanLineageRow[])]
  const planRowById = new Map(planRows.map((row) => [row.plan_id, row] as const))

  if (!planRowById.has(currentPlanId)) {
    const { data: currentPlan, error: currentPlanError } = await client
      .from('compiled_plans')
      .select('plan_id, parent_plan_id, created_at')
      .eq('user_id', userId)
      .eq('plan_id', currentPlanId)
      .maybeSingle()

    if (currentPlanError) {
      throw new Error(currentPlanError.message)
    }

    if (currentPlan) {
      const row = currentPlan as CompiledPlanLineageRow
      planRows.push(row)
      planRowById.set(row.plan_id, row)
    }
  }

  const childPlanIdsByParentId = new Map<string, string[]>()
  for (const row of planRows) {
    if (!row.parent_plan_id) {
      continue
    }

    const childPlanIds = childPlanIdsByParentId.get(row.parent_plan_id) ?? []
    childPlanIds.push(row.plan_id)
    childPlanIdsByParentId.set(row.parent_plan_id, childPlanIds)
  }

  const connectedPlanIds = new Set<string>()
  const queue = [currentPlanId]

  while (queue.length > 0 && connectedPlanIds.size < limit) {
    const planId = queue.shift()
    if (!planId || connectedPlanIds.has(planId)) {
      continue
    }

    connectedPlanIds.add(planId)
    const row = planRowById.get(planId)
    if (row?.parent_plan_id && !connectedPlanIds.has(row.parent_plan_id)) {
      queue.push(row.parent_plan_id)
    }

    for (const childPlanId of childPlanIdsByParentId.get(planId) ?? []) {
      if (!connectedPlanIds.has(childPlanId)) {
        queue.push(childPlanId)
      }
    }
  }

  const orderedPlanIds = planRows
    .filter((row) => connectedPlanIds.has(row.plan_id))
    .sort((left, right) => toTimestamp(right.created_at) - toTimestamp(left.created_at))
    .map((row) => row.plan_id)

  if (!orderedPlanIds.includes(currentPlanId)) {
    orderedPlanIds.unshift(currentPlanId)
  }

  return orderedPlanIds.slice(0, limit)
}

async function loadTaskProgressRows(
  client: ServiceClient,
  planIds: string[],
  limit: number,
) {
  if (planIds.length === 0) {
    return [] as CompletedTaskProgressRow[]
  }

  const { data, error } = await client
    .from('task_progress')
    .select('*')
    .in('plan_id', planIds)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).filter(
    (row): row is CompletedTaskProgressRow => typeof row.completed_at === 'string',
  )
}

async function loadLessonCompletionRows(
  client: ServiceClient,
  userId: string,
  planIds: string[],
  lessonIds: string[],
  limit: number,
) {
  if (lessonIds.length > 0) {
    const { data, error } = await client
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', true)
      .in('lesson_id', lessonIds)
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (!error) {
      const userProgressRows = (data ?? [])
        .filter((row): row is UserProgressRow & { lesson_id: string; completed_at: string } =>
          Boolean(row.lesson_id && row.completed_at),
        )
        .map((row) => ({
          id: row.id,
          lesson_id: row.lesson_id,
          occurred_at: row.completed_at,
        })) satisfies LessonCompletionRow[]

      if (userProgressRows.length > 0) {
        return userProgressRows
      }
    }

    if (error && !/invalid input syntax for type uuid|relation .* does not exist/i.test(error.message)) {
      throw new Error(error.message)
    }
  }

  if (planIds.length === 0) {
    return [] as LessonCompletionRow[]
  }

  const { data, error } = await client
    .from('telemetry_events')
    .select('*')
    .eq('user_id', userId)
    .eq('event_name', 'lesson_completed')
    .in('plan_id', planIds)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .filter((row): row is TelemetryEventRow & { atom_id: string } => Boolean(row.atom_id))
    .map((row) => ({
      id: row.event_id,
      lesson_id: row.atom_id,
      occurred_at: row.occurred_at,
    })) satisfies LessonCompletionRow[]
}

function collectGoalLessonIds(
  nodes: GoalNodeRow[],
  selectedLessonMatches: SelectedGoalNodeLessonMatchRow[],
  taskProgressRows: CompletedTaskProgressRow[],
) {
  const lessonIds = new Set<string>()

  for (const row of selectedLessonMatches) {
    if (row.lesson_id) {
      lessonIds.add(row.lesson_id)
    }
  }

  for (const node of nodes) {
    const plannerLessonId = readString(node.metadata, 'planner_selected_lesson_id')
    if (plannerLessonId) {
      lessonIds.add(plannerLessonId)
    }
  }

  for (const row of taskProgressRows) {
    for (const lessonId of row.relevant_lesson_ids ?? []) {
      const normalized = lessonId.trim()
      if (normalized) {
        lessonIds.add(normalized)
      }
    }
  }

  return Array.from(lessonIds)
}

function buildContextEvents(
  goalContexts: GoalContextRow[],
  nodeLabelById: Map<string, string>,
) {
  return goalContexts.map((context): GoalProgressTimelineEvent => {
    const actor = resolveContextActor(context)
    const nodeLabel = context.node_id
      ? nodeLabelById.get(context.node_id) ?? context.node_id
      : null
    const contentPreview = truncate(context.content)

    return {
      id: `goal_context:${context.id}`,
      type: 'goal_context',
      actor,
      icon: ICON_BY_ACTOR[actor],
      label: `Context: ${humanizeSourceType(context.source_type)}`,
      description: nodeLabel && contentPreview
        ? `${nodeLabel} · ${contentPreview}`
        : nodeLabel ?? contentPreview,
      occurred_at: context.created_at,
    }
  })
}

function buildNodeEvents(nodes: GoalNodeRow[]) {
  return nodes.flatMap((node): GoalProgressTimelineEvent[] => {
    const label = NODE_STATUS_LABELS[node.status]
    if (!label) {
      return []
    }

    const actor = resolveNodeActor(node)

    return [{
      id: `goal_node_status:${node.id}:${node.updated_at}`,
      type: 'goal_node_status',
      actor,
      icon: ICON_BY_ACTOR[actor],
      label,
      description: node.label,
      occurred_at: node.updated_at,
    }]
  })
}

function buildTaskProgressEvents(taskProgressRows: CompletedTaskProgressRow[]) {
  return taskProgressRows.map((row): GoalProgressTimelineEvent => ({
      id: `task_progress:${row.id}`,
      type: 'task_progress',
      actor: 'user',
      icon: ICON_BY_ACTOR.user,
      label: 'Task completed',
      description: trimToNull(row.title) ?? row.task_id,
      occurred_at: row.completed_at,
    }))
}

function buildLessonCompletionEvents(
  lessonCompletions: LessonCompletionRow[],
  lessonTitleById: Map<string, string>,
) {
  return lessonCompletions.map((row): GoalProgressTimelineEvent => ({
      id: `lesson_completion:${row.id}`,
      type: 'lesson_completion',
      actor: 'user',
      icon: ICON_BY_ACTOR.user,
      label: 'Lesson completed',
      description: lessonTitleById.get(row.lesson_id) ?? row.lesson_id,
      occurred_at: row.occurred_at,
    }))
}

export async function listProgressTimelineForGoal(
  userId: string,
  goalId: string,
  options: { limit?: number } = {},
): Promise<ProgressTimelineLookupResult> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
    }

    const limit = normalizeLimit(options.limit)
    const sourceLimit = getSourceLimit(limit)
    const ledger = getDecisionLedgerSchemaClient(client)
    const goal = await loadGoal(ledger, goalId)

    if (!goal) {
      return { kind: 'not_found' }
    }

    if (goal.user_id !== userId) {
      return { kind: 'forbidden' }
    }

    const [goalContexts, nodes] = await Promise.all([
      loadGoalContexts(ledger, goal.id, sourceLimit),
      loadGoalNodes(ledger, goal.id, sourceLimit),
    ])
    const planIds = await loadPlanIds(client, userId, goal, goalContexts, sourceLimit)

    const nodeLabelById = new Map(nodes.map((node) => [node.id, node.label]))
    const [selectedLessonMatches, taskProgressRows] = await Promise.all([
      loadSelectedLessonMatches(
        ledger,
        nodes.map((node) => node.id),
        sourceLimit,
      ),
      loadTaskProgressRows(client, planIds, sourceLimit),
    ])

    const lessonIds = collectGoalLessonIds(nodes, selectedLessonMatches, taskProgressRows)
    const [lessonCompletions, atoms] = await Promise.all([
      loadLessonCompletionRows(client, userId, planIds, lessonIds, sourceLimit),
      lessonIds.length > 0 ? fetchAtomsByIds(lessonIds) : Promise.resolve([]),
    ])

    const lessonTitleById = new Map(atoms.map((atom) => [atom.atomId, atom.title]))
    const events = [
      ...buildContextEvents(goalContexts, nodeLabelById),
      ...buildNodeEvents(nodes),
      ...buildTaskProgressEvents(taskProgressRows),
      ...buildLessonCompletionEvents(lessonCompletions, lessonTitleById),
    ]
      .sort((left, right) => {
        const delta = toTimestamp(right.occurred_at) - toTimestamp(left.occurred_at)
        return delta !== 0 ? delta : right.id.localeCompare(left.id)
      })
      .slice(0, limit)

    return {
      kind: 'ok',
      data: events,
    }
  } catch (error) {
    return {
      kind: 'error',
      message: toErrorMessage(error),
    }
  }
}
