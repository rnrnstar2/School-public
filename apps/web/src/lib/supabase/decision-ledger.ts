// Repository layer for the Decision Ledger tables defined in
// apps/web/supabase/migrations/20260416000000_decision_ledger.sql.
//
// Most functions use the service-role client from `@/lib/supabase/service`;
// they bypass RLS by design. Owner inbox UI reads/writes now flow through
// anon/session view + RPC paths, but the repository helpers remain for
// worker, cron, and legacy server-action call sites.

import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/supabase/database.types'
import type { ApiResponse } from '@/types'
import type {
  GoalTreeGoal,
  GoalTreeNode,
  GoalTreeOwnerType,
  GoalTreeSelectedLesson,
} from '@/types/goal-tree'

type DecisionLedgerTables = Database['decision_ledger']['Tables']
type OverrideGenerated<TBase, TOverrides> = Omit<TBase, keyof TOverrides> & TOverrides

type LedgerClient = NonNullable<ReturnType<typeof createServiceClient>>
type UntypedLedgerResult<TRow> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>
type UntypedLedgerListResult<TRow> = Promise<{
  data: TRow[] | null
  error: { message: string } | null
}>
type UntypedLedgerQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  insert: (input: unknown) => {
    select: () => UntypedLedgerListResult<TRow>
  }
  upsert: (
    input: unknown,
    options: { onConflict: string }
  ) => {
    select: () => {
      single: () => UntypedLedgerResult<TRow>
    }
  }
  update: (input: unknown) => UntypedLedgerQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  in: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  is: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  maybeSingle: () => UntypedLedgerResult<TRow>
  single: () => UntypedLedgerResult<TRow>
  then: PromiseLike<{
    data: TRow[] | null
    error: { message: string } | null
  }>['then']
}
type UntypedLedgerSchemaClient = {
  from: <TRow = Record<string, unknown>>(
    table: string
  ) => UntypedLedgerQueryBuilder<TRow>
}

export type GoalRow = DecisionLedgerTables['goals']['Row']
export type GoalInsert = DecisionLedgerTables['goals']['Insert']

export type GoalNodeRow = DecisionLedgerTables['goal_nodes']['Row']
export type GoalNodeInsert = DecisionLedgerTables['goal_nodes']['Insert']

export type GoalContextRow = DecisionLedgerTables['goal_contexts']['Row']
export type GoalContextInsert = DecisionLedgerTables['goal_contexts']['Insert']

export type ProposedActionRow = DecisionLedgerTables['proposed_actions']['Row']
export type ProposedActionInsert = DecisionLedgerTables['proposed_actions']['Insert']

export type GoalNodeLessonMatchRow =
  DecisionLedgerTables['goal_node_lesson_matches']['Row']
export type GoalNodeLessonMatchInsert =
  DecisionLedgerTables['goal_node_lesson_matches']['Insert']
export type GoalNodeWithSelectedLesson = GoalTreeNode
export type GoalWithNodes = GoalTreeGoal

export type ScheduleSlotRow = DecisionLedgerTables['schedule_slots']['Row']
export type ScheduleSlotInsert = DecisionLedgerTables['schedule_slots']['Insert']

export type AgentRunRow = DecisionLedgerTables['agent_runs']['Row']
export type AgentRunInsert = DecisionLedgerTables['agent_runs']['Insert']

export type EvaluationRunRow = DecisionLedgerTables['evaluation_runs']['Row']
export type EvaluationRunInsert = DecisionLedgerTables['evaluation_runs']['Insert']

export type ApprovalGateType =
  | 'deploy'
  | 'migration'
  | 'schedule_confirm'
  | 'budget'
  | 'general'
  | 'lesson_proposal'
export type ApprovalGateStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
export type ApprovalGateRow = OverrideGenerated<
  DecisionLedgerTables['approval_gates']['Row'],
  {
    gate_type: ApprovalGateType
    status: ApprovalGateStatus
  }
>
export type ApprovalGateInsert = OverrideGenerated<
  DecisionLedgerTables['approval_gates']['Insert'],
  {
    gate_type?: ApprovalGateType
    status?: ApprovalGateStatus
  }
>

export type LessonPriority = 'high' | 'mid' | 'low'
export type LessonWeakestAxis =
  | 'capability'
  | 'prerequisite'
  | 'blocker'
  | 'evidence'
