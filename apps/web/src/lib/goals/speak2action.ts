import { insertGoalContexts, insertGoalNodes } from '@/lib/supabase/decision-ledger'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createServiceClient } from '@/lib/supabase/service'
import type { MentorChatStructuredOutput } from '@/types/mentor-chat'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalNodeInsert = Database['decision_ledger']['Tables']['goal_nodes']['Insert']
type GoalContextInsert = Database['decision_ledger']['Tables']['goal_contexts']['Insert']

type UntypedLedgerQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  is: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
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
  from: <TRow = Record<string, unknown>>(table: string) => UntypedLedgerQueryBuilder<TRow>
}

export interface Speak2ActionChatContext {
  nodeId?: string | null
  source?: string | null
}

export interface Speak2ActionCompileInput {
  goalId: string
  userId: string
  structuredOutput: MentorChatStructuredOutput
  chatContext?: Speak2ActionChatContext | null
}

export interface Speak2ActionCompileSuccess {
  kind: 'ok'
  ok: boolean
  inserted: {
    decisions: number
    openQuestions: number
    taskNodeId?: string
  }
  error: string[]
}

export type Speak2ActionCompileResult =
  | Speak2ActionCompileSuccess
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'

const CHAT_SOURCE_URI_RE = /^([a-z_]+):(\/.*|https?:\/\/.+)$/i

function getDecisionLedgerSchemaClient(client: ServiceClient): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

