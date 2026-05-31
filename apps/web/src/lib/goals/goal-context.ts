import { createServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  goalContextApiResponseSchema,
  type GoalContextApiResponse,
  type GoalContextArtifactItem,
  type GoalContextAssessment,
  type GoalContextNodeSummary,
  type GoalContextRecentChatUpdate,
} from '@/types/goal-tree'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalContextRow = Database['decision_ledger']['Tables']['goal_contexts']['Row']
type AgentRunRow = Database['decision_ledger']['Tables']['agent_runs']['Row']
type LearnerProfileRow = Database['public']['Tables']['learner_profile']['Row']
type LearnerStateRow = Database['public']['Tables']['learner_state']['Row']
type MentorMemoryRow = Database['public']['Tables']['mentor_memory']['Row']
type ArtifactRow = Database['public']['Tables']['artifacts']['Row']
type CapabilityRow = Database['public']['Tables']['capabilities']['Row']
type CapabilityStateRow = Database['public']['Views']['capability_state_vw']['Row']

type UntypedLedgerQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  in: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
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

type GoalContextAggregationInput = {
  goal: GoalRow
  nodes?: GoalNodeRow[] | null
  goalContexts?: GoalContextRow[] | null
  learnerProfile?: LearnerProfileRow | null
  learnerState?: LearnerStateRow | null
  mentorMemories?: MentorMemoryRow[] | null
  artifacts?: ArtifactRow[] | null
  capabilityState?: CapabilityStateRow[] | null
  capabilityRows?: CapabilityRow[] | null
  agentRuns?: AgentRunRow[] | null
}

export type GoalContextLookupResult =
  | { kind: 'ok'; data: GoalContextApiResponse }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'

const SIGNAL_CAPABILITY_LABELS: Array<
  [keyof LearnerStateSignals, string]
> = [
  ['has_node', 'Node.js 環境あり'],
  ['has_git_repo', 'Git リポジトリあり'],
  ['has_nextjs_app', 'Next.js アプリあり'],
  ['has_supabase_project', 'Supabase プロジェクトあり'],
  ['has_vercel_account', 'Vercel アカウントあり'],
  ['wants_content_site', 'コンテンツサイト志向'],
  ['wants_authenticated_app', '認証付きアプリ志向'],
  ['wants_database_app', 'DB 連携アプリ志向'],
]

const SPEAK2ACTION_CONTEXT_SOURCE_TYPES = new Set([
  'speak2action_decision',
  'speak2action_open_question',
])

type LearnerStateSignals = {
  has_node?: boolean
  has_git_repo?: boolean
  has_nextjs_app?: boolean
  has_supabase_project?: boolean
  has_vercel_account?: boolean
  wants_content_site?: boolean
  wants_authenticated_app?: boolean
  wants_database_app?: boolean
}

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

function contentPreview(value: string | null | undefined, fallback: string) {
  const normalized = trimToNull(value)
  if (!normalized) {
    return fallback
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
}

function maybeUrl(value: string | null | undefined) {
  const normalized = trimToNull(value)
  if (!normalized) {
    return null
  }

  try {
    const parsed = new URL(normalized)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function toStatusNodeSummary(nodes: GoalNodeRow[] | null | undefined): GoalContextNodeSummary[] {
  return [...(nodes ?? [])]
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order
      }

      return left.label.localeCompare(right.label, 'ja')
    })
    .map((node) => ({
      id: node.id,
      label: node.label,
      owner_type: node.owner_type,
      status: node.status as GoalContextNodeSummary['status'],
      next_action_preview: extractNodeNextActionPreview(node.metadata),
    }))
}

function extractNodeNextActionPreview(metadata: Json) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const candidate = (metadata as Record<string, Json>).next_action_preview
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null
}

function extractMetadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const candidate = (metadata as Record<string, Json>)[key]
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null
}

function isSpeak2ActionNode(node: GoalNodeRow) {
  if (!node.metadata || typeof node.metadata !== 'object' || Array.isArray(node.metadata)) {
    return false
  }

  const record = node.metadata as Record<string, Json>
  return record.speak2action === true && record.speak2action_kind === 'next_action'
}

