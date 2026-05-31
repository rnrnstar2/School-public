// TQ-223: This module routes prompts through @/lib/prompts/agent-delegation
// and @/lib/prompts/ai-delegation, both of which prepend the THREE_AXIS_GUIDE
// preamble (AI フル活用 / 非エンジニア / 最短). No additional injection here —
// the AI side always receives the 3 軸 guide via the imported builders.

import { z } from 'zod/v4'

import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { withAiMetrics } from '@/lib/observability/ai-metrics'
import {
  claudeCodeBriefPrompt,
  codexCliBriefPrompt,
} from '@/lib/prompts/agent-delegation'
import {
  buildAiDelegationPromptMessages,
  buildMockAiDelegationBrief,
  type AiDelegationPromptContext,
  type ClassicAiDelegationKind,
} from '@/lib/prompts/ai-delegation'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { insertGoalContexts } from '@/lib/supabase/decision-ledger'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createServiceClient } from '@/lib/supabase/service'
import type { GoalTreeOwnerType } from '@/types/goal-tree'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalContextRow = Database['decision_ledger']['Tables']['goal_contexts']['Row']

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

type DelegateTarget = {
  goal: GoalRow
  node: GoalNodeRow
  nodes: GoalNodeRow[]
  goalContexts: GoalContextRow[]
}

type AiChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'
const AI_DELEGATION_TIMEOUT_MS = 20_000
const ALLOWED_OWNER_TYPES = new Set<GoalTreeOwnerType>(['ai', 'both'])

export const aiDelegationKindSchema = z.enum([
  'prompt',
  'code_brief',
  'analyze',
  'codex_cli_brief',
  'claude_code_brief',
])
export type AiDelegationKind = z.infer<typeof aiDelegationKindSchema>
export type AiDelegationMode = 'auto' | 'mock'

export type DelegateGoalNodeBriefResult =
  | { kind: 'ok'; brief: string; contextId: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'invalid_owner_type'; ownerType: GoalTreeOwnerType }
  | { kind: 'error'; message: string }

function isAgentDelegationKind(kind: AiDelegationKind): kind is 'codex_cli_brief' | 'claude_code_brief' {
  return kind === 'codex_cli_brief' || kind === 'claude_code_brief'
}

function resolveAgentMetadata(kind: 'codex_cli_brief' | 'claude_code_brief') {
  return kind === 'codex_cli_brief'
    ? { agent: 'codex' as const }
    : { agent: 'claude_code' as const }
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

function extractNextActionPreview(metadata: Json) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const candidate = (metadata as Record<string, Json>).next_action_preview
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null
}

