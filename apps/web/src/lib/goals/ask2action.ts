import { z } from 'zod/v4'

import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import {
  NextQuestionOutputSchema,
  type NextQuestionAnswerInput,
  type NextQuestionOutput,
} from '@/lib/api/schemas'
import { withAiMetrics } from '@/lib/observability/ai-metrics'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import {
  buildAsk2ActionPromptMessages,
  buildFallbackNextQuestion,
} from '@/lib/prompts/ask2action'
import { linkContext } from '@/lib/supabase/decision-ledger'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalContextRow = Database['decision_ledger']['Tables']['goal_contexts']['Row']
type LearnerStateRow = Database['public']['Tables']['learner_state']['Row']
type MentorMemoryRow = Database['public']['Tables']['mentor_memory']['Row']

type UntypedLedgerQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
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

type Ask2ActionTarget = {
  goal: GoalRow
  nodes: GoalNodeRow[]
  goalContexts: GoalContextRow[]
  learnerState: LearnerStateRow | null
  mentorMemories: MentorMemoryRow[]
}

type ZaiChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type AnswerKind = NonNullable<NextQuestionAnswerInput['answerKind']>

const ASK2ACTION_TIMEOUT_MS = 20_000
const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'

export type GenerateAsk2ActionResult =
  | { kind: 'ok'; nextQuestion: NextQuestionOutput; usedFallback: boolean }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

type Ask2ActionLookupFailure =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

export type SaveAsk2ActionAnswerResult =
  | { kind: 'ok'; contextId: string; nextQuestion: NextQuestionOutput; usedFallback: boolean }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

const nextQuestionJsonSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()),
  freeform_hint: z.string().optional(),
})

function getDecisionLedgerSchemaClient(client: ServiceClient): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function truncate(value: string, maxLength = 160) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function parseEmbeddedJson(rawContent: string) {
  const normalized = rawContent.trim()
  if (!normalized) {
    return null
  }

  try {
    return JSON.parse(normalized) as unknown
  } catch {
    const match = normalized.match(/\{[\s\S]*\}/u)
    if (!match) {
      return null
    }

    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      return null
    }
  }
}

function parseNextQuestionContent(rawContent: string): NextQuestionOutput | null {
  const embeddedJson = parseEmbeddedJson(rawContent)
  if (!embeddedJson) {
    return null
  }

  const candidate = nextQuestionJsonSchema.safeParse(embeddedJson)
  if (!candidate.success) {
    return null
  }

  const parsed = NextQuestionOutputSchema.safeParse(candidate.data)
  return parsed.success ? parsed.data : null
}

function extractMetadataPlanId(metadata: Json) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const candidate = (metadata as Record<string, Json>).plan_id
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null
}

function formatGoalContextSnippet(context: GoalContextRow) {
  const content = normalizeText(context.content)
  if (content.length === 0) {
    return ''
  }

  if (context.source_type === 'ask2action_answer') {
    const parsed = parseEmbeddedJson(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const question = normalizeText((parsed as Record<string, unknown>).question as string | undefined)
      const answer = normalizeText((parsed as Record<string, unknown>).answer as string | undefined)
      const summary = [question ? `Q: ${question}` : null, answer ? `A: ${answer}` : null]
        .filter((item): item is string => Boolean(item))
        .join(' / ')
      return truncate(summary || content, 180)
    }
  }

  return truncate(content, 180)
}

