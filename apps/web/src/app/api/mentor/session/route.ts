import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_AI, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse, sseResponse } from '@/lib/api/response'
import { mentorSessionSchema } from '@/lib/api/schemas'
import { serverEnv } from '@/lib/env'
import { Conductor, type ConductorDelegates } from '@/lib/mentor/conductor'
import {
  BudgetCapError,
  type MentorBudgetCapContext,
} from '@/lib/mentor/providers/budget-cap-runtime'
import {
  normalizeAgentRunRow,
  type AgentRunRecord,
} from '@/lib/admin/mentor-metrics'
import { createServiceClient } from '@/lib/supabase/service'
import { GoalTreeSubAgent } from '@/lib/mentor/sub-agents/goal-tree'
import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { LessonMatcherSubAgent } from '@/lib/mentor/sub-agents/lesson-matcher'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'
import { TechStackScoutSubAgent } from '@/lib/mentor/sub-agents/tech-scout'
import { AiToolCatalogScoutSubAgent } from '@/lib/mentor/sub-agents/tool-scout'
import { ShortestPathPlannerSubAgent } from '@/lib/mentor/sub-agents/path-planner'
import { JudgeSubAgent } from '@/lib/mentor/sub-agents/judge'
import { maybeRunTieBreaker } from '@/lib/mentor/tie-breaker-runner'
import { runSubAgentsParallel, type SubAgentTask } from '@/lib/mentor/sub-agents/fan-out'
import { persistSubAgentReports } from '@/lib/mentor/sub-agents/persist'
import { retrieveCandidateAtomsForGoal } from '@/lib/lessons/atom-retrieval'
import type {
  SubAgentProgressCallback,
  SubAgentReport,
} from '@/lib/mentor/sub-agents/types'
import type { GoalTreeSubAgentOutput } from '@/lib/mentor/sub-agents/goal-tree'
import type {
  GoalTreeDecomposition,
} from '@/lib/planner/goal-first/ai-atom-compiler'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import { buildAtomPlanFromGoalWithAI } from '@/lib/planner/goal-first/ai-atom-compiler'
import { persistCompiledPlanSnapshot } from '@/lib/compiled-plans'
import { fetchPlannerMentorMemoryBullets } from '@/lib/planner/mentor-memory-query'
import {
  buildMentorGroundedContext,
  type MentorGroundedContext,
} from '@/lib/mentor/context/populate-context'
import { getExternalPlannerConfig, type ZaiStreamChunk } from '@/lib/planner/zai'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import {
  buildMentorContext,
  buildMentorPrompt,
  getMentorRoleConfig,
  MENTOR_ACTION_INSTRUCTIONS,
  summarizeOlderMessages,
} from '@/lib/mentor/core'
import {
  createEmptyMentorSession,
  getMentorSessionByGoal,
  getMentorSessionById,
  resetMentorSession,
  upsertMentorSession,
} from '@/lib/supabase/mentor-sessions'
import { buildMentorCanonicalGoalKey } from '@/lib/mentor/session-key'
import { normalizePlannerGoal } from '@/lib/planner/intent'
import {
  advanceHearingSessionStream,
  type HearingStreamEvent,
} from '@/lib/planner/live-hearing-service'
import {
  parseMentorChatStructuredOutput,
  extractStructuredReplyPreview,
} from '@/lib/chat/structured-output'
import { finalizePlannerMentorStructuredOutput } from '@/app/api/planner/mentor-chat/finalize-structured-output'
import { upsertMentorMemory } from '@/lib/learner-models'
import type {
  MentorSessionState,
  MentorSessionTransport,
  PlannerConversationMessage,
  PlannerHearingSession,
} from '@/lib/planner/types'
import type { MentorAction } from '@/lib/mentor/mentor-actions'

type SessionRequestBody = {
  goal: string
  message?: string | null
  sessionId?: string | null
  lesson?: {
    id: string
    title: string
    summary?: string
  }
  uiContext?: {
    surface?: string
  }
}

const MENTOR_SESSION_TIMEOUT_MS = 20_000
const SESSION_HISTORY_WINDOW = 20

// TQ-256 (Auditor C10): MENTOR_ACTION_INSTRUCTIONS の定義は
// `apps/web/src/lib/mentor/core/roles.ts` 1 箇所に統一済み。
// 過去にここで重複定義されていたが、roles.ts は 10 種・本ファイルは 7 種で
// 食い違っており AI hallucination の温床になっていた。新しい action タグを
// 追加するときも roles.ts だけを変更すれば本ルートに自動反映される。

function createLiveTransport(model?: string, endpoint?: string): MentorSessionTransport {
  return {
    status: 'live',
    label: 'AIメンター',
    message: 'Unified mentor session',
    ...(model ? { model } : {}),
    ...(endpoint ? { endpoint } : {}),
  }
}

function createUnavailableTransport(message: string): MentorSessionTransport {
  return {
    status: 'unavailable',
    label: 'AIメンター',
    message,
  }
}

function createErrorTransport(message: string): MentorSessionTransport {
  return {
    status: 'error',
    label: 'AIメンター',
    message,
  }
}

function summarizeSessionHistory(messages: PlannerConversationMessage[]) {
  if (messages.length <= SESSION_HISTORY_WINDOW) {
    return null
  }

  return summarizeOlderMessages(messages.slice(0, -SESSION_HISTORY_WINDOW))
}

function buildSessionWithHistorySummary(session: MentorSessionState) {
  return {
    ...session,
    historySummary: summarizeSessionHistory(session.messages),
  } satisfies MentorSessionState
}