async function loadDelegateTarget(
  client: ServiceClient,
  userId: string,
  goalId: string,
  nodeId: string,
): Promise<DelegateGoalNodeBriefResult | DelegateTarget> {
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

  const [{ data: nodes, error: nodesError }, { data: goalContexts, error: goalContextsError }] =
    await Promise.all([
      ledger
        .from<GoalNodeRow>('goal_nodes')
        .select('*')
        .eq('goal_id', goal.id)
        .order('sort_order', { ascending: true }),
      ledger
        .from<GoalContextRow>('goal_contexts')
        .select('*')
        .eq('goal_id', goal.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  if (nodesError) {
    return { kind: 'error', message: nodesError.message }
  }

  if (goalContextsError) {
    return { kind: 'error', message: goalContextsError.message }
  }

  const nodeList = nodes ?? []
  const node = nodeList.find((candidate) => candidate.id === nodeId)
  if (!node) {
    return { kind: 'not_found' }
  }

  if (!ALLOWED_OWNER_TYPES.has(node.owner_type as GoalTreeOwnerType)) {
    return {
      kind: 'invalid_owner_type',
      ownerType: node.owner_type as GoalTreeOwnerType,
    }
  }

  return {
    goal,
    node,
    nodes: nodeList,
    goalContexts: goalContexts ?? [],
  }
}

function buildPromptContext(target: DelegateTarget): AiDelegationPromptContext {
  const nodeLabelById = new Map(target.nodes.map((node) => [node.id, node.label]))
  const dependencyLabels = target.node.depends_on_node_ids.map((dependencyId) =>
    nodeLabelById.get(dependencyId) ?? dependencyId,
  )
  const siblingLabels = target.nodes
    .filter((candidate) =>
      candidate.parent_node_id === target.node.parent_node_id && candidate.id !== target.node.id,
    )
    .map((candidate) => candidate.label)
    .slice(0, 4)

  return {
    goalTitle: target.goal.title,
    goalDescription: trimToNull(target.goal.description),
    nodeLabel: target.node.label,
    nodeType: target.node.node_type,
    nodeStatus: target.node.status,
    ownerType: target.node.owner_type,
    dependencyLabels,
    siblingLabels,
    nextActionPreview: extractNextActionPreview(target.node.metadata),
    contextSnippets: target.goalContexts
      .filter((context) =>
        context.source_type !== 'ai_delegation_brief'
        && context.source_type !== 'agent_delegation_brief',
      )
      .slice(0, 3)
      .map((context) => ({
        sourceType: context.source_type,
        content: context.content,
      })),
  }
}

function buildAgentDelegationBrief(
  kind: 'codex_cli_brief' | 'claude_code_brief',
  target: DelegateTarget,
  context: AiDelegationPromptContext,
) {
  const task = {
    id: target.node.id,
    label: target.node.label,
    nodeType: target.node.node_type,
    nodeStatus: target.node.status,
    ownerType: target.node.owner_type,
  }

  return kind === 'codex_cli_brief'
    ? codexCliBriefPrompt(task, context)
    : claudeCodeBriefPrompt(task, context)
}

function shouldUseMock(mode: AiDelegationMode) {
  if (mode === 'mock') {
    return true
  }

  const envMode =
    process.env.AI_DELEGATION_MODE?.trim().toLowerCase()
    ?? process.env.GOAL_AI_DELEGATION_MODE?.trim().toLowerCase()

  return envMode === 'mock'
}

async function requestAiBrief(
  kind: ClassicAiDelegationKind,
  context: AiDelegationPromptContext,
  requestId: string | null | undefined,
): Promise<string> {
  if (shouldUseMock('auto')) {
    return buildMockAiDelegationBrief(kind, context)
  }

  const externalConfig = getExternalPlannerConfig()
  if (!externalConfig.available) {
    return buildMockAiDelegationBrief(kind, context)
  }

  const { system, user } = buildAiDelegationPromptMessages(kind, context)

  try {
    return await withAiMetrics({ operation: 'ai.delegation-brief', requestId }, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), AI_DELEGATION_TIMEOUT_MS)

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
            temperature: 0.2,
            top_p: 0.9,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          cache: 'no-store',
          signal: controller.signal,
        },
        { operation: 'ai.delegation-brief', maxRetries: 1 },
      ).finally(() => {
        clearTimeout(timeoutId)
      })

      if (!response.ok) {
        throw new Error(`AI request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as AiChatCompletionPayload
      const content = payload.choices?.[0]?.message?.content?.trim()
      return content && content.length > 0
        ? content
        : buildMockAiDelegationBrief(kind, context)
    })
  } catch {
    return buildMockAiDelegationBrief(kind, context)
  }
}

export async function createAiDelegationBrief(params: {
  userId: string
  goalId: string
  nodeId: string
  delegateKind: AiDelegationKind
  mode?: AiDelegationMode
  requestId?: string | null
}): Promise<DelegateGoalNodeBriefResult> {
  const client = createServiceClient()
  if (!client) {
    return { kind: 'error', message: SERVICE_CLIENT_UNAVAILABLE }
  }

  const target = await loadDelegateTarget(client, params.userId, params.goalId, params.nodeId)
  if ('kind' in target) {
    return target
  }

  const promptContext = buildPromptContext(target)
  const brief = isAgentDelegationKind(params.delegateKind)
    ? buildAgentDelegationBrief(params.delegateKind, target, promptContext)
    : params.mode === 'mock'
      ? buildMockAiDelegationBrief(params.delegateKind, promptContext)
      : await requestAiBrief(params.delegateKind, promptContext, params.requestId)
  const generatedAt = new Date().toISOString()
  const sourceType = isAgentDelegationKind(params.delegateKind)
    ? 'agent_delegation_brief'
    : 'ai_delegation_brief'
  const agentMetadata = isAgentDelegationKind(params.delegateKind)
    ? resolveAgentMetadata(params.delegateKind)
    : {}
  const insertResult = await insertGoalContexts(client, [
    {
      goal_id: target.goal.id,
      node_id: target.node.id,
      source_type: sourceType,
      source_uri: null,
      content: brief,
      metadata: {
        ...agentMetadata,
        delegate_kind: params.delegateKind,
        node_id: target.node.id,
        generated_at: generatedAt,
      },
    },
  ])

  if (insertResult.error) {
    return {
      kind: 'error',
      message: insertResult.error,
    }
  }

  const row = insertResult.data?.[0]
  if (!row) {
    return {
      kind: 'error',
      message: 'ai delegation brief insert returned no row',
    }
  }

  return {
    kind: 'ok',
    brief,
    contextId: row.id,
  }
}