function trimToNull(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeItems(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function buildEmptyCompileSuccess(errors: string[] = []): Speak2ActionCompileSuccess {
  return {
    kind: 'ok',
    ok: errors.length === 0,
    inserted: {
      decisions: 0,
      openQuestions: 0,
      taskNodeId: undefined,
    },
    error: errors,
  }
}

function parseChatSource(source: string | null | undefined) {
  const normalized = trimToNull(source)

  if (!normalized) {
    return {
      chatSource: null,
      sourceUri: null,
      rawSource: null,
    }
  }

  if (/^(\/|https?:\/\/)/i.test(normalized)) {
    return {
      chatSource: 'chat',
      sourceUri: normalized,
      rawSource: normalized,
    }
  }

  const match = normalized.match(CHAT_SOURCE_URI_RE)
  if (match) {
    return {
      chatSource: match[1],
      sourceUri: match[2],
      rawSource: normalized,
    }
  }

  return {
    chatSource: normalized,
    sourceUri: null,
    rawSource: normalized,
  }
}

function buildContextMetadata(params: {
  kind: 'decision' | 'open_question'
  chatSource: string | null
  rawSource: string | null
  sourceUri: string | null
}): Record<string, Json> {
  return {
    source: 'speak2action',
    speak2action_kind: params.kind,
    chat_source: params.chatSource ?? 'chat',
    ...(params.rawSource ? { chat_context_source: params.rawSource } : {}),
    ...(params.sourceUri ? { source_uri: params.sourceUri } : {}),
  }
}

function buildTaskMetadata(params: {
  nextAction: string
  chatSource: string | null
  rawSource: string | null
  sourceUri: string | null
}): Record<string, Json> {
  return {
    source: 'speak2action',
    speak2action: true,
    speak2action_kind: 'next_action',
    next_action_preview: params.nextAction,
    chat_source: params.chatSource ?? 'chat',
    ...(params.rawSource ? { chat_context_source: params.rawSource } : {}),
    ...(params.sourceUri ? { source_uri: params.sourceUri } : {}),
  }
}

async function loadGoal(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
): Promise<GoalRow | null> {
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

async function loadGoalNode(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
  nodeId: string,
): Promise<GoalNodeRow | null> {
  const { data, error } = await ledger
    .from<GoalNodeRow>('goal_nodes')
    .select('*')
    .eq('goal_id', goalId)
    .eq('id', nodeId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function loadNextSortOrder(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
  parentNodeId: string | null,
): Promise<number> {
  let query = ledger
    .from<Pick<GoalNodeRow, 'sort_order'>>('goal_nodes')
    .select('sort_order')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: false })
    .limit(1)

  query = parentNodeId
    ? query.eq('parent_node_id', parentNodeId)
    : query.is('parent_node_id', null)

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const maxSortOrder = Array.isArray(data) && data[0]
    ? data[0].sort_order
    : -1

  return maxSortOrder + 1
}

export async function compileGoalChatOutput(
  input: Speak2ActionCompileInput,
): Promise<Speak2ActionCompileResult> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
    }

    const ledger = getDecisionLedgerSchemaClient(client)
    const goal = await loadGoal(ledger, input.goalId)

    if (!goal) {
      return { kind: 'not_found' }
    }

    if (goal.user_id !== input.userId) {
      return { kind: 'forbidden' }
    }

    const decisions = normalizeItems(input.structuredOutput.decisions)
    const openQuestions = normalizeItems(input.structuredOutput.open_questions)
    const nextAction = trimToNull(input.structuredOutput.next_action)

    if (decisions.length === 0 && openQuestions.length === 0 && !nextAction) {
      return buildEmptyCompileSuccess()
    }

    const errors: string[] = []
    const inserted = {
      decisions: 0,
      openQuestions: 0,
      taskNodeId: undefined as string | undefined,
    }

    const source = parseChatSource(input.chatContext?.source)
    let resolvedNodeId: string | null = null

    if (input.chatContext?.nodeId) {
      const parentNode = await loadGoalNode(ledger, goal.id, input.chatContext.nodeId)

      if (!parentNode) {
        return buildEmptyCompileSuccess(['chatContext.nodeId does not belong to this goal'])
      }

      resolvedNodeId = parentNode.id
    }

    for (const decision of decisions) {
      const row: GoalContextInsert = {
        goal_id: goal.id,
        node_id: resolvedNodeId,
        source_type: 'speak2action_decision',
        source_uri: source.sourceUri,
        content: decision,
        freshness_at: null,
        metadata: buildContextMetadata({
          kind: 'decision',
          chatSource: source.chatSource,
          rawSource: source.rawSource,
          sourceUri: source.sourceUri,
        }),
      }

      const result = await insertGoalContexts(client, [row])
      if (result.error) {
        errors.push(`decision "${decision}": ${result.error}`)
      } else {
        inserted.decisions += 1
      }
    }

    for (const openQuestion of openQuestions) {
      const row: GoalContextInsert = {
        goal_id: goal.id,
        node_id: resolvedNodeId,
        source_type: 'speak2action_open_question',
        source_uri: source.sourceUri,
        content: openQuestion,
        freshness_at: null,
        metadata: buildContextMetadata({
          kind: 'open_question',
          chatSource: source.chatSource,
          rawSource: source.rawSource,
          sourceUri: source.sourceUri,
        }),
      }

      const result = await insertGoalContexts(client, [row])
      if (result.error) {
        errors.push(`open_question "${openQuestion}": ${result.error}`)
      } else {
        inserted.openQuestions += 1
      }
    }

    if (nextAction) {
      try {
        const sortOrder = await loadNextSortOrder(ledger, goal.id, resolvedNodeId)
        const row: GoalNodeInsert = {
          goal_id: goal.id,
          parent_node_id: resolvedNodeId,
          label: nextAction,
          node_type: 'task',
          owner_type: 'user',
          status: 'pending',
          sort_order: sortOrder,
          depends_on_node_ids: [],
          fallback_node_id: null,
          metadata: buildTaskMetadata({
            nextAction,
            chatSource: source.chatSource,
            rawSource: source.rawSource,
            sourceUri: source.sourceUri,
          }),
        }

        const result = await insertGoalNodes(client, [row])
        if (result.error) {
          errors.push(`next_action "${nextAction}": ${result.error}`)
        } else {
          inserted.taskNodeId = result.data?.[0]?.id
        }
      } catch (error) {
        errors.push(
          `next_action "${nextAction}": ${error instanceof Error ? error.message : 'sort order lookup failed'}`,
        )
      }
    }

    return {
      kind: 'ok',
      ok: errors.length === 0,
      inserted,
      error: errors,
    }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'speak2action compile failed',
    }
  }
}