function hasMentorSessionBootstrapState(session: MentorSessionState) {
  if (session.messages.length > 0) {
    return true
  }

  if (Object.values(session.answers).some((value) => typeof value === 'string' ? value.trim().length > 0 : Boolean(value))) {
    return true
  }

  return Boolean(
    session.historySummary
    || session.completedAt
    || session.currentLessonId
    || session.activePlanId
    || session.summaryKeyPoints?.length
    || session.personaIds?.length,
  )
}

function toPlannerHearingSession(session: MentorSessionState): PlannerHearingSession | null {
  if (!hasMentorSessionBootstrapState(session)) {
    return null
  }

  return {
    answers: session.answers,
    insights: session.insights,
    messages: session.messages,
    lastQuestionId: session.lastQuestionId ?? null,
    transport: {
      status: session.transport.status === 'live' ? 'live' : 'unavailable',
      label: session.transport.label,
      message: session.transport.message,
      model: session.transport.model,
      endpoint: session.transport.endpoint,
    },
    completedAt: session.completedAt ?? null,
    summaryKeyPoints: session.summaryKeyPoints ?? [],
    personaIds: session.personaIds ?? [],
  }
}

function appendMessage(
  messages: PlannerConversationMessage[],
  role: 'assistant' | 'user',
  content: string,
): PlannerConversationMessage[] {
  return [
    ...messages,
    {
      id: `${role}-${Date.now()}`,
      role,
      content: content.trim(),
    },
  ]
}

function buildSessionResult(
  baseSession: MentorSessionState,
  hearingSession: PlannerHearingSession,
  lessonId?: string,
): MentorSessionState {
  return buildSessionWithHistorySummary({
    ...baseSession,
    messages: hearingSession.messages,
    answers: hearingSession.answers,
    insights: hearingSession.insights,
    lastQuestionId: hearingSession.lastQuestionId ?? null,
    transport: createLiveTransport(hearingSession.transport.model, hearingSession.transport.endpoint),
    completedAt: hearingSession.completedAt ?? null,
    summaryKeyPoints: hearingSession.summaryKeyPoints ?? [],
    personaIds: hearingSession.personaIds ?? [],
    currentLessonId: lessonId ?? baseSession.currentLessonId ?? null,
    phase: hearingSession.completedAt ? 'ready_to_plan' : 'clarifying_goal',
  })
}

async function resolveSession(
  client: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: SessionRequestBody,
) {
  const byId = body.sessionId?.trim()
    ? await getMentorSessionById(client, userId, body.sessionId.trim())
    : null

  if (byId) {
    return byId
  }

  const byGoal = await getMentorSessionByGoal(client, userId, body.goal)
  if (byGoal) {
    return byGoal
  }

  return createEmptyMentorSession(body.goal)
}

async function streamCoachingSession(
  request: Request,
  client: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  session: MentorSessionState,
  body: SessionRequestBody,
  requestId: string | null,
) {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    return jsonResponse(
      {
        error: 'ai_unavailable',
        message: externalConfig.reason,
        transport: createUnavailableTransport(externalConfig.reason),
      },
      { status: 503 },
      request,
    )
  }

  const incomingMessage = body.message?.trim() ?? ''
  if (!incomingMessage) {
    return jsonResponse(
      {
        error: 'message_required',
        message: 'メッセージを入力してください。',
      },
      { status: 400 },
      request,
    )
  }

  const preAssistantMessages = appendMessage(session.messages, 'user', incomingMessage)
  const historySummary = summarizeSessionHistory(preAssistantMessages)
  const recentMessages = preAssistantMessages.slice(-SESSION_HISTORY_WINDOW)
  const mentorContext = await buildMentorContext({
    userId,
    supabase: client,
    role: 'coaching',
    goalText: session.goal,
    currentLessonId: body.lesson?.id,
    conversationHistory: recentMessages.map((message) => ({
      role: message.role as 'assistant' | 'user' | 'system',
      content: message.content,
    })),
    // TQ-214: Hearing で集めた summaryKeyPoints / personaIds / answers / insights を
    // coaching prompt の {{hearing_digest_block}} に流し、Owner Pain
    // 「ヒアリングを反映していない」を解消する。session は本ルート上で
    // すでに mentor_sessions から読み込み済みのため、ここで直接渡して
    // 余分な DB クエリを発生させない。
    hearingDigest: {
      summaryKeyPoints: session.summaryKeyPoints ?? [],
      personaIds: session.personaIds ?? [],
      answers: session.answers ?? {},
      insights: session.insights ?? null,
    },
  })
  const roleConfig = getMentorRoleConfig('coaching')
  const promptResult = buildMentorPrompt(roleConfig, {
    ...mentorContext,
    planSummary: [
      historySummary,
      mentorContext.planSummary ?? '（プラン未作成）',
      MENTOR_ACTION_INSTRUCTIONS,
    ].filter(Boolean).join('\n\n'),
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MENTOR_SESSION_TIMEOUT_MS)
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
        stream: true,
        temperature: roleConfig.temperature,
        response_format: {
          type: 'json_object',
        },
        messages: promptResult.messages,
      }),
      cache: 'no-store',
      signal: controller.signal,
    },
    { operation: 'ai.mentor-session' },
  ).finally(() => {
    clearTimeout(timeoutId)
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const writeEvent = (event: string, payload: unknown) => {
        streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      writeEvent('transport', {
        transport: createLiveTransport(externalConfig.model, externalConfig.endpoint),
      })

      try {
        if (!response.ok) {
          const bodyText = await response.text().catch(() => '')
          throw new Error(bodyText || `AI request failed with status ${response.status}`)
        }

        if (!response.body) {
          throw new Error('Response body is empty')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''
        let fullResponseText = ''
        let sentLength = 0
        let pendingActions: MentorAction[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          sseBuffer += decoder.decode(value, { stream: true })

          while (true) {
            const boundaryIndex = sseBuffer.indexOf('\n\n')
            if (boundaryIndex < 0) break

            const eventText = sseBuffer.slice(0, boundaryIndex).trim()
            sseBuffer = sseBuffer.slice(boundaryIndex + 2)

            if (!eventText) continue

            const dataLines = eventText
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())

            for (const dataLine of dataLines) {
              if (dataLine === '[DONE]') continue

              try {
                const chunk = JSON.parse(dataLine) as ZaiStreamChunk
                const content = chunk.choices?.[0]?.delta?.content ?? ''

                if (content) {
                  fullResponseText += content
                  const safe = extractStructuredReplyPreview(fullResponseText)
                  const delta = safe.slice(sentLength)

                  if (delta) {
                    writeEvent('token', { text: delta })
                    sentLength = safe.length
                  }
                }
              } catch {
                // ignore malformed stream chunks
              }
            }
          }
        }

        const { structuredOutput } = parseMentorChatStructuredOutput(
          fullResponseText,
          'mentor-session',
          extractStructuredReplyPreview(fullResponseText),
        )
        const { detectedActions, finalStructuredOutput } =
          finalizePlannerMentorStructuredOutput(structuredOutput)

        if (detectedActions.length > 0) {
          pendingActions = detectedActions
          writeEvent('actions', { actions: pendingActions })
        }

        const assistantReply = finalStructuredOutput.reply.trim()
        const persistedSession = await upsertMentorSession(
          client,
          userId,
          buildSessionWithHistorySummary({
            ...session,
            messages: appendMessage(preAssistantMessages, 'assistant', assistantReply),
            historySummary,
            phase: finalStructuredOutput.phase || 'coaching',
            transport: createLiveTransport(externalConfig.model, externalConfig.endpoint),
            currentLessonId: body.lesson?.id ?? session.currentLessonId ?? null,
          }),
        )

        await upsertMentorMemory({
          title: `メンター相談: ${session.goal.slice(0, 80)}`,
          bullets: [
            `質問: ${incomingMessage.slice(0, 200)}`,
            `回答要約: ${assistantReply.slice(0, 200)}`,
          ],
          source: 'mentor',
        }, client).catch(() => { /* non-blocking */ })

        writeEvent('result', {
          session: persistedSession,
          completed: Boolean(persistedSession.completedAt),
          structuredOutput: finalStructuredOutput,
        })
        writeEvent('done', {
          structuredOutput: finalStructuredOutput,
          session: persistedSession,
        })
      } catch (error) {
        writeEvent('error', {
          error: 'mentor_session_failed',
          message: error instanceof Error ? error.message : 'AIメンター応答の取得に失敗しました。',
          requestId,
        })
      } finally {
        streamController.close()
      }
    },
  })

  return sseResponse(stream, request)
}