export type LessonDevProposalStatus =
  | 'proposed'
  | 'approved'
  | 'reserved'
  | 'rejected'
  | 'blocked'
  | 'in_factory'
  | 'addressed'
  | 'cancelled'
export type LessonGapStatus = 'open' | 'proposed' | 'addressed' | 'dismissed'

export type LessonDevProposalRow =
  OverrideGenerated<
    DecisionLedgerTables['lesson_dev_proposals']['Row'],
    {
      priority: LessonPriority
      status: LessonDevProposalStatus
      weakest_axis: LessonWeakestAxis
    }
  >
export type LessonDevProposalInsert =
  OverrideGenerated<
    DecisionLedgerTables['lesson_dev_proposals']['Insert'],
    {
      priority?: LessonPriority
      status?: LessonDevProposalStatus
      weakest_axis: LessonWeakestAxis
    }
  >

export type LessonGapRow = OverrideGenerated<
  DecisionLedgerTables['lesson_gaps']['Row'],
  {
    status: LessonGapStatus
    weakest_axis: LessonWeakestAxis
  }
>
export type LessonGapInsert = OverrideGenerated<
  DecisionLedgerTables['lesson_gaps']['Insert'],
  {
    status?: LessonGapStatus
    weakest_axis: LessonWeakestAxis
  }
>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return '不明なエラー'
}

function getUntypedLedgerSchemaClient(
  client: LedgerClient,
): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

async function insertIntoLedger<TInsert, TRow>(
  table: string,
  input: TInsert
): Promise<ApiResponse<TRow>> {
  const result = await insertRowsIntoLedger<TInsert, TRow>(
    createServiceClient(),
    table,
    [input],
  )

  if (result.error) {
    return { data: null, error: result.error }
  }

  const row = result.data?.[0] ?? null
  if (!row) {
    return {
      data: null,
      error: `insert into decision_ledger.${table} returned no row`,
    }
  }

  return { data: row, error: null }
}

async function insertRowIntoLedger<TInsert, TRow>(
  client: LedgerClient | null | undefined,
  table: string,
  input: TInsert,
): Promise<ApiResponse<TRow>> {
  const result = await insertRowsIntoLedger<TInsert, TRow>(
    client,
    table,
    [input],
  )

  if (result.error) {
    return { data: null, error: result.error }
  }

  const row = result.data?.[0] ?? null
  if (!row) {
    return {
      data: null,
      error: `insert into decision_ledger.${table} returned no row`,
    }
  }

  return { data: row, error: null }
}

