import { type APIResponse, type Page, type Route } from '@playwright/test'
import type { PersonaDefinition } from './persona'
import { createLiveAiBudget, type LiveAiBudget } from './live-ai-budget'

/**
 * AI response mocks for Playwright E2E tests.
 *
 * Rationale: real AI calls (Claude/GPT/etc.) are slow, flaky, expensive, and
 * non-deterministic — they are a terrible fit for E2E assertions. Keep them
 * mocked even when we start pointing the rest of the tests at a real local DB.
 *
 * Every helper in this file intercepts an AI-adjacent HTTP endpoint and returns
 * a deterministic fixture. The fixtures intentionally mirror the shape that the
 * production code emits so the UI renders the same way in tests and in dev.
 */

export interface JourneyMetrics {
  hearingTurns: number
  frictionEvents: number
}

interface HearingRouteBody {
  answer?: string
  message?: string | null
  session?: {
    answers?: Record<string, string>
    messages?: Array<{ id?: string; role?: string; content?: string }>
    lastQuestionId?: string | null
  } | null
}

interface PersonaHearingStep {
  id: string
  prompt: string
  retryPrompt: string
}

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
}

const DEFAULT_TRANSPORT = {
  status: 'live',
  label: 'AI 応答 (mock)',
  message: 'mock hearing',
}

const PERSONA_HEARING_STEPS: PersonaHearingStep[] = [
  {
    id: 'industry',
    prompt: '普段どんな業務を担当していますか？',
    retryPrompt: '担当業務がわかるように、もう少し具体的に教えてください。',
  },
  {
    id: 'currentPain',
    prompt: 'いま一番時間がかかっている作業は何ですか？',
    retryPrompt: 'どの作業にどれくらい時間がかかるか、もう少し具体的に教えてください。',
  },
  {
    id: 'toolsAvailable',
    prompt: '今使えるツールやデータソースを教えてください。',
    retryPrompt: 'AI ツール、表計算、BI など使えるものを具体的に教えてください。',
  },
  {
    id: 'timePerWeek',
    prompt: 'この改善に毎週どれくらい時間を使えますか？',
    retryPrompt: '毎週どれくらい時間を使えるか、目安でいいので教えてください。',
  },
]

function buildSseBody(events: Array<{ event: string; data: unknown }>) {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
}

function fulfillSse(route: Route, body: string) {
  return route.fulfill({
    status: 200,
    headers: STREAM_HEADERS,
    body,
  })
}

function parseRouteBody(route: Route): HearingRouteBody {
  try {
    const payload = route.request().postData()
    if (!payload) {
      return {}
    }
    return JSON.parse(payload) as HearingRouteBody
  } catch {
    return {}
  }
}

function normalizeJourneyMetrics(metrics: JourneyMetrics = { hearingTurns: 0, frictionEvents: 0 }) {
  return {
    hearingTurns: metrics.hearingTurns,
    frictionEvents: metrics.frictionEvents,
  } satisfies JourneyMetrics
}

export async function syncJourneyMetrics(page: Page, metrics: JourneyMetrics) {
  try {
    await page.evaluate((value) => {
      const win = window as Window & { __journeyMetrics?: JourneyMetrics }
      win.__journeyMetrics = { ...value }
    }, normalizeJourneyMetrics(metrics))
  } catch {
    // No active document yet; the next navigation will pick up the addInitScript snapshot.
  }
}

export async function installJourneyMetrics(page: Page, metrics: JourneyMetrics = {
  hearingTurns: 0,
  frictionEvents: 0,
}) {
  const snapshot = normalizeJourneyMetrics(metrics)

  await page.addInitScript((value) => {
    const win = window as Window & { __journeyMetrics?: JourneyMetrics }
    win.__journeyMetrics = { ...value }
  }, snapshot)

  await syncJourneyMetrics(page, snapshot)
}

/**
 * Mock SSE hearing response that completes after a few turns.
 * Simulates the /api/planner/hearing endpoint.
 */