// ── TQ-244 sub-agent fan-out helpers ───────────────────────────────────

/**
 * Best-effort domain extraction for Tech-Stack Scout / Tool Scout. Phase 1
 * では goalTree が無い / Mode A 失敗時にも何か返したいため、goal 文と
 * goalTree.objectives を結合した小文字テキストから既知の domain キーワードに
 * 当たれば返す。完全な NLP は不要 — Phase 1 mock fetcher の matching と同程度の
 * 粒度で良い。Phase 3 で Gemini grounding に置き換えれば本関数は使われない。
 */
function deriveGoalDomains(
  goal: string,
  goalTree: GoalTreeDecomposition | null,
): string[] {
  const text = collectGoalText(goal, goalTree).toLowerCase()
  const domains = new Set<string>()
  // catalog と Phase 1 mock の matching に使われる代表 domain。
  if (/(web ?app|webapp|web app|web service|web service)/.test(text)) {
    domains.add('web-app')
  }
  if (/(landing|lp|ランディング)/.test(text)) {
    domains.add('lp')
  }
  if (/(dashboard|ダッシュボード)/.test(text)) {
    domains.add('dashboard')
  }
  if (/(automation|自動化)/.test(text)) {
    domains.add('automation')
  }
  if (/(content|コンテンツ)/.test(text)) {
    domains.add('content')
  }
  // 既定: 何も match しなかったら 'web' を入れて mock を空 findings に
  // させない（Owner UX「最新情報を返している」）。
  if (domains.size === 0) {
    domains.add('web')
  }
  return [...domains]
}

/**
 * Best-effort tech mention extraction for Tech-Stack Scout. Phase 1 mock
 * fetcher が match に使う代表的 stack 名のみを拾う。完全網羅は不要。
 */
function deriveTechMentions(
  goal: string,
  goalTree: GoalTreeDecomposition | null,
): string[] {
  const text = collectGoalText(goal, goalTree).toLowerCase()
  const mentions = new Set<string>()
  for (const kw of [
    'next.js',
    'nextjs',
    'next',
    'vercel',
    'supabase',
    'shadcn',
    'react',
    'typescript',
    'cursor',
    'claude code',
    'codex',
    'v0',
  ]) {
    if (text.includes(kw)) mentions.add(kw)
  }
  return [...mentions]
}

function collectGoalText(
  goal: string,
  goalTree: GoalTreeDecomposition | null,
): string {
  const parts: string[] = [goal]
  if (goalTree?.objectives) {
    for (const obj of goalTree.objectives) {
      if (obj?.title) parts.push(obj.title)
      if (obj?.summary) parts.push(obj.summary)
      if (Array.isArray(obj?.milestones)) {
        for (const m of obj.milestones) {
          if (m?.title) parts.push(m.title)
          if (m?.summary) parts.push(m.summary)
          if (Array.isArray(m?.leafTasks)) {
            for (const leaf of m.leafTasks) {
              if (leaf?.title) parts.push(leaf.title)
              if (leaf?.summary) parts.push(leaf.summary)
            }
          }
        }
      }
    }
  }
  return parts.filter((s) => typeof s === 'string').join(' ')
}