function extractCapabilities(state: LearnerStateRow | null | undefined) {
  if (!state?.signals || typeof state.signals !== 'object' || Array.isArray(state.signals)) {
    return []
  }

  const signals = state.signals as LearnerStateSignals
  return SIGNAL_CAPABILITY_LABELS.flatMap(([key, label]) => (signals[key] ? [label] : []))
}

function buildAssessments(
  capabilityState: CapabilityStateRow[] | null | undefined,
  capabilityRows: CapabilityRow[] | null | undefined,
): GoalContextAssessment[] {
  const capabilityLabelById = new Map(
    (capabilityRows ?? []).map((capability) => [
      capability.id,
      {
        slug: capability.slug,
        label: capability.label,
      },
    ]),
  )

  return [...(capabilityState ?? [])]
    .filter((entry): entry is CapabilityStateRow & { capability_id: string } => Boolean(entry.capability_id))
    .map((entry) => {
      const capability = capabilityLabelById.get(entry.capability_id)
      if (!capability) {
        return null
      }

      return {
        capability_slug: capability.slug,
        label: capability.label,
        latest_score: entry.latest_score ?? 0,
        latest_assessed_at: entry.latest_assessed_at ?? null,
      }
    })
    .filter((entry): entry is GoalContextAssessment => entry !== null)
    .slice(0, 5)
}

function parseDecisionsFromJson(value: Json): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const decisions = (value as Record<string, Json>).decisions
  if (!Array.isArray(decisions)) {
    return []
  }

  return decisions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseNextActionFromJson(value: Json): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, Json>
  const candidate = record.next_action ?? record.nextAction
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null
}

function extractSpeak2ActionDecisions(goalContexts: GoalContextRow[] | null | undefined) {
  return (goalContexts ?? [])
    .filter((context) => context.source_type === 'speak2action_decision')
    .map((context) => context.content.trim())
    .filter((decision) => decision.length > 0)
}

function extractLatestSpeak2ActionNextAction(nodes: GoalNodeRow[] | null | undefined) {
  return [...(nodes ?? [])]
    .filter((node) => isSpeak2ActionNode(node))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((node) => node.label.trim())
    .find((label) => label.length > 0) ?? null
}

function buildRecentChatUpdates(
  nodes: GoalNodeRow[] | null | undefined,
  goalContexts: GoalContextRow[] | null | undefined,
): GoalContextRecentChatUpdate[] {
  const contextUpdates: GoalContextRecentChatUpdate[] = (goalContexts ?? [])
    .filter((context) => SPEAK2ACTION_CONTEXT_SOURCE_TYPES.has(context.source_type))
    .map((context) => ({
      id: context.id,
      kind: context.source_type === 'speak2action_open_question' ? 'open_question' : 'decision',
      content: context.content,
      node_id: context.node_id,
      source_type: context.source_type,
      source_uri: context.source_uri,
      chat_source: extractMetadataString(context.metadata, 'chat_source'),
      created_at: context.created_at,
    }))

  const nodeUpdates: GoalContextRecentChatUpdate[] = (nodes ?? [])
    .filter((node) => isSpeak2ActionNode(node))
    .map((node) => ({
      id: node.id,
      kind: 'next_action',
      content: node.label,
      node_id: node.id,
      source_type: 'speak2action_next_action',
      source_uri: extractMetadataString(node.metadata, 'source_uri'),
      chat_source: extractMetadataString(node.metadata, 'chat_source'),
      created_at: node.created_at,
    }))

  return [...contextUpdates, ...nodeUpdates]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
}

function extractDecisionsAndNextAction(
  agentRuns: AgentRunRow[] | null | undefined,
  goalContexts: GoalContextRow[] | null | undefined,
  nodes: GoalNodeRow[] | null | undefined,
) {
  const decisions: string[] = []
  let nextAction: string | null = null

  for (const run of agentRuns ?? []) {
    for (const decision of parseDecisionsFromJson(run.metadata)) {
      if (!decisions.includes(decision)) {
        decisions.push(decision)
      }
    }

    for (const decision of parseDecisionsFromJson(run.artifacts)) {
      if (!decisions.includes(decision)) {
        decisions.push(decision)
      }
    }

    if (!nextAction) {
      nextAction = parseNextActionFromJson(run.metadata) ?? parseNextActionFromJson(run.artifacts)
    }
  }

  for (const decision of extractSpeak2ActionDecisions(goalContexts)) {
    if (!decisions.includes(decision)) {
      decisions.push(decision)
    }
  }

  nextAction = extractLatestSpeak2ActionNextAction(nodes) ?? nextAction

  return {
    decisions,
    nextAction,
  }
}