export function mockHearingFirstTurn(route: Route) {
  const body = buildSseBody([
    { event: 'transport', data: { transport: DEFAULT_TRANSPORT } },
    { event: 'token', data: { text: 'Web制作の経験はありますか？' } },
    {
      event: 'result',
      data: {
        completed: false,
        session: {
          answers: {},
          insights: {},
          messages: [
            { id: 'mock-hearing-assistant-1', role: 'assistant', content: 'Web制作の経験はありますか？' },
          ],
          lastQuestionId: 'experience',
          transport: { ...DEFAULT_TRANSPORT, message: 'mock' },
          completedAt: null,
        },
        questionChoices: ['初めてです', '少しあります', '実務経験があります'],
      },
    },
    {
      event: 'done',
      data: {
        structuredOutput: {
          reply: 'Web制作の経験はありますか？',
          decisions: [],
          open_questions: ['Web制作経験があるか'],
          next_question: 'Web制作の経験はありますか？',
          next_action: null,
        },
      },
    },
  ])

  return fulfillSse(route, body)
}

/**
 * Mock a completed hearing that triggers plan generation.
 */
export function mockHearingComplete(route: Route) {
  const body = buildSseBody([
    { event: 'transport', data: { transport: { ...DEFAULT_TRANSPORT, message: 'mock' } } },
    { event: 'token', data: { text: 'ありがとうございます。プランを作成します。' } },
    {
      event: 'result',
      data: {
        completed: true,
        session: {
          answers: {
            experience: '初めてです',
            purpose: 'ポートフォリオを作りたい',
            existingMaterials: 'なし',
            operatingSystem: 'mac',
            localWorkCapability: 'できる',
            cliFamiliarity: 'beginner',
            aiTools: 'Claude Code',
          },
          insights: { projectType: 'portfolio', constraints: [], preferences: [] },
          messages: [
            { id: 'mock-hearing-assistant-complete', role: 'assistant', content: 'ありがとうございます。プランを作成します。' },
          ],
          lastQuestionId: null,
          transport: { ...DEFAULT_TRANSPORT, message: 'mock' },
          completedAt: new Date().toISOString(),
          summaryKeyPoints: [
            'ポートフォリオを作りたい',
            '初めての学習者として進める',
            'Claude Code を使って実装したい',
          ],
        },
      },
    },
    {
      event: 'done',
      data: {
        structuredOutput: {
          reply: 'ありがとうございます。プランを作成します。',
          decisions: ['プラン作成に必要な前提が揃った'],
          open_questions: [],
          next_question: null,
          next_action: 'プレビュープランを確認する',
        },
      },
    },
  ])

  return fulfillSse(route, body)
}

/**
 * Mock a persona-driven hearing scenario that follows docs/swarmops/personas.yaml.
 *
 * The response shape intentionally mirrors the existing hearing SSE contract:
 * every request emits transport -> text-delta -> result, and the session object
 * carries answers/messages/lastQuestionId so callers can deterministically
 * continue the conversation turn by turn.
 */