/**
 * TQ-244: Phase 1 で Judge が要求する `AtomCompiledPlan` を最小スタブで
 * 組み立てる。Conductor の REVIEW phase で実 plan を渡す配線は別 TQ
 * (TQ-245+) で実装する。本 stub は **Phase 1 mock heuristic を妥当に
 * 走らせるための場つなぎ** であり、UI / dashboard には流れない。
 */
function buildJudgeStubPlan(goal: string): AtomCompiledPlan {
  return {
    goal,
    goalTags: [],
    steps: [],
    milestones: [],
    coverageScore: 0,
    unsupportedCapabilities: [],
    rationale: 'Phase 1 stub plan for Judge sub-agent (TQ-244 wiring).',
    source: 'topo',
  }
}

type HearingTurnInput = {
  client: Awaited<ReturnType<typeof createClient>>
  userId: string
  goal: string
  plannerSession: PlannerHearingSession | null
  incomingMessage: string | null
  requestId: string | null
  onStreamEvent: (event: HearingStreamEvent) => void
  /**
   * TQ-230: sub-agent fan-out の進捗 callback。
   * Conductor INVESTIGATE phase 経由で `runSubAgentsParallel` から流れてくる。
   * route 層は SSE event `subagent-progress` / `subagent-result` に変換する。
   */
  onSubAgentProgress?: SubAgentProgressCallback
  /**
   * W59 (Audit A3 W12-NEW-1): per-user monthly budget cap context。
   * 認証済み user の `agent_runs` (当月分、metadata->>user_id 一致) を loader で
   * 渡すと Phase 1/3 dispatcher が `assertUserBudgetCap` を発火する。
   * 未指定なら scope なし = 既存 path 互換 (no-op)。
   */
  budgetCap?: MentorBudgetCapContext
}

/**
 * W59: per-user budget cap context を build する。
 *
 * 設計:
 * - service-role client で `decision_ledger.agent_runs` を `metadata->>user_id`
 *   で filter し、当月分 (started_at >= UTC month start) のみ load。
 * - service-role 取得失敗 (env 未設定 / network error) は **null を返す** →
 *   route 側で scope を install しない = 既存挙動。学習体験を壊さない。
 * - loader 内 throw は budget-cap-runtime 側が swallow して通常実行を続行する
 *   契約 (Owner Q5 fail-safe)。ここでは throw は気にせず Promise を返すだけ。
 *
 * @param userId 認証済み userId (`agent_runs.metadata.user_id` に対応)
 */
function buildBudgetCapContext(userId: string): MentorBudgetCapContext | null {
  const service = createServiceClient()
  if (!service) return null

  // ledger schema は database.types に乗っていないため untyped path で叩く。
  // mentor-quality-loader.ts と同じ pattern。
  const ledger = (
    service as unknown as {
      schema: (name: string) => {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              gte: (col: string, val: string) => {
                order: (col: string, opts: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{
                    data: Record<string, unknown>[] | null
                    error: { message: string } | null
                  }>
                }
              }
            }
          }
        }
      }
    }
  ).schema('decision_ledger')

  return {
    userId,
    loadUserRuns: async (): Promise<ReadonlyArray<AgentRunRecord>> => {
      const now = new Date()
      const monthStartIso = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
      ).toISOString()

      const { data, error } = await ledger
        .from('agent_runs')
        .select('id, agent_type, run_status, started_at, finished_at, metadata')
        .eq('metadata->>user_id', userId)
        .gte('started_at', monthStartIso)
        .order('started_at', { ascending: false })
        .limit(500)

      if (error) {
        // budget-cap-runtime 側が catch して fail-safe する契約。ここで握り
        // 潰すと観測点を失うので throw して上に伝える。
        throw new Error(error.message)
      }

      return Array.isArray(data) ? data.map(normalizeAgentRunRow) : []
    },
  }
}

/**
 * TQ-228: Conductor 切替フック。
 *
 * `MENTOR_CONDUCTOR_ENABLED=0` (default) では完全に既存 path
 * (`advanceHearingSessionStream` 直叩き) と同一。Phase 1 では behavior は
 * 等価で、log のみ Conductor 経由になる。
 *
 * `MENTOR_CONDUCTOR_ENABLED=1` で `Conductor` の HEARING phase delegate に
 * 包んで走らせ、router (`pickModelFor`) で解決した model を debug log に
 * 記録する。ヒアリング 1 ターン分しか含まないため、Conductor は
 * `earlyExitOnHearing=true` で即停止する（hearing 完了時のみ後続 phase に
 * 進むが、Phase 1 では SCOPING+ delegate を渡さないので no-op で抜ける）。
 *
 * SCOPING / SYNTH / COMMIT の本実装 (sub-agent fan-out / Goal-Tree /
 * compiled_plans 永続化) は TQ-229+ で順次置換する。
 */