async function insertRowsIntoLedger<TInsert, TRow>(
  client: LedgerClient | null | undefined,
  table: string,
  input: TInsert[],
): Promise<ApiResponse<TRow[]>> {
  try {
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }
    if (input.length === 0) {
      return { data: [], error: null }
    }

    // Keep the cast localized here so call sites can stay on generated row and
    // insert aliases while dynamic table dispatch remains generic.
    const schemaClient = (
      client as unknown as {
        schema: (name: string) => {
          from: (table: string) => {
            insert: (input: unknown) => {
              select: () => Promise<{
                data: TRow[] | null
                error: { message: string } | null
              }>
            }
          }
        }
      }
    ).schema('decision_ledger')

    const { data, error } = await schemaClient
      .from(table)
      .insert(input)
      .select()

    if (error) throw error
    return { data: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

type LessonGapSelectResult = Promise<{
  data: LessonGapRow | null
  error: { message: string } | null
}>

type LessonGapSchemaClient = {
  from: (table: 'lesson_gaps') => {
    insert: (input: LessonGapInsert) => {
      select: () => {
        single: () => LessonGapSelectResult
      }
    }
    select: (columns: string) => {
      eq: (column: 'action_id', value: string) => {
        is: (column: 'goal_id', value: null) => {
          maybeSingle: () => LessonGapSelectResult
        }
      }
    }
    update: (input: LessonGapInsert) => {
      eq: (column: 'id', value: string) => {
        select: () => {
          single: () => LessonGapSelectResult
        }
      }
    }
    upsert: (
      input: LessonGapInsert,
      options: { onConflict: string }
    ) => {
      select: () => {
        single: () => LessonGapSelectResult
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API (7 exports required by TQ-130 spec)
// ---------------------------------------------------------------------------

export async function createGoal(
  input: GoalInsert
): Promise<ApiResponse<GoalRow>> {
  return insertIntoLedger<GoalInsert, GoalRow>('goals', input)
}

export async function linkContext(
  input: GoalContextInsert
): Promise<ApiResponse<GoalContextRow>> {
  return insertIntoLedger<GoalContextInsert, GoalContextRow>(
    'goal_contexts',
    input
  )
}

export async function proposeAction(
  input: ProposedActionInsert
): Promise<ApiResponse<ProposedActionRow>> {
  return insertIntoLedger<ProposedActionInsert, ProposedActionRow>(
    'proposed_actions',
    input
  )
}

export async function insertGoalNodes(
  client: LedgerClient | null | undefined,
  rows: GoalNodeInsert[],
): Promise<ApiResponse<GoalNodeRow[]>> {
  return insertRowsIntoLedger<GoalNodeInsert, GoalNodeRow>(
    client,
    'goal_nodes',
    rows,
  )
}

export async function insertGoalContexts(
  client: LedgerClient | null | undefined,
  rows: GoalContextInsert[],
): Promise<ApiResponse<GoalContextRow[]>> {
  return insertRowsIntoLedger<GoalContextInsert, GoalContextRow>(
    client,
    'goal_contexts',
    rows,
  )
}

export async function insertProposedActions(
  client: LedgerClient | null | undefined,
  rows: ProposedActionInsert[],
): Promise<ApiResponse<ProposedActionRow[]>> {
  return insertRowsIntoLedger<ProposedActionInsert, ProposedActionRow>(
    client,
    'proposed_actions',
    rows,
  )
}

export async function insertGoalNodeLessonMatches(
  client: LedgerClient | null | undefined,
  rows: GoalNodeLessonMatchInsert[],
): Promise<ApiResponse<GoalNodeLessonMatchRow[]>> {
  return insertRowsIntoLedger<GoalNodeLessonMatchInsert, GoalNodeLessonMatchRow>(
    client,
    'goal_node_lesson_matches',
    rows,
  )
}

export async function listGoalsWithNodesForUser(
  userId: string,
): Promise<ApiResponse<GoalWithNodes[]>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const schemaClient = getUntypedLedgerSchemaClient(client)
    const { data: goals, error: goalsError } = await schemaClient
      .from<GoalRow>('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (goalsError) {
      throw goalsError
    }

    const goalRows = Array.isArray(goals) ? goals : []
    if (goalRows.length === 0) {
      return { data: [], error: null }
    }

    const goalIds = goalRows.map((goal) => goal.id)
    const { data: nodes, error: nodesError } = await schemaClient
      .from<GoalNodeRow>('goal_nodes')
      .select('*')
      .in('goal_id', goalIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (nodesError) {
      throw nodesError
    }

    const nodeRows = Array.isArray(nodes) ? nodes : []
    const nodeIds = nodeRows.map((node) => node.id)

    let selectedMatches: GoalNodeLessonMatchRow[] = []
    if (nodeIds.length > 0) {
      const { data: matches, error: matchesError } = await schemaClient
        .from<GoalNodeLessonMatchRow>('goal_node_lesson_matches')
        .select('*')
        .in('goal_node_id', nodeIds)
        .eq('selected', true)
        .order('goal_node_id', { ascending: true })
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })

      if (matchesError) {
        throw matchesError
      }

      selectedMatches = Array.isArray(matches) ? matches : []
    }

    const selectedLessonByNodeId = new Map<string, GoalTreeSelectedLesson>()
    for (const match of selectedMatches) {
      if (selectedLessonByNodeId.has(match.goal_node_id)) {
        console.warn(
          `[decision-ledger] multiple selected lesson matches found for goal_node_id=${match.goal_node_id}; using the first row`,
        )
        continue
      }

      selectedLessonByNodeId.set(match.goal_node_id, {
        lesson_id: match.lesson_id,
        score: match.score,
        rationale: match.rationale,
      })
    }

    const nodesByGoalId = new Map<string, GoalNodeWithSelectedLesson[]>()
    for (const node of nodeRows) {
      const current = nodesByGoalId.get(node.goal_id) ?? []
      current.push({
        id: node.id,
        parent_node_id: node.parent_node_id,
        label: node.label,
        node_type: node.node_type as GoalNodeWithSelectedLesson['node_type'],
        status: node.status as GoalNodeWithSelectedLesson['status'],
        sort_order: node.sort_order,
        owner_type: node.owner_type as GoalTreeOwnerType,
        depends_on_node_ids: [...node.depends_on_node_ids],
        fallback_node_id: node.fallback_node_id,
        selected_lesson: selectedLessonByNodeId.get(node.id) ?? null,
      })
      nodesByGoalId.set(node.goal_id, current)
    }

    return {
      data: goalRows.map((goal) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status as GoalWithNodes['status'],
        created_at: goal.created_at,
        deadline: goal.deadline,
        nodes: nodesByGoalId.get(goal.id) ?? [],
      })),
      error: null,
    }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function scheduleSlot(
  input: ScheduleSlotInsert
): Promise<ApiResponse<ScheduleSlotRow>> {
  return insertIntoLedger<ScheduleSlotInsert, ScheduleSlotRow>(
    'schedule_slots',
    input
  )
}

export async function recordAgentRun(
  input: AgentRunInsert
): Promise<ApiResponse<AgentRunRow>> {
  return insertIntoLedger<AgentRunInsert, AgentRunRow>('agent_runs', input)
}

export async function insertAgentRun(
  client: LedgerClient | null | undefined,
  input: AgentRunInsert,
): Promise<ApiResponse<AgentRunRow>> {
  return insertRowIntoLedger<AgentRunInsert, AgentRunRow>(
    client,
    'agent_runs',
    input,
  )
}

export async function recordEvaluation(
  input: EvaluationRunInsert
): Promise<ApiResponse<EvaluationRunRow>> {
  return insertIntoLedger<EvaluationRunInsert, EvaluationRunRow>(
    'evaluation_runs',
    input
  )
}

export async function insertEvaluationRun(
  client: LedgerClient | null | undefined,
  input: EvaluationRunInsert,
): Promise<ApiResponse<EvaluationRunRow>> {
  return insertRowIntoLedger<EvaluationRunInsert, EvaluationRunRow>(
    client,
    'evaluation_runs',
    input,
  )
}

export async function requestApproval(
  input: ApprovalGateInsert
): Promise<ApiResponse<ApprovalGateRow>> {
  return insertIntoLedger<ApprovalGateInsert, ApprovalGateRow>(
    'approval_gates',
    input
  )
}

export async function insertApprovalGate(
  input: ApprovalGateInsert,
): Promise<ApiResponse<ApprovalGateRow>> {
  return requestApproval(input)
}

export async function listPendingApprovalGates(
  kind?: ApprovalGateType,
): Promise<ApiResponse<ApprovalGateRow[]>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    let query = getUntypedLedgerSchemaClient(client)
      .from<ApprovalGateRow>('approval_gates')
      .select('*')
      .eq('status', 'pending')

    if (kind) {
      query = query.eq('gate_type', kind)
    }

    const { data, error } = await query.order('requested_at', {
      ascending: false,
    })

    if (error) throw error
    return { data: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function findLatestApprovalGateByProposalId(
  proposalId: string,
  kind: ApprovalGateType = 'lesson_proposal',
): Promise<ApiResponse<ApprovalGateRow>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const { data, error } = await getUntypedLedgerSchemaClient(client)
      .from<ApprovalGateRow>('approval_gates')
      .select('*')
      .eq('gate_type', kind)
      .eq('metadata->>lesson_dev_proposal_id', proposalId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function upsertLessonGap(
  input: LessonGapInsert
): Promise<ApiResponse<LessonGapRow>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const schemaClient = (
      client as unknown as {
        schema: (name: string) => LessonGapSchemaClient
      }
    ).schema('decision_ledger')
    const table = schemaClient.from('lesson_gaps')
    const { data, error } = await table
      .upsert(input, { onConflict: 'action_id,goal_id' })
      .select()
      .single()

    if (error) throw error
    if (!data) {
      throw new Error('upsert into decision_ledger.lesson_gaps returned no row')
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function updateLessonGapStatus(
  client: LedgerClient | null | undefined,
  id: string,
  status: LessonGapRow['status'],
): Promise<ApiResponse<LessonGapRow>> {
  try {
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const updatedAt = new Date().toISOString()
    const { data, error } = await getUntypedLedgerSchemaClient(client)
      .from<LessonGapRow>('lesson_gaps')
      .update({
        status,
        updated_at: updatedAt,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

/**
 * @deprecated Owner inbox rejection now uses the
 * `decision_ledger.reject_lesson_proposal` RPC so gap dismissal stays inside a
 * single transaction. Keep this helper only for legacy service-role paths
 * until the follow-up cleanup TQ removes it.
 */
export async function dismissLessonProposalGaps(
  gapIds: string[],
): Promise<ApiResponse<LessonGapRow[]>> {
  if (gapIds.length === 0) {
    return { data: [], error: null }
  }

  const client = createServiceClient()
  if (!client) {
    return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
  }

  const updates = await Promise.all(
    gapIds.map(async (gapId) => updateLessonGapStatus(client, gapId, 'dismissed')),
  )

  const firstError = updates.find((result) => result.error)?.error
  if (firstError) {
    return { data: null, error: firstError }
  }

  return {
    data: updates
      .map((result) => result.data)
      .filter((row): row is LessonGapRow => row !== null),
    error: null,
  }
}

// ---------------------------------------------------------------------------
// lesson_dev_proposals (TQ-137)
// ---------------------------------------------------------------------------

type LessonDevProposalSelectResult = Promise<{
  data: LessonDevProposalRow | null
  error: { message: string } | null
}>

type LessonDevProposalSchemaClient = {
  from: (table: 'lesson_dev_proposals') => {
    upsert: (
      input: LessonDevProposalInsert,
      options: { onConflict: string }
    ) => {
      select: () => {
        single: () => LessonDevProposalSelectResult
      }
    }
  }
}

export async function upsertLessonDevProposal(
  input: LessonDevProposalInsert
): Promise<ApiResponse<LessonDevProposalRow>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const schemaClient = (
      client as unknown as {
        schema: (name: string) => LessonDevProposalSchemaClient
      }
    ).schema('decision_ledger')
    const table = schemaClient.from('lesson_dev_proposals')
    const { data, error } = await table
      .upsert(input, { onConflict: 'capability_slug,outcome_slug' })
      .select()
      .single()

    if (error) throw error
    if (!data) {
      throw new Error(
        'upsert into decision_ledger.lesson_dev_proposals returned no row'
      )
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function getLessonDevProposalById(
  proposalId: string,
): Promise<ApiResponse<LessonDevProposalRow>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const { data, error } = await getUntypedLedgerSchemaClient(client)
      .from<LessonDevProposalRow>('lesson_dev_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

/**
 * @deprecated Owner inbox rejection now resolves linked gap IDs inside the
 * `decision_ledger.reject_lesson_proposal` RPC. Keep this helper only for
 * legacy service-role paths until the follow-up cleanup TQ removes it.
 */
export async function getLessonProposalGapIds(
  proposalId: string,
): Promise<ApiResponse<string[]>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const { data, error } = await getUntypedLedgerSchemaClient(client)
      .from<{ gap_ids?: unknown }>('lesson_dev_proposals')
      .select('gap_ids')
      .eq('id', proposalId)
      .single()

    if (error) throw error

    const gapIds = data?.gap_ids
    if (!Array.isArray(gapIds) || !gapIds.every((gapId) => typeof gapId === 'string')) {
      return {
        data: null,
        error: 'decision_ledger.lesson_dev_proposals.gap_ids is malformed',
      }
    }

    return { data: gapIds, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

export async function getLessonProposalIdForGate(
  gateId: string,
): Promise<ApiResponse<string>> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { data: null, error: SERVICE_CLIENT_UNAVAILABLE }
    }

    const { data, error } = await getUntypedLedgerSchemaClient(client)
      .from<{ metadata?: unknown }>('approval_gates')
      .select('metadata')
      .eq('id', gateId)
      .single()

    if (error) throw error

    const metadata = data?.metadata
    const proposalId =
      metadata
      && typeof metadata === 'object'
      && 'lesson_dev_proposal_id' in metadata
      && typeof metadata.lesson_dev_proposal_id === 'string'
        ? metadata.lesson_dev_proposal_id
        : null

    if (!proposalId) {
      return {
        data: null,
        error: 'decision_ledger.approval_gates.metadata.lesson_dev_proposal_id is missing',
      }
    }

    return { data: proposalId, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}