export function mockHearingForPersona(
  route: Route,
  persona: PersonaDefinition,
  metrics?: JourneyMetrics,
) {
  const body = parseRouteBody(route)
  const session = body.session ?? {}
  const answers = {
    ...(session.answers ?? {}),
  }
  const messages = [...(session.messages ?? [])]
  const lastQuestionId = session.lastQuestionId?.trim() || null
  const answer = body.answer?.trim() || body.message?.trim() || null

  if (metrics) {
    metrics.hearingTurns += 1
  }

  if (answer && lastQuestionId) {
    messages.push({ id: `mock-hearing-user-${messages.length + 1}`, role: 'user', content: answer })

    if (answer.length < 6) {
      if (metrics) {
        metrics.frictionEvents += 1
      }

      const retryStep = PERSONA_HEARING_STEPS.find((step) => step.id === lastQuestionId)
      const retryText = retryStep?.retryPrompt ?? 'もう少し具体的に教えてください。'
      const retryBody = buildSseBody([
        { event: 'transport', data: { transport: DEFAULT_TRANSPORT } },
        { event: 'token', data: { text: retryText } },
        {
          event: 'result',
          data: {
            completed: false,
            session: {
              answers,
              insights: { suggestedTrack: persona.expectedTrack },
              messages: [...messages, { id: `mock-hearing-assistant-retry-${messages.length + 1}`, role: 'assistant', content: retryText }],
              lastQuestionId,
              transport: { ...DEFAULT_TRANSPORT, message: 'mock' },
              completedAt: null,
            },
          },
        },
        {
          event: 'done',
          data: {
            structuredOutput: {
              reply: retryText,
              decisions: [],
              open_questions: ['前の回答が短すぎて判断できない'],
              next_question: retryText,
              next_action: null,
            },
          },
        },
      ])

      return fulfillSse(route, retryBody)
    }

    answers[lastQuestionId] = answer
  }

  const nextStep = PERSONA_HEARING_STEPS.find((step) => !answers[step.id])

  if (nextStep) {
    const nextBody = buildSseBody([
      { event: 'transport', data: { transport: DEFAULT_TRANSPORT } },
      { event: 'token', data: { text: nextStep.prompt } },
      {
        event: 'result',
        data: {
          completed: false,
          session: {
            answers,
            insights: { suggestedTrack: persona.expectedTrack },
            messages: [...messages, { id: `mock-hearing-assistant-${nextStep.id}`, role: 'assistant', content: nextStep.prompt }],
            lastQuestionId: nextStep.id,
            transport: { ...DEFAULT_TRANSPORT, message: 'mock' },
            completedAt: null,
          },
        },
      },
      {
        event: 'done',
        data: {
          structuredOutput: {
            reply: nextStep.prompt,
            decisions: [],
            open_questions: ['次の persona hearing 項目を確認する必要がある'],
            next_question: nextStep.prompt,
            next_action: null,
          },
        },
      },
    ])

    return fulfillSse(route, nextBody)
  }

  const completionText = 'ありがとうございます。AI業務自動化プランを提案します。'
  const completionBody = buildSseBody([
    { event: 'transport', data: { transport: { ...DEFAULT_TRANSPORT, message: 'mock' } } },
    { event: 'token', data: { text: completionText } },
    {
      event: 'result',
      data: {
        completed: true,
        session: {
          answers,
          insights: {
            suggestedTrack: persona.expectedTrack,
            personaId: persona.id,
          },
          messages: [...messages, { id: 'mock-hearing-assistant-complete', role: 'assistant', content: completionText }],
          lastQuestionId: null,
          transport: { ...DEFAULT_TRANSPORT, message: 'mock' },
          completedAt: new Date().toISOString(),
          summaryKeyPoints: [
            `${persona.name} 向けの hearing が完了した`,
            `期待トラック: ${persona.expectedTrack}`,
          ],
        },
      },
    },
    {
      event: 'done',
      data: {
        structuredOutput: {
          reply: completionText,
          decisions: ['persona hearing が完了した'],
          open_questions: [],
          next_question: null,
          next_action: '提案されたプランを確認する',
        },
      },
    },
  ])

  return fulfillSse(route, completionBody)
}

/** Mock lesson chat streaming response */
export function mockLessonChat(route: Route) {
  const body = buildSseBody([
    { event: 'token', data: { text: 'Next.js は React ベースのフレームワークです。' } },
    {
      event: 'done',
      data: {
        structuredOutput: {
          reply: 'Next.js は React ベースのフレームワークです。',
          decisions: ['Next.js を学ぶ前提で進める'],
          open_questions: [],
          next_question: null,
          next_action: '公式ドキュメントの概要を確認する',
        },
      },
    },
  ])

  return route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    body,
  })
}

/**
 * Mock lesson chat with an artificial delay before the first text-delta so
 * that UI callers (TQ-124-03) have a visible "connecting / thinking" window
 * to assert against. The delay is controlled by the `delayMs` parameter and
 * defaults to 300ms which is long enough for Playwright to sample the DOM
 * between the request being issued and the first token arriving.
 */
export function mockLessonChatStreaming(route: Route, delayMs = 300) {
  const body = buildSseBody([
    { event: 'transport', data: { transport: { ...DEFAULT_TRANSPORT, message: 'mock streaming' } } },
  ])

  const tail = buildSseBody([
    { event: 'token', data: { text: 'Next.js は ' } },
    { event: 'token', data: { text: 'React ベースのフレームワークです。' } },
    {
      event: 'done',
      data: {
        structuredOutput: {
          reply: 'Next.js は React ベースのフレームワークです。',
          decisions: ['Next.js を学ぶ前提で進める'],
          open_questions: [],
          next_question: null,
          next_action: '公式ドキュメントの概要を確認する',
        },
      },
    },
  ])

  return new Promise<void>((resolvePromise, reject) => {
    setTimeout(() => {
      route
        .fulfill({
          status: 200,
          headers: STREAM_HEADERS,
          body: body + tail,
        })
        .then(() => resolvePromise())
        .catch(reject)
    }, delayMs)
  })
}