async function runHearingTurn(input: HearingTurnInput) {
  if (!serverEnv.mentorConductorEnabled) {
    return advanceHearingSessionStream(
      input.goal,
      input.plannerSession,
      input.incomingMessage,
      input.onStreamEvent,
      null,
      { allowFallback: false, appRequestId: input.requestId },
    )
  }

  let captured: Awaited<ReturnType<typeof advanceHearingSessionStream>> | null = null

  // W66 (Audit A4 W13-NEW-1): SCOPING / INVESTIGATE delegate が共通で参照する
  // grounded context を 1 リクエスト 1 回だけ取得するためのメモ化 loader。
  // 失敗 (DB 例外 / 未認証) は graceful に空状態で返り、route 全体は壊さない。
  let groundedContextPromise: Promise<MentorGroundedContext> | null = null
  const loadGroundedContext = (): Promise<MentorGroundedContext> => {
    if (!groundedContextPromise) {
      groundedContextPromise = (async () => {
        try {
          // hearing 完了直後は captured.session.personaIds が plannerSession
          // より新しい場合がある (hearing 内で persona 確定する path)。
          // 優先順位: captured > plannerSession.
          const resolvedPersonaIds =
            captured?.session?.personaIds ?? input.plannerSession?.personaIds ?? []
          return await buildMentorGroundedContext({
            client: input.client,
            userId: input.userId,
            goal: input.goal,
            plannerSession: input.plannerSession,
            personaIds: resolvedPersonaIds,
          })
        } catch {
          return {
            learnerProfile: {
              cliFamiliarity: null,
              availableAiTools: [],
              experienceSummary: null,
            },
            pastFrictionSnippets: [],
            planStepBriefs: [],
            personaProfile: null,
            completionCriteria: [],
          }
        }
      })()
    }
    return groundedContextPromise
  }

  const delegates: ConductorDelegates = {
    hearing: async () => {
      const result = await advanceHearingSessionStream(
        input.goal,
        input.plannerSession,
        input.incomingMessage,
        input.onStreamEvent,
        null,
        { allowFallback: false, appRequestId: input.requestId },
      )
      captured = result
      return {
        completed: Boolean(result.session.completedAt),
        payload: result,
      }
    },
    // TQ-229: SCOPING phase delegate — Goal-Tree Decomposer sub-agent。
    // hearing が completed=true の瞬間にだけ Conductor から呼ばれる
    // （未完了時は Conductor が earlyExitOnHearing で返るため非到達）。
    // 失敗しても SYNTH 側に null tree を渡すだけで例外は投げない。
    // SYNTH の本実装は別 TQ なので、現状は payload を log する pass-through。
    scoping: async (ctx, hearing) => {
      const hearingResult = hearing.payload as
        | Awaited<ReturnType<typeof advanceHearingSessionStream>>
        | null
      const session = hearingResult?.session ?? null
      // W66: grounded context (learner_profile + memory + plan) を取得し、
      // goal-tree decomposer に `learnerProfile.{cli_familiarity,
      // available_ai_tools, experience_summary}` を実値で渡す。
      const ground = await loadGroundedContext()
      const subAgent = new GoalTreeSubAgent({ model: ctx.model })
      const out = await subAgent.run({
        goal: input.goal,
        hearingResult: {
          keyPoints: session?.summaryKeyPoints ?? [],
          signals: {},
        },
        learnerProfile: {
          cli_familiarity: ground.learnerProfile.cliFamiliarity,
          available_ai_tools: ground.learnerProfile.availableAiTools,
          experience_summary: ground.learnerProfile.experienceSummary,
        },
        requestId: input.requestId,
        userId: input.userId,
      })
      return { payload: out }
    },
    // TQ-230 + TQ-231: INVESTIGATE phase = sub-agent 並列 fan-out。
    // Phase 2.2 で friction-critic / lesson-matcher / memory-recall の 3 体を
    // GoalTree sub-agent (TQ-229) と並列起動する。1 sub-agent が落ちても残り
    // で継続 (Promise.allSettled 内蔵)、per-agent timeout、`onProgress` で
    // SSE 部分結果 streaming。完了後は best-effort で `decision_ledger.
    // agent_runs` に 1 件ずつ insert（失敗は握り潰し）。
    //
    // Phase 2.2 の限定:
    // - Goal Tree が null の場合 (decomposer 失敗) は friction-critic /
    //   lesson-matcher / memory-recall を skip し fan-out tasks 空で抜ける。
    //   route 全体は壊さない（hearing 完了直後の Conductor pass-through）。
    // - candidateAtoms / negativeFeedback / blockers は Phase 2.2 では空
    //   (caller 配線は TQ-238 で hookup 予定)。memory_recall は recentMemories
    //   だけは即時 fetch する（Owner pain「過去傾向反映」を最低限充足）。
    investigate: async (ctx, scoping) => {
      const tasks: SubAgentTask[] = []
      const scopingPayload = scoping.payload as GoalTreeSubAgentOutput | null
      const goalTree: GoalTreeDecomposition | null = scopingPayload?.tree ?? null

      if (goalTree) {
        // Friction Critic — heuristic ベース、LLM 不要
        tasks.push({
          id: 'friction_critic',
          role: 'non_eng_critic',
          run: async () => {
            // W66: grounded context (learner_profile / 過去 friction memory /
            // active plan steps) を実値で friction-critic に渡し、LLM
            // hallucination を抑える (Audit A4 W13-NEW-1)。
            const ground = await loadGroundedContext()
            const sa = new FrictionCriticSubAgent()
            const out = await sa.run({
              goalTree,
              learnerProfile: {
                cli_familiarity: ground.learnerProfile.cliFamiliarity,
                available_ai_tools: ground.learnerProfile.availableAiTools,
                experience_summary: ground.learnerProfile.experienceSummary,
              },
              ...(ground.planStepBriefs.length > 0
                ? {
                    planDraft: {
                      stepBriefs: ground.planStepBriefs.map((s) => ({
                        stepId: s.stepId,
                        title: s.title,
                        rationale: s.rationale,
                        recommendedTool: s.recommendedTool,
                      })),
                    },
                  }
                : {}),
              ...(ground.pastFrictionSnippets.length > 0
                ? { pastFrictionSnippets: ground.pastFrictionSnippets }
                : {}),
              requestId: input.requestId,
            })
            return {
              payload: out,
              summary: `frictions=${out.frictions.length} score=${out.non_eng_score}`,
            }
          },
        })

        // Lesson-Fit Matcher — deterministic scoring、LLM 不要
        tasks.push({
          id: 'lesson_matcher',
          role: 'lesson_matcher',
          run: async () => {
            // TQ-248: candidateAtoms を pgvector / tag-filter で取得して
            // matcher に渡す。空集合 (retrieval 失敗 / atom 0 件) でも matcher は
            // 全 leaf を gap として返す既存契約のまま。
            const personaIds = input.plannerSession?.personaIds ?? []
            const retrieval = await retrieveCandidateAtomsForGoal({
              goal: input.goal,
              personaIds,
            })
            const sa = new LessonMatcherSubAgent()
            const out = await sa.run({
              goalTree,
              candidateAtoms: retrieval.candidateAtoms,
              learnerProfile: {},
              requestId: input.requestId,
            })
            return {
              payload: out,
              summary:
                `matches=${out.matches.length} gaps=${out.gaps.length} ` +
                `candidates=${retrieval.candidateAtoms.length} via=${retrieval.retrievalMethod}`,
            }
          },
        })
      }

      // Memory Recall — Goal Tree の有無に関わらず動かす
      tasks.push({
        id: 'memory_recall',
        role: 'memory_recall',
        run: async () => {
          let recentMemories: string[] = []
          // best-effort: failure に強い fetch。例外は握り潰し空配列で続行する。
          try {
            recentMemories = await fetchPlannerMentorMemoryBullets(
              input.client,
              input.userId,
              10,
            )
          } catch {
            recentMemories = []
          }
          const sa = new MemoryRecallSubAgent()
          const out = await sa.run({
            recentMemories,
            requestId: input.requestId,
          })
          return {
            payload: out,
            summary: `memories=${recentMemories.length} pacing=${out.suggested_pacing}`,
          }
        },
      })

      // ── TQ-244: 4 additional sub-agents wired into INVESTIGATE fan-out.
      // 5 体目の TieBreaker は本 fan-out 完了後に **conflict 検出時のみ**
      // 起動するため tasks には含めない。各 sub-agent class 内部は
      // 触らず、Phase 1 mock fallback でそのまま動く（実呼び出しは TQ-245）。
      if (goalTree) {
        // Path Planner — deterministic shortest-path、LLM 不要
        tasks.push({
          id: 'path_planner',
          role: 'path_planner',
          run: async () => {
            const sa = new ShortestPathPlannerSubAgent()
            const out = await sa.run({
              goalTree,
              requestId: input.requestId,
            })
            return {
              payload: out,
              summary: `critical=${out.critical_path.length} polish=${out.optional_polish.length} hours=${out.total_hours_estimate}`,
            }
          },
        })
      }

      // Tech-Stack Scout — Phase 1 mock; goalTree から domain / tech mention を抽出
      tasks.push({
        id: 'tech_scout',
        role: 'tech_scout',
        run: async () => {
          // W66: grounded context (active plan steps) を tech-scout に渡し、
          // goal 文も明示する。Phase 3 で Gemini grounding に渡る材料を増やす。
          const ground = await loadGroundedContext()
          const sa = new TechStackScoutSubAgent()
          const out = await sa.run({
            goalDomains: deriveGoalDomains(input.goal, goalTree),
            techMentions: deriveTechMentions(input.goal, goalTree),
            goal: input.goal,
            ...(ground.planStepBriefs.length > 0
              ? {
                  planSteps: ground.planStepBriefs.map((s) => ({
                    title: s.title,
                    rationale: s.rationale,
                    recommendedTool: s.recommendedTool,
                  })),
                }
              : {}),
            requestId: input.requestId,
            userId: input.userId,
          })
          // tech-scout は SubAgentReport 形式で返るので status を引き継ぐ
          return {
            payload: out,
            summary: out.summary,
          }
        },
      })

      // AI Tool Catalog Scout — Phase 1 mock; learnerOSAndCli は最小情報のみ
      tasks.push({
        id: 'tool_scout',
        role: 'tool_scout',
        run: async () => {
          // W66: grounded context (cli_familiarity / plan steps) を tool-scout
          // にも渡し、catalog 推薦ロジックの精度を上げる。
          const ground = await loadGroundedContext()
          const sa = new AiToolCatalogScoutSubAgent()
          const out = await sa.run({
            learnerOSAndCli: {
              os: null,
              cliFamiliarity: ground.learnerProfile.cliFamiliarity,
            },
            goal: input.goal,
            ...(ground.planStepBriefs.length > 0
              ? {
                  planSteps: ground.planStepBriefs.map((s) => ({
                    title: s.title,
                    rationale: s.rationale,
                    recommendedTool: s.recommendedTool,
                  })),
                }
              : {}),
            requestId: input.requestId,
            userId: input.userId,
          })
          return {
            payload: out,
            summary: out.summary,
          }
        },
      })

      // Judge — Phase 1 では plan draft が無いので minimal stub plan で評価する。
      // 本来は Conductor REVIEW phase で実 plan を評価する責務だが、
      // 「9 sub-agent 並列 fan-out」の orphan 解消（TQ-244）のため
      // INVESTIGATE で skeleton run させる。Phase 3 (TQ-245+) で REVIEW 配線。
      tasks.push({
        id: 'judge',
        role: 'judge',
        run: async () => {
          // W66: grounded context (persona profile + completion criteria) を
          // judge に渡し、"非エンジニア対応度" / "fit" の評価を実コンテキスト
          // ベースに引き戻す (Audit A4 W13-NEW-1)。
          const ground = await loadGroundedContext()
          const sa = new JudgeSubAgent()
          const out = await sa.run({
            planDraft: buildJudgeStubPlan(input.goal),
            rubric: 'plan-quality-v1',
            ...(ground.personaProfile
              ? {
                  personaProfile: {
                    cli_familiarity: ground.personaProfile.cliFamiliarity,
                    personaTags: ground.personaProfile.personaTags,
                    available_ai_tools: ground.personaProfile.availableAiTools,
                    experience_summary: ground.personaProfile.experienceSummary,
                    skillLevel: ground.personaProfile.skillLevel,
                  },
                }
              : {}),
            ...(ground.completionCriteria.length > 0
              ? { completionCriteria: ground.completionCriteria }
              : {}),
            requestId: input.requestId,
            userId: input.userId,
          })
          return {
            payload: out,
            summary: `judge.overall=${out.overallScore} action=${out.recommendAction}`,
          }
        },
      })

      const reports = await runSubAgentsParallel(tasks, {
        onProgress: ctx.onSubAgentProgress,
      })

      // ── TQ-244: Tie-Breaker は conditional. 並列 fan-out 完了後に
      // sub-agent reports 群から conflict を検出し、矛盾があれば 1 ショット
      // 実行する。ここで起動した Tie-Breaker は通常の fan-out task 列に
      // 紛れ込ませず、別 SubAgentReport として末尾に append する
      // （SSE progress / persistence への波及を最小化）。
      const tieBreakerReport = await maybeRunTieBreaker({
        goal: input.goal,
        reports,
        onSubAgentProgress: ctx.onSubAgentProgress,
        requestId: input.requestId,
        userId: input.userId,
      })
      const allReports = tieBreakerReport ? [...reports, tieBreakerReport] : reports

      // best-effort persistence — 失敗は内部で握り潰される
      void persistSubAgentReports(allReports, {
        requestId: input.requestId,
        userId: input.userId,
      })
      return { payload: { reports: allReports }, subAgents: allReports }
    },
    // ── TQ-243 + TQ-257: SYNTH phase delegate — 既存
    // `buildAtomPlanFromGoalWithAI` を呼び、Mode A + Mode B 統合 plan を返す。
    // Conductor 経路でも `MENTOR_CONDUCTOR_ENABLED=1` のときに plan が
    // 実コンパイルされる (Auditor 1 C2: 「synth/commit が `payload:null`
    // で dead path」修正)。
    //
    // TQ-257: Auditor 2 C19 解消 — SCOPING で算出済みの Goal Tree
    // (`scoping.payload.tree`) を `precomputedGoalTree` 経由で渡し、
    // Mode A の 2 回呼出を防ぐ。SCOPING 失敗 (tree=null) 時は
    // `buildAtomPlanFromGoalWithAI` 側が従来どおり Mode A を実行する
    // フォールバックを保つ。
    synth: async (_ctx, scoping) => {
      try {
        const scopingPayload = scoping.payload as GoalTreeSubAgentOutput | null
        const precomputedGoalTree: GoalTreeDecomposition | null =
          scopingPayload?.tree ?? null
        const aiPlan = await buildAtomPlanFromGoalWithAI({
          goal: input.goal,
          userId: input.userId,
          // TQ-257: SCOPING で算出済みの Goal Tree を渡し、Mode A 1 回化。
          precomputedGoalTree,
          // hearingSummary / mentorMemoryBullets / learnerState は Phase 1
          // 配線では既存 zai 経路から hearing 経路で吸い上げ済み。Conductor
          // 専用の context propagation は別 TQ (TQ-245+) で実装する。
        })
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.debug('[mentor.session] conductor synth', {
            requestId: input.requestId,
            stepCount: aiPlan?.steps.length ?? 0,
          })
        }
        return { payload: aiPlan }
      } catch (error) {
        // graceful degrade — synth が落ちても route 全体は壊さない。
        // commit は payload=null を見て persist を skip する責務を持つ。
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[mentor.session] conductor synth failed', {
            requestId: input.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return { payload: null }
      }
    },
    // ── TQ-243: COMMIT phase delegate — synth の AtomCompiledPlan を
    // `compiled_plans` テーブルへ persist する。synth が null を返した
    // (失敗 / Phase 1 fallback) 場合は no-op を返す。
    //
    // W53 (Audit B2 CR-1 部分破綻 fix): hearing で確定した先頭 personaId を
    // `compiled_plans.persona_id` に書き込む。これがないと W47 の
    // `/api/plans/compile` skip 経路 (`shouldReuseActivePlan`) で
    // `incomingPersonaId !== activePlan.personaId` (string vs null) と判断され、
    // onboarding confirm 直後の compile が Conductor 出力を上書きしてしまう。
    commit: async (_ctx, synth) => {
      const plan = synth.payload as AtomCompiledPlan | null
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        return { payload: null }
      }
      const personaId = input.plannerSession?.personaIds?.[0] ?? null
      try {
        const persisted = await persistCompiledPlanSnapshot({
          client: input.client,
          userId: input.userId,
          goal: input.goal,
          plan,
          personaId,
          status: 'active',
        })
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.debug('[mentor.session] conductor commit', {
            requestId: input.requestId,
            planId: persisted.planId,
            synced: persisted.synced,
          })
        }
        return { payload: persisted }
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[mentor.session] conductor commit failed', {
            requestId: input.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return { payload: null }
      }
    },
  }

  const conductor = new Conductor()
  const out = await conductor.run({
    requestId: input.requestId,
    userId: input.userId,
    goal: input.goal,
    delegates,
    ...(input.onSubAgentProgress ? { onSubAgentProgress: input.onSubAgentProgress } : {}),
    // W59 (Audit A3 W12-NEW-1): production で budget cap を実発火させるための
    // AsyncLocalStorage scope install。caller (route) が context を組み立てて
    // 渡すと、Conductor.run() が `runWithMentorBudgetCap()` で配下の Phase 1/3
    // helper まで scope を伝播する。未指定 (= service client 失敗 / 認証失敗)
    // 時は legacy 互換 = no-op。
    ...(input.budgetCap ? { budgetCap: input.budgetCap } : {}),
  })

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.debug('[mentor.session] conductor run', {
      requestId: input.requestId,
      finalState: out.finalState,
      earlyExitOnHearing: out.earlyExitOnHearing,
      log: out.log.map((entry) => ({
        state: entry.state,
        role: entry.role,
        model: entry.model,
        ok: entry.ok,
      })),
    })
  }

  if (!captured) {
    throw new Error('conductor returned without invoking hearing delegate')
  }
  return captured
}