function buildArtifacts(
  artifacts: ArtifactRow[] | null | undefined,
): GoalContextArtifactItem[] {
  return [...(artifacts ?? [])].map((artifact) => {
    const fallbackTitle = trimToNull(artifact.title) ?? trimToNull(artifact.step_title) ?? '成果物'
    const url = maybeUrl(artifact.content) ?? maybeUrl(artifact.body)

    return {
      id: artifact.id,
      title: trimToNull(artifact.title),
      artifact_type: trimToNull(artifact.type) ?? artifact.artifact_type,
      url,
      content_preview: contentPreview(
        trimToNull(artifact.body) ?? trimToNull(artifact.content),
        fallbackTitle,
      ),
      milestone_title: trimToNull(artifact.milestone_title),
      step_title: trimToNull(artifact.step_title),
      task_id: artifact.task_id,
      created_at: artifact.created_at,
    }
  })
}

export function buildGoalContextResponse(
  input: GoalContextAggregationInput,
): GoalContextApiResponse {
  const nodes = toStatusNodeSummary(input.nodes)
  const { decisions, nextAction } = extractDecisionsAndNextAction(
    input.agentRuns,
    input.goalContexts,
    input.nodes,
  )
  const recentChatUpdates = buildRecentChatUpdates(input.nodes, input.goalContexts)
  const profile = input.learnerProfile
    ? {
        role: null,
        primary_goals: [
          input.goal.title,
          ...(
            trimToNull(input.goal.description)
              ? [trimToNull(input.goal.description)!]
              : []
          ),
        ],
        experience_level:
          trimToNull(input.learnerState?.skill_level) ?? trimToNull(input.learnerProfile.experience_summary),
        tool_familiarity: trimToNull(input.learnerProfile.cli_familiarity),
        display_name: trimToNull(input.learnerProfile.display_name),
        experience_summary: trimToNull(input.learnerProfile.experience_summary),
        operating_system: trimToNull(input.learnerProfile.operating_system),
        available_ai_tools: input.learnerProfile.available_ai_tools ?? [],
      }
    : null

  const state = input.learnerState
    ? {
        capabilities: extractCapabilities(input.learnerState),
        assessments_top5: buildAssessments(input.capabilityState, input.capabilityRows),
        blockers: input.learnerState.blockers ?? [],
        deadline_text: trimToNull(input.learnerState.deadline_text),
        target_outcome: trimToNull(input.learnerState.target_outcome),
        skill_level: trimToNull(input.learnerState.skill_level),
      }
    : null

  return goalContextApiResponseSchema.parse({
    goal: {
      id: input.goal.id,
      title: input.goal.title,
      description: trimToNull(input.goal.description),
      status: input.goal.status,
      deadline: input.goal.deadline,
      created_at: input.goal.created_at,
    },
    nodes,
    profile,
    state,
    mentor_memories: (input.mentorMemories ?? []).map((memory) => ({
      id: memory.id,
      title: memory.title,
      bullets: memory.bullets ?? [],
      source: memory.source,
      created_at: memory.created_at,
    })),
    goal_contexts: (input.goalContexts ?? []).map((context) => ({
      id: context.id,
      node_id: context.node_id,
      source_type: context.source_type,
      source_uri: context.source_uri,
      content: context.content,
      metadata:
        context.metadata && typeof context.metadata === 'object' && !Array.isArray(context.metadata)
          ? context.metadata
          : {},
      freshness_at: context.freshness_at,
      created_at: context.created_at,
    })),
    recent_chat_updates: recentChatUpdates,
    artifacts: buildArtifacts(input.artifacts),
    decisions,
    next_action: nextAction,
  })
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

async function loadGoalNodes(
  ledger: UntypedLedgerSchemaClient,
  goalId: string,
) {
  const { data, error } = await ledger
    .from<GoalNodeRow>('goal_nodes')
    .select('*')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return Array.isArray(data) ? data : []
}

export async function fetchGoalContextForUser(
  userId: string,
  goalId: string,
): Promise<GoalContextLookupResult> {
  try {
    const client = createServiceClient()
    if (!client) {
      return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
    }

    const ledger = getDecisionLedgerSchemaClient(client)
    const goal = await loadGoal(ledger, goalId)

    if (!goal) {
      return { kind: 'not_found' }
    }

    if (goal.user_id !== userId) {
      return { kind: 'forbidden' }
    }

    const nodes = await loadGoalNodes(ledger, goal.id)
    const doneNodeIds = new Set(
      nodes
        .filter((node) => node.status === 'done')
        .map((node) => node.id),
    )

    const [
      goalContextsResult,
      learnerProfileResult,
      learnerStateResult,
      mentorMemoriesResult,
      recentArtifactsResult,
      capabilityStateResult,
      agentRunsResult,
    ] = await Promise.allSettled([
      ledger
        .from<GoalContextRow>('goal_contexts')
        .select('*')
        .eq('goal_id', goal.id)
        .order('created_at', { ascending: false })
        .limit(10),
      client
        .from('learner_profile')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('learner_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('mentor_memory')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      client
        .from('artifacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      client
        .from('capability_state_vw')
        .select('user_id, capability_id, latest_score, latest_assessed_at')
        .eq('user_id', userId)
        .order('latest_assessed_at', { ascending: false })
        .limit(5),
      ledger
        .from<AgentRunRow>('agent_runs')
        .select('*')
        .eq('goal_id', goal.id)
        .order('started_at', { ascending: false })
        .limit(10),
    ])

    const capabilityState = unwrapListResult(capabilityStateResult)
    const capabilityIds = Array.from(new Set(
      capabilityState
        .map((entry) => entry.capability_id)
        .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
    ))

    const capabilityRows = capabilityIds.length > 0
      ? await safeLoadCapabilities(client, capabilityIds)
      : []

    const candidateArtifacts = unwrapListResult<ArtifactRow>(recentArtifactsResult)
    const artifacts = candidateArtifacts
      .filter((artifact) => {
        if (trimToNull(artifact.planner_goal) === goal.title) {
          return true
        }

        return artifact.task_id ? doneNodeIds.has(artifact.task_id) : false
      })
      .slice(0, 10)

    const payload = buildGoalContextResponse({
      goal,
      nodes,
      goalContexts: unwrapListResult(goalContextsResult),
      learnerProfile: unwrapSingleResult(learnerProfileResult),
      learnerState: unwrapSingleResult(learnerStateResult),
      mentorMemories: unwrapListResult(mentorMemoriesResult),
      artifacts,
      capabilityState,
      capabilityRows,
      agentRuns: unwrapListResult(agentRunsResult),
    })

    return {
      kind: 'ok',
      data: payload,
    }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'goal context lookup failed',
    }
  }
}

async function safeLoadCapabilities(
  client: ServiceClient,
  capabilityIds: string[],
): Promise<CapabilityRow[]> {
  try {
    const { data, error } = await client
      .from('capabilities')
      .select('id, slug, label, description, domain_id, rubric_criteria')
      .in('id', capabilityIds)

    if (error) {
      throw error
    }

    return (data as CapabilityRow[] | null) ?? []
  } catch {
    return []
  }
}

function unwrapListResult<TRow>(
  result: PromiseSettledResult<{ data: TRow[] | null; error: { message: string } | null }>,
): TRow[] {
  if (result.status !== 'fulfilled' || result.value.error) {
    return []
  }

  return result.value.data ?? []
}

function unwrapSingleResult<TRow>(
  result: PromiseSettledResult<{ data: TRow | null; error: { message: string } | null }>,
): TRow | null {
  if (result.status !== 'fulfilled' || result.value.error) {
    return null
  }

  return result.value.data ?? null
}