interface LessonChatRetrySequenceOptions {
  failureMessage?: string
  failureStatus?: number
  successDelayMs?: number
  successText?: string
}

/**
 * Return a deterministic lesson-chat route handler that fails once with an
 * HTTP error, then succeeds with an SSE stream on the next request.
 */
export function createLessonChatRetrySequence(
  options: LessonChatRetrySequenceOptions = {},
) {
  const {
    failureMessage = '一時的に AI 応答の取得に失敗しました',
    failureStatus = 500,
    successDelayMs = 350,
    successText = 'Next.js は React ベースのフレームワークです。',
  } = options
  let requestCount = 0

  return (route: Route) => {
    requestCount += 1

    if (requestCount === 1) {
      return route.fulfill({
        status: failureStatus,
        contentType: 'application/json',
        body: JSON.stringify({ message: failureMessage }),
      })
    }

    const splitIndex = Math.max(1, Math.ceil(successText.length / 2))
    const body = buildSseBody([
      { event: 'transport', data: { transport: { ...DEFAULT_TRANSPORT, message: 'mock retry success' } } },
      { event: 'token', data: { text: successText.slice(0, splitIndex) } },
      { event: 'token', data: { text: successText.slice(splitIndex) } },
      {
        event: 'done',
        data: {
          structuredOutput: {
            reply: successText,
            decisions: ['リトライ後の回答を受信した'],
            open_questions: [],
            next_question: null,
            next_action: '次の補足質問を1つ考える',
          },
        },
      },
    ])

    return new Promise<void>((resolvePromise, reject) => {
      setTimeout(() => {
        route
          .fulfill({
            status: 200,
            headers: STREAM_HEADERS,
            body,
          })
          .then(() => resolvePromise())
          .catch(reject)
      }, successDelayMs)
    })
  }
}

/**
 * Mock the lesson chat history endpoint used by LessonAiChat on first open.
 * Returns an empty history unless `messages` is supplied.
 */
export function mockLessonChatHistory(route: Route, messages: Array<{ role: 'assistant' | 'user'; content: string }> = []) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ messages }),
  })
}

export function mockEmptyMentorSession(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ session: null }),
  })
}

export function mockMentorSessionRoute(
  postHandler: (route: Route) => Promise<unknown> | unknown,
) {
  return (route: Route) => {
    if (route.request().method() === 'GET') {
      return mockEmptyMentorSession(route)
    }

    return postHandler(route)
  }
}

/** Mock plan review streaming response */
export function mockPlanReview(route: Route) {
  const body = buildSseBody([
    { event: 'text-delta', data: { text: 'プランの調整提案です。' } },
    { event: 'done', data: {} },
  ])

  return route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    body,
  })
}

/** Mock artifact verification (AI-powered evidence check) */
export function mockArtifactVerify(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verification: {
        verified: true,
        milestoneCompleted: true,
        summary: '提出された URL が確認できました。マイルストーンを完了とします。',
        nextMilestoneId: 'ms-2',
        nextMilestoneTitle: '公開されたポートフォリオ',
      },
    }),
  })
}

/**
 * Install the minimum set of AI mocks that any E2E spec needs when exercising
 * planner / lesson / mentor flows. The handlers are installed with `**` globs so
 * they override regardless of the origin the app is running under.
 *
 * Intentionally scoped to AI endpoints only — everything else should talk to the
 * real local Supabase instance set up by the DB helpers.
 */
export async function mockAiResponses(
  page: Page,
  options: { hearingMode?: 'first-turn-only' | 'complete-after-one-turn' } = {},
) {
  const { hearingMode = 'complete-after-one-turn' } = options
  const journeyMetrics: JourneyMetrics = {
    hearingTurns: 0,
    frictionEvents: 0,
  }

  await installJourneyMetrics(page, journeyMetrics)

  if (hearingMode === 'first-turn-only') {
    const hearingHandler = async (route: Route) => {
      journeyMetrics.hearingTurns += 1
      await syncJourneyMetrics(page, journeyMetrics)
      return mockHearingFirstTurn(route)
    }
    await page.route('**/api/planner/hearing', hearingHandler)
    await page.route('**/api/mentor/session', hearingHandler)
  } else {
    let hearingCallCount = 0
    const hearingHandler = async (route: Route) => {
      hearingCallCount += 1
      journeyMetrics.hearingTurns += 1
      await syncJourneyMetrics(page, journeyMetrics)

      if (hearingCallCount <= 1) {
        return mockHearingFirstTurn(route)
      }

      return mockHearingComplete(route)
    }
    await page.route('**/api/planner/hearing', hearingHandler)
    await page.route('**/api/mentor/session', hearingHandler)
  }

  await page.route('**/api/lessons/*/chat', mockLessonChat)
  await page.route('**/api/planner/plan-review', mockPlanReview)
  await page.route('**/api/artifacts/verify', mockArtifactVerify)
}