async function streamHearingSession(
  request: Request,
  client: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  session: MentorSessionState,
  body: SessionRequestBody,
  requestId: string | null,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const writeEvent = (event: string, payload: unknown) => {
        streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        writeEvent('diagnostic', {
          requestId,
          surface: 'onboarding',
          transport: 'live-hearing',
        })

        // W59: per-user budget cap context を 1 リクエスト 1 回組み立て。
        // service client が無い (env 未設定) / loader 失敗時は scope 無し =
        // 既存 path 互換で続行する (graceful)。
        const budgetCapContext = buildBudgetCapContext(userId)

        const result = await runHearingTurn({
          client,
          userId,
          goal: session.goal,
          plannerSession: toPlannerHearingSession(session),
          incomingMessage: body.message?.trim() || null,
          requestId,
          ...(budgetCapContext ? { budgetCap: budgetCapContext } : {}),
          onStreamEvent: (event: HearingStreamEvent) => {
            if (event.type === 'transport') {
              writeEvent('transport', {
                transport: createLiveTransport(event.transport.model, event.transport.endpoint),
              })
              return
            }

            writeEvent('token', { text: event.text })
          },
          // TQ-230: Conductor INVESTIGATE phase の sub-agent fan-out が emit する
          // 部分結果を SSE event に変換する。
          //   - started/progress → `subagent-progress`
          //   - finished         → `subagent-result`
          // UI 側 (TQ-232 SubAgentProgressPanel) はこの 2 event を listen して
          // 「7 体のサブエージェントが動いている」可視化を行う契約。
          onSubAgentProgress: (event) => {
            if (event.type === 'finished') {
              writeEvent('subagent-result', {
                id: event.id,
                report: event.report,
              })
              return
            }
            writeEvent('subagent-progress', event)
          },
        })

        const persistedSession = await upsertMentorSession(
          client,
          userId,
          buildSessionResult(session, result.session, body.lesson?.id),
        )

        writeEvent('result', {
          session: persistedSession,
          completed: Boolean(persistedSession.completedAt),
          structuredOutput: result.structuredOutput,
        })
        writeEvent('done', {
          structuredOutput: result.structuredOutput,
          session: persistedSession,
        })
      } catch (error) {
        // W59: BudgetCapError は Conductor が SYNTH+ で再 throw してくる。
        // 学習体験を壊さないよう SSE 上で 429 相当の専用 event を流して、UI
        // 側で「今月の利用上限に達しました」 banner に倒せるようにする。
        if (error instanceof BudgetCapError) {
          writeEvent('error', {
            error: 'mentor_budget_cap_exceeded',
            message: '今月のメンター利用上限に達しました。来月またご利用ください。',
            requestId,
            zaiRequestId: null,
            cap: {
              userId: error.userId,
              currentUsd: error.currentUsd,
              // W69: estimateUsd を payload に含めて client 側で
              // projected = currentUsd + estimateUsd を表示できるようにする。
              estimateUsd: error.estimateUsd,
              capUsd: error.capUsd,
            },
          })
        } else {
          writeEvent('error', {
            error: 'mentor_session_failed',
            message:
              error instanceof Error ? error.message : 'AIヒアリングの進行に失敗しました。',
            requestId,
            zaiRequestId: null,
          })
        }
      } finally {
        streamController.close()
      }
    },
  })

  return sseResponse(stream, request)
}

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-session:get', RL_READ)
  if (rlResponse) return rlResponse

  const goal = normalizePlannerGoal(new URL(request.url).searchParams.get('goal') ?? '')
  if (!goal) {
    return jsonResponse({ session: null }, {}, request)
  }

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const session = await getMentorSessionByGoal(client, user.id, goal)
  return jsonResponse({ session }, {}, request)
}