async function loadAsk2ActionTarget(
  client: ServiceClient,
  userId: string,
  goalId: string,
): Promise<Ask2ActionLookupFailure | Ask2ActionTarget> {
  const ledger = getDecisionLedgerSchemaClient(client)
  const { data: goal, error: goalError } = await ledger
    .from<GoalRow>('goals')
    .select('*')
    .eq('id', goalId)
    .maybeSingle()

  if (goalError) {
    return { kind: 'error', message: goalError.message }
  }

  if (!goal) {
    return { kind: 'not_found' }
  }

  if (goal.user_id !== userId) {
    return { kind: 'forbidden' }
  }

  const [
    { data: nodes, error: nodesError },
    { data: goalContexts, error: goalContextsError },
    { data: learnerState, error: learnerStateError },
    { data: mentorMemories, error: mentorMemoriesError },
  ] = await Promise.all([
    ledger
      .from<GoalNodeRow>('goal_nodes')
      .select('*')
      .eq('goal_id', goal.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    ledger
      .from<GoalContextRow>('goal_contexts')
      .select('*')
      .eq('goal_id', goal.id)
      .order('created_at', { ascending: false })
      .limit(6),
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
      .limit(6),
  ])

  if (nodesError) {
    return { kind: 'error', message: nodesError.message }
  }

  if (goalContextsError) {
    return { kind: 'error', message: goalContextsError.message }
  }

  if (learnerStateError) {
    return { kind: 'error', message: learnerStateError.message }
  }

  if (mentorMemoriesError) {
    return { kind: 'error', message: mentorMemoriesError.message }
  }

  return {
    goal,
    nodes: nodes ?? [],
    goalContexts: goalContexts ?? [],
    learnerState: learnerState ?? null,
    mentorMemories: mentorMemories ?? [],
  }
}

function shouldForceFallbackMode() {
  const mode =
    process.env.ASK2ACTION_MODE?.trim().toLowerCase()
    ?? process.env.GOAL_ASK2ACTION_MODE?.trim().toLowerCase()

  return mode === 'fallback' || mode === 'mock'
}

async function requestNextQuestionFromAi(
  target: Ask2ActionTarget,
  lastAnswer: string | null | undefined,
  requestId: string | null | undefined,
): Promise<NextQuestionOutput | null> {
  if (shouldForceFallbackMode()) {
    return null
  }

  const externalConfig = getExternalPlannerConfig()
  if (!externalConfig.available) {
    return null
  }

  const { system, user } = buildAsk2ActionPromptMessages({
    goalTitle: target.goal.title,
    goalDescription: target.goal.description,
    nodes: target.nodes.map((node) => ({
      label: node.label,
      status: node.status,
      ownerType: node.owner_type,
      nodeType: node.node_type,
    })),
    learnerState: target.learnerState
      ? {
          targetOutcome: target.learnerState.target_outcome,
          skillLevel: target.learnerState.skill_level,
          blockers: target.learnerState.blockers,
        }
      : null,
    mentorMemories: target.mentorMemories.map((memory) => ({
      title: memory.title,
      bullets: memory.bullets ?? [],
    })),
    contextSnippets: target.goalContexts
      .filter((context) => context.source_type !== 'ai_delegation_brief')
      .map((context) => ({
        sourceType: context.source_type,
        content: formatGoalContextSnippet(context),
      }))
      .filter((snippet) => snippet.content.length > 0),
    lastAnswer,
  })

  try {
    return await withAiMetrics({ operation: 'ai.ask2action', requestId }, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), ASK2ACTION_TIMEOUT_MS)

      const response = await fetchWithRetry(
        externalConfig.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${externalConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: externalConfig.model,
            temperature: 0.3,
            top_p: 0.9,
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          cache: 'no-store',
          signal: controller.signal,
        },
        { operation: 'ai.ask2action', maxRetries: 1 },
      ).finally(() => clearTimeout(timeoutId))

      if (!response.ok) {
        throw new Error(`AI request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as ZaiChatCompletionPayload
      const rawContent = payload.choices?.[0]?.message?.content ?? ''
      return parseNextQuestionContent(rawContent)
    })
  } catch {
    return null
  }
}

export async function resolveAsk2ActionGoalId(params: {
  userId: string
  planId?: string | null
  goalText?: string | null
}): Promise<string | null> {
  const client = createServiceClient()
  if (!client) {
    return null
  }

  const ledger = getDecisionLedgerSchemaClient(client)
  const { data, error } = await ledger
    .from<GoalRow>('goals')
    .select('*')
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(12)

  if (error || !data || data.length === 0) {
    return null
  }

  const normalizedGoalText = normalizeText(params.goalText)
  const byPlanId = params.planId
    ? data.find((goal) => extractMetadataPlanId(goal.metadata) === params.planId)
    : null
  if (byPlanId) {
    return byPlanId.id
  }

  const byGoalText = normalizedGoalText.length > 0
    ? data.find((goal) => normalizeText(goal.title) === normalizedGoalText)
    : null
  if (byGoalText) {
    return byGoalText.id
  }

  return null
}

export async function generateAsk2ActionNextQuestion(params: {
  userId: string
  goalId: string
  lastAnswer?: string | null
  requestId?: string | null
}): Promise<GenerateAsk2ActionResult> {
  const client = createServiceClient()
  if (!client) {
    return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
  }

  const target = await loadAsk2ActionTarget(client, params.userId, params.goalId)
  if ('kind' in target) {
    return target
  }

  const aiQuestion = await requestNextQuestionFromAi(
    target,
    params.lastAnswer,
    params.requestId,
  )
  const nextQuestion = aiQuestion ?? buildFallbackNextQuestion(params.lastAnswer)

  return {
    kind: 'ok',
    nextQuestion,
    usedFallback: aiQuestion === null,
  }
}

export async function saveAsk2ActionAnswer(params: {
  userId: string
  goalId: string
  questionText: string
  answer: string
  answerKind?: AnswerKind
  requestId?: string | null
}): Promise<SaveAsk2ActionAnswerResult> {
  const client = createServiceClient()
  if (!client) {
    return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
  }

  const target = await loadAsk2ActionTarget(client, params.userId, params.goalId)
  if ('kind' in target) {
    return target
  }

  const normalizedAnswerKind: AnswerKind = params.answerKind ?? 'freeform'
  const savedAt = new Date().toISOString()
  const insertResult = await linkContext({
    goal_id: target.goal.id,
    node_id: null,
    source_type: 'ask2action_answer',
    source_uri: null,
    content: JSON.stringify({
      question: params.questionText,
      answer: params.answer,
    }),
    metadata: {
      [normalizedAnswerKind]: params.answer,
      saved_at: savedAt,
    },
  })

  if (insertResult.error || !insertResult.data) {
    return {
      kind: 'error',
      message: insertResult.error ?? 'ask2action answer insert returned no row',
    }
  }

  const nextQuestionResult = await generateAsk2ActionNextQuestion({
    userId: params.userId,
    goalId: params.goalId,
    lastAnswer: params.answer,
    requestId: params.requestId,
  })

  if (nextQuestionResult.kind !== 'ok') {
    return {
      kind: 'ok',
      contextId: insertResult.data.id,
      nextQuestion: buildFallbackNextQuestion(params.answer),
      usedFallback: true,
    }
  }

  return {
    kind: 'ok',
    contextId: insertResult.data.id,
    nextQuestion: nextQuestionResult.nextQuestion,
    usedFallback: nextQuestionResult.usedFallback,
  }
}