// ---------------------------------------------------------------------------
// TQ-123: live AI opt-in path
// ---------------------------------------------------------------------------

/**
 * Reasons the live AI path can fall back to mock. Kept as a union so logs stay
 * greppable (`[live-ai:fallback:rate_limit]` etc).
 */
export type LiveAiFallbackReason =
  | 'rate_limit'
  | 'server_error'
  | 'timeout'
  | 'abort'
  | 'network_error'
  | 'missing_api_key'

export interface LiveAiSession {
  /** true iff AI_LIVE_E2E=1 AND ZAI_API_KEY is present (live route installed). */
  isLive: boolean
  /** Budget tracker. Always present (even in mock mode, it is a no-op guard). */
  budget: LiveAiBudget
  /** Finish + report fallback summary (call at end of test). */
  finish(): {
    isLive: boolean
    callCount: number
    fallbackCount: number
    fallbackReasons: LiveAiFallbackReason[]
    budget: ReturnType<LiveAiBudget['snapshot']>
  }
}

export interface UseLiveAiOptions {
  persona: PersonaDefinition
  metrics?: JourneyMetrics
  budget?: LiveAiBudget
  /**
   * Custom logger invoked on every fallback. Defaults to console.warn with the
   * `[live-ai:fallback:${reason}]` prefix so the log line is greppable in CI.
   */
  onFallback?: (reason: LiveAiFallbackReason, detail?: unknown) => void
  /**
   * Per-request live fetch timeout in ms. Defaults to `AI_LIVE_E2E_TIMEOUT_MS`
   * (env) or 30_000. On timeout we fall back to mock.
   */
  timeoutMs?: number
  /**
   * Force the live handler on regardless of env. Used by the fallback unit
   * spec to exercise the 429 / 5xx / timeout paths deterministically.
   */
  forceLive?: boolean
  /**
   * Override the fetch used by the live handler. Used by specs to simulate
   * provider RED without needing a real upstream. When supplied we skip the
   * `ZAI_API_KEY` check, because the intent is to test the fallback logic.
   */
  fetchImpl?: (route: Route, timeoutMs: number) => Promise<APIResponse>
}