export async function DELETE(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-session:delete', RL_WRITE)
  if (rlResponse) return rlResponse

  const goal = normalizePlannerGoal(new URL(request.url).searchParams.get('goal') ?? '')
  if (!goal) {
    return jsonResponse({ error: 'goal_is_required' }, { status: 400 }, request)
  }

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  await resetMentorSession(client, user.id, goal)
  return jsonResponse({ success: true }, {}, request)
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-session', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, mentorSessionSchema)
  if ('error' in parsed) return parsed.error

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse({ error: 'auth_required', message: '認証が必要です。' }, { status: 401 }, request)
  }

  const body = parsed.data as SessionRequestBody
  const goal = normalizePlannerGoal(body.goal)
  if (!goal) {
    return jsonResponse({ error: 'goal_is_required', message: 'ゴールを入力してください。' }, { status: 400 }, request)
  }

  const session = await resolveSession(client, user.id, {
    ...body,
    goal,
  })
  const currentSession: MentorSessionState = {
    ...session,
    goal,
    canonicalGoalKey: session.canonicalGoalKey || buildMentorCanonicalGoalKey(goal),
    currentLessonId: body.lesson?.id ?? session.currentLessonId ?? null,
  }
  const requestId = getRequestId(request)

  if (body.uiContext?.surface === 'onboarding' && !currentSession.completedAt) {
    return streamHearingSession(request, client, user.id, currentSession, body, requestId)
  }

  return streamCoachingSession(request, client, user.id, currentSession, body, requestId)
}