function parseTokensHeader(response: APIResponse): number {
  const raw = response.headers()['x-live-ai-usage-tokens']
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Install a hearing endpoint handler that — depending on `AI_LIVE_E2E` — either
 * bypasses the mock to hit the real Next.js route (which in turn calls GLM-5
 * via ZAI), or falls back to `mockHearingForPersona`. On provider errors (429,
 * 5xx, AbortError, timeout) the handler auto-degrades to mock to keep the
 * journey green, emitting `[live-ai:fallback:${reason}]` to console for the
 * TQ-118 criteria-violations collector to pick up.
 *
 * Budget is enforced up-front (consumeCall) and on token headers. Exceeding the
 * budget throws — tests must surface that as RED, not silently degrade.
 *
 * Other AI endpoints (plan-review, lesson chat, artifact verify) remain mocked
 * via `mockAiResponses` / `mockPlanReview` etc. This helper is scoped to the
 * planner hearing SSE stream only; that is the endpoint that exercises
 * GLM-5 most directly in the P-ENG-PROTOTYPE journey.
 */
export async function useLiveAi(page: Page, opts: UseLiveAiOptions): Promise<LiveAiSession> {
  const liveFlag = process.env.AI_LIVE_E2E === '1'
  const hasKey = Boolean(process.env.ZAI_API_KEY?.trim() || process.env.ZAI_PLANNER_API_KEY?.trim())
  const budget = opts.budget ?? createLiveAiBudget()
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AI_LIVE_E2E_TIMEOUT_MS ?? 30_000)
  const fetchImpl = opts.fetchImpl ?? ((route) => route.fetch({ timeout: timeoutMs }))

  const fallbackReasons: LiveAiFallbackReason[] = []
  let callCount = 0

  const logFallback = opts.onFallback ?? ((reason, detail) => {
    console.warn(`[live-ai:fallback:${reason}]`, detail ?? '')
  })

  const metrics = opts.metrics ?? { hearingTurns: 0, frictionEvents: 0 }
  await installJourneyMetrics(page, metrics)

  // `forceLive` or a custom fetchImpl short-circuits the env check — specs use
  // this to exercise the fallback path deterministically regardless of env.
  const isLive = Boolean(opts.forceLive || opts.fetchImpl) || (liveFlag && hasKey)

  async function fallbackTo(route: Route, reason: LiveAiFallbackReason, detail?: unknown) {
    fallbackReasons.push(reason)
    logFallback(reason, detail)

    const url = route.request().url()
    if (/\/api\/(?:planner\/hearing|mentor\/session)/.test(url)) {
      await mockHearingForPersona(route, opts.persona, metrics)
      return
    }

    // For /api/plans/compile and any other future live endpoint, defer to the
    // next matching Playwright route (typically the setupWizardMocks handler
    // installed earlier). This preserves mock semantics without duplicating
    // fixtures inside the live helper.
    try {
      await route.fallback()
    } catch {
      // Last-ditch: abort so Playwright surfaces a visible failure rather than
      // a silent hang. The @live-ai tag guards against this affecting default
      // verify runs.
      await route.abort('failed')
    }
  }

  async function liveHandler(route: Route) {
    callCount += 1
    budget.consumeCall() // throws on over-budget — surfaced as test RED

    if (/\/api\/(?:planner\/hearing|mentor\/session)/.test(route.request().url())) {
      metrics.hearingTurns += 1
      await syncJourneyMetrics(page, metrics)
    }

    let response: APIResponse | null = null
    let caught: unknown = null

    try {
      response = await fetchImpl(route, timeoutMs)
    } catch (err) {
      caught = err
    }

    if (caught) {
      const name = (caught as Error | null)?.name ?? ''
      const message = String((caught as Error | null)?.message ?? '')
      let reason: LiveAiFallbackReason = 'network_error'
      if (name === 'AbortError' || message.toLowerCase().includes('abort')) {
        reason = 'abort'
      } else if (message.toLowerCase().includes('timeout')) {
        reason = 'timeout'
      }

      await fallbackTo(route, reason, message)
      return
    }

    if (!response) {
      await fallbackTo(route, 'network_error', 'no response')
      return
    }

    const status = response.status()

    if (status === 429) {
      await fallbackTo(route, 'rate_limit', { status })
      return
    }

    if (status >= 500 && status < 600) {
      await fallbackTo(route, 'server_error', { status })
      return
    }

    // Happy path — pass the live response through. Consume token budget if
    // the server advertised usage via the X-Live-Ai-Usage-Tokens header.
    const tokensUsed = parseTokensHeader(response)
    if (tokensUsed > 0) {
      budget.consumeTokens(tokensUsed)
    }

    await route.fulfill({ response })
  }

  if (!isLive) {
    if (liveFlag && !hasKey) {
      // logged once so the skip reason is visible in logs even if the test itself
      // was filtered out by grep-invert upstream.
      logFallback('missing_api_key')
      fallbackReasons.push('missing_api_key')
    }
    // Default (mock) path — identical to mockHearingForPersona behaviour used
    // elsewhere, so live-ai-off callers keep previous semantics.
    const hearingHandler = async (route: Route) => {
      await mockHearingForPersona(route, opts.persona, metrics)
      await syncJourneyMetrics(page, metrics)
    }
    await page.route('**/api/planner/hearing', hearingHandler)
    await page.route('**/api/mentor/session', hearingHandler)
  } else {
    // Install live handler for both the planner hearing SSE endpoint and the
    // plans/compile endpoint — the wizard (P-ENG-PROTOTYPE lane) exercises
    // compile, the legacy mentor workspace exercises hearing. Both are ZAI-
    // backed on the server side.
    await page.route('**/api/planner/hearing', liveHandler)
    await page.route('**/api/mentor/session', liveHandler)
    await page.route('**/api/plans/compile', liveHandler)
  }

  return {
    isLive,
    budget,
    finish() {
      return {
        isLive,
        callCount,
        fallbackCount: fallbackReasons.length,
        fallbackReasons: [...fallbackReasons],
        budget: budget.snapshot(),
      }
    },
  }
}
