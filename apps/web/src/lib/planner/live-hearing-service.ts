import {
  buildHearingPurposePrompt,
  buildImplicitHearingAnswers,
  buildPlannerHearingPayload,
  createLocalHearingTurn,
  inferLocalHearingAnswerPatch,
  inferHearingInsights,
  mergeHearingAnswers,
  mergeHearingInsights,
  sanitizeHearingInsights,
} from '@/lib/planner/hearing'
import * as Sentry from '@sentry/nextjs'
import type {
  PlannerConversationMessage,
  PlannerHearingAnswers,
  PlannerHearingInsights,
  PlannerHearingSession,
  PlannerHearingTransport,
  PlannerHearingTurnResult,
} from '@/lib/planner/types'
import { extractJsonCandidate, extractStreamingJsonFieldPreview } from '@/lib/planner/json-stream'
import { DEFAULT_ZAI_MODEL, getExternalPlannerConfig, type ZaiStreamChunk } from '@/lib/planner/zai'
import { type AiPersonalizationContext, formatPersonalizationPayload } from '@/lib/planner/ai-personalization'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import {
  buildMentorChatStructuredOutputFallback,
  parseMentorChatStructuredOutput,
} from '@/lib/chat/structured-output'
import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'

type HearingSessionWithSummary = PlannerHearingSession & {
  summaryKeyPoints?: string[]
  personaIds?: string[]
}

type HearingConfidence = 'low' | 'medium' | 'high'

type HearingModelPayload = {
  reply?: string | null
  assistantMessage?: string | null
  completed?: boolean
  /**
   * TQ-225: Dynamic early-end signal. When the model decides the Goal is
   * already extractable, it sets `is_goal_clear=true` so the service can stop
   * asking further questions instead of running through `MAX_ASSISTANT_TURNS`.
   */
  is_goal_clear?: boolean | null
  /**
   * TQ-225: Confidence on the early-end decision. We only honor early end
   * when confidence is `medium` or `high` to avoid premature termination on
   * thin context.
   */
  confidence?: HearingConfidence | null
  /**
   * TQ-225: Optional `next_question` echo. When `is_goal_clear=true` the
   * model is expected to return `null` here. This field is informational
   * for diagnostics; `reply` remains the source of truth for what the user
   * sees.
   */
  next_question?: string | null
  answers?: Partial<PlannerHearingAnswers>
  insights?: Partial<PlannerHearingInsights>
  summaryKeyPoints?: string[] | null
  personaIds?: string[] | null
}

function sanitizeConfidence(value: unknown): HearingConfidence | null {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }
  return null
}

const SUPPORTED_PERSONA_IDS: ReadonlySet<string> = new Set([
  'persona.web-builder',
  'persona.ai-content-creator',
  'persona.ai-app-builder',
  // W49 (2026-05-09) salvaged from TQ-203: マーケター / Instagram 自動化 /
  // 献立プランナー / EC 運営者 ペルソナを sanitizePersonaIds が黙って drop
  // する事象 (GAP-04) を解消。
  'persona.crm-builder',
  'persona.instagram-automator',
  'persona.meal-planner',
  'persona.ec-operator',
  // W67 (2026-05-09 / Wave 14, Audit A4 b-axis + B4 #3): 非エンジニア向け
  // Web アプリ persona。graduation matrix では canonical key として既に
  // 使われていたが、live-hearing path では synthetic ID として黙って drop
  // されていた。anchor yaml (anchor.noneng-webapp.start) と DB seed と同期
  // して 9/9 persona 全開を達成する。
  'persona.noneng-webapp',
])

// =============================================================================
// W49 (2026-05-09) salvaged from TQ-209: goalCategory inference + heuristic
// hearing extraction + vague goal detection.
//
// 元 worktree (mentor-sim → 本番 port) からのロジックを、現在の主要 hearing
// path に non-breaking で再導入する。これらは現在 stand-alone export として
// 提供する (将来的に prompt builder / completion check と再結線する余地を残す)。
// 既存挙動は変更しない (importer なしの dead 函数化を避けるため __testInternals
// 経由で外部から呼び出し可能)。
// =============================================================================

/**
 * Goal category 粗判定の結果。
 *
 * - `marketer-app`: 顧客リスト/CRM/予約/在庫など個人事業主の業務アプリ系
 * - `lp-copy`: LP / ランディング / コピー / A/B テスト系
 * - `sns-batch`: Instagram / X / SNS / 投稿バッチ系
 * - `general`: 上記いずれにも明確に当てはまらない (Web サイト一般 / 学習者要件未確定)
 */
export type HearingGoalCategory = 'marketer-app' | 'lp-copy' | 'sns-batch' | 'general'

const MARKETER_APP_KEYWORDS = [
  '顧客',
  'crm',
  'リード',
  '営業',
  '受注',
  '予約',
  '在庫',
  '発注',
  '請求',
  '見積',
  '案件管理',
  'タスク管理',
  '顧客管理',
  '顧客フォロー',
  'フォロー',
  '個人事業主',
  '業務アプリ',
  'クライアント',
] as const

const LP_COPY_KEYWORDS = [
  'lp',
  'ランディング',
  'ランディングページ',
  'コピー',
  'a/b',
  'ab テスト',
  'abテスト',
  '訴求',
  'キャッチコピー',
  'キャッチ',
  'セールスコピー',
  'セールスレター',
  '広告文',
] as const

const SNS_BATCH_KEYWORDS = [
  'instagram',
  'インスタ',
  'twitter',
  ' x ',
  'tiktok',
  'youtube',
  'sns',
  '投稿',
  'バッチ',
  'フォロワー',
  'ハッシュタグ',
  '配信',
  'リール',
  'ショート動画',
] as const

function normalizeGoalCategoryHaystack(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(haystack: string, keywords: readonly string[]) {
  if (!haystack) return false
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
}

/**
 * goal text + 既存 answers / insights から goalCategory を粗判定する。
 *
 * - 引数の値はそのまま参照する (副作用なし)。
 * - 不明な場合は 'general' を返す (既存 path を維持)。
 *
 * SNS / LP は marketer-app 系語彙とも被るため、SNS と LP を先に判定する。
 */
export function inferGoalCategory(
  goalText: string | null | undefined,
  answers?: Partial<PlannerHearingAnswers> | null,
  insights?: Partial<PlannerHearingInsights> | null,
): HearingGoalCategory {
  const haystack = normalizeGoalCategoryHaystack(
    [
      goalText ?? '',
      answers?.purpose ?? '',
      insights?.buildGoal ?? '',
      Array.isArray(insights?.preferences) ? insights?.preferences.join(' ') : '',
      Array.isArray(insights?.mustHaveFeatures) ? insights?.mustHaveFeatures.join(' ') : '',
    ].join(' '),
  )

  if (!haystack) {
    return 'general'
  }

  if (containsAny(haystack, SNS_BATCH_KEYWORDS)) {
    return 'sns-batch'
  }

  if (containsAny(haystack, LP_COPY_KEYWORDS)) {
    return 'lp-copy'
  }

  if (containsAny(haystack, MARKETER_APP_KEYWORDS)) {
    return 'marketer-app'
  }

  return 'general'
}

const HEURISTIC_AI_TOOL_KEYWORDS: ReadonlyArray<string> = [
  'ChatGPT',
  'Claude',
  'Notion AI',
  'Gemini',
  'Copilot',
  'Perplexity',
]

const HEURISTIC_AUDIENCE_KEYWORDS: ReadonlyArray<string> = [
  'Instagram',
  'TikTok',
  'X (旧 Twitter)',
  'Twitter',
  'YouTube',
  'LinkedIn',
  'Facebook',
]

const HEURISTIC_OS_KEYWORDS: ReadonlyArray<string> = [
  'macOS',
  'Mac',
  'Windows',
  'Linux',
]

function collectUserUtteranceBuffer(messages: PlannerConversationMessage[] | undefined) {
  return (messages ?? [])
    .filter((message) => message.role === 'user' && typeof message.content === 'string')
    .map((message) => message.content)
    .join('\n')
}

function findFirstKeywordHit(buffer: string, keywords: ReadonlyArray<string>): string | null {
  const lowerBuffer = buffer.toLowerCase()
  for (const keyword of keywords) {
    if (lowerBuffer.includes(keyword.toLowerCase())) {
      return keyword
    }
  }

  return null
}

/**
 * user utterance buffer から aiTools / audience / operatingSystem の literal を
 * 後処理 lift する。LLM が structured_output で値を埋めていれば override しない
 * (idempotent)。aiTools / audience / OS が空のまま `ready_to_plan` 確定する事故
 * を防ぐ R4-FIX-02 (mentor-sim) 由来。
 *
 * **W49 注**: 現在は完了経路への結線は行わず、stand-alone 関数として export する。
 * 将来的に requestParsedLiveTurn の merge 後に呼び出して採用する設計余地を残す。
 */
export function applyHeuristicHearingExtraction(
  answers: Partial<PlannerHearingAnswers>,
  insights: PlannerHearingInsights,
  messages: PlannerConversationMessage[] | undefined,
): { answers: Partial<PlannerHearingAnswers>; insights: PlannerHearingInsights } {
  const buffer = collectUserUtteranceBuffer(messages)

  if (!buffer.trim()) {
    return { answers, insights }
  }

  const nextAnswers: Partial<PlannerHearingAnswers> = { ...answers }
  const nextInsights: PlannerHearingInsights = { ...insights }

  if (!answers.aiTools?.trim()) {
    const hit = findFirstKeywordHit(buffer, HEURISTIC_AI_TOOL_KEYWORDS)
    if (hit) {
      nextAnswers.aiTools = hit
    }
  }

  if (!insights.audience?.trim()) {
    const hit = findFirstKeywordHit(buffer, HEURISTIC_AUDIENCE_KEYWORDS)
    if (hit) {
      nextInsights.audience = hit
    }
  }

  if (!answers.operatingSystem?.trim()) {
    const hit = findFirstKeywordHit(buffer, HEURISTIC_OS_KEYWORDS)
    if (hit) {
      nextAnswers.operatingSystem = hit
    }
  }

  return { answers: nextAnswers, insights: nextInsights }
}

const VAGUE_GOAL_KEYWORDS = ['改善', '伸ばし', '良く', '整え', 'なんとか', '向上'] as const

/**
 * vague な general goal を検出する小 helper (R7-FIX-02 由来)。
 *
 * 「マーケティングを改善したい」「数字を伸ばしたい」のように低情報量で抽象的な
 * goal は、LLM が discovering から脱出できず turn を消費し、最終 turn で
 * 会話履歴が肥大化した状態で ZAI per-attempt timeout (p95=114s) に到達して
 * fallback 落ちするパターンが Round 6 で観測された。
 *
 * 判定ロジック (保守的):
 * - goal text が空 / 16 字未満
 * - かつ vague keyword (改善 / 伸ばし / 良く / 整え / なんとか / 向上) を含む
 *   または answers.purpose が空 / 同 keyword を含む
 *
 * 具体的な marketer 系 goal (顧客リスト / LP / SNS など) は inferGoalCategory が
 * 先に marketer-app / lp-copy / sns-batch を返すため、ここに来ない (この helper の
 * 呼び出し元で goalCategory === 'general' を確認した上で呼ぶ前提)。
 */
export function isVagueGoal(
  goalText: string | null | undefined,
  answers?: Partial<PlannerHearingAnswers> | null,
): boolean {
  const trimmedGoal = (goalText ?? '').trim()
  if (!trimmedGoal) {
    return false
  }
  if (trimmedGoal.length >= 16) {
    return false
  }
  const purpose = (answers?.purpose ?? '').trim()
  const haystack = `${trimmedGoal} ${purpose}`
  return VAGUE_GOAL_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

type ZaiNonStreamingResponse = {
  request_id?: string | null
  output_text?: string
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

type StreamingReadResult = {
  rawText: string
  sawStreamChunk: boolean
}

type LiveResponseFormat = 'json_object' | 'text'

type LiveRequestMeta = {
  endpoint: string
  model: string
  retryAttempt: number
  promptLength: number
  requestBytes: number
  messageCount: number
  stream: boolean
  responseFormat: LiveResponseFormat
  latencyMs?: number
  status?: number
  bodySnippet?: string
  rawTextSnippet?: string
  sawStreamChunk?: boolean
  appRequestId?: string | null
  zaiRequestId?: string | null
  requestId?: string | null
}

type RequestResponseOptions = {
  retryAttempt: number
  responseFormat: LiveResponseFormat
  model: string
  useStreaming: boolean
  appRequestId?: string | null
}

type ZaiHealthProbeOptions = {
  responseFormat?: LiveResponseFormat
  stream?: boolean
}

type HearingExecutionOptions = {
  allowFallback?: boolean
  appRequestId?: string | null
  /**
   * Legacy regex-based fast intake path. As of TQ-210 the canonical hearing
   * path is Live AI (GLM-5/ZAI). This option is only honored when the
   * environment variable `MENTOR_FAST_INTAKE_FALLBACK=1` is set, in which
   * case the caller explicitly opts into the deterministic legacy path
   * (e.g. for offline E2E or rate-limited fallback). Default behavior is
   * always Live AI.
   */
  preferFastIntake?: boolean
}

function isFastIntakeFallbackEnabled() {
  return process.env.MENTOR_FAST_INTAKE_FALLBACK === '1'
}

export type ZaiHealthProbeResult = {
  ok: boolean
  available: boolean
  model?: string
  endpoint?: string
  status?: number
  latencyMs?: number
  bodySnippet?: string
  rawTextSnippet?: string
  promptLength?: number
  requestBytes?: number
  messageCount?: number
  stream: boolean
  responseFormat: LiveResponseFormat
  sawStreamChunk?: boolean
  parsed?: boolean
  zaiRequestId?: string | null
  error?: string
}

const ZAI_HEALTH_CHECK_MAX_TOKENS = 512

class ZaiHearingError extends Error {
  readonly meta: LiveRequestMeta

  constructor(message: string, meta: LiveRequestMeta, cause?: unknown) {
    super(message)
    this.name = 'ZaiHearingError'
    this.meta = meta

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

// Give resumed live hearing turns more time before falling back to local mode.
const LIVE_HEARING_TIMEOUT_MS = 30_000
const LIVE_HEARING_RETRY_BACKOFF_MS = [1000, 2000] as const
/**
 * TQ-225: Tightened assistant turn budget. Was 8 (matched the legacy fixed
 * 8-question scaffold) but the Owner KPI `max_steps_to_first_lesson=6`
 * required a structurally shorter loop. With early-end signals we usually
 * stop earlier than 6, but this is the hard ceiling.
 */
const MAX_ASSISTANT_TURNS = 6
/**
 * TQ-225: We always make the model ask at least this many questions before
 * honoring an early-end signal. Below this floor the AI cannot have collected
 * enough context to know the Goal — the safety net forces at least
 * `goal -> answer 1 -> answer 2` so purpose / persona / scope have a chance
 * of being heard. This counts assistant turns, not total messages.
 */
const MIN_ASSISTANT_TURNS_BEFORE_EARLY_END = 2
const SUMMARY_POINT_LIMIT = 10
const OPTIONAL_HEARING_TOPICS = [
  'Webアプリなら最初に動かしたい機能',
  'サイトなら最初のページで伝えたい内容',
  '静的ページで足りるか、フォーム/DB/ログインが必要か',
  'Next.js / Supabase が必要なWebアプリか、HTML/CSSで開始できるサイトか',
  'ユーザーが自分から言った対象者や公開タイミング',
  '既存素材や参考サイト',
  'PC の OS とローカル作業条件',
  'パソコンで何かを作った経験',
  '使える AI ツール',
  '会社 PC 制限やブロッカー',
] as const

function getPromptLength(messages: Array<{ content?: string }>) {
  return messages.reduce((total, message) => total + (message.content?.length ?? 0), 0)
}

function createLiveRequestMeta(
  endpoint: string,
  body: {
    model: string
    messages: Array<{ content?: string }>
  },
  options: RequestResponseOptions,
): LiveRequestMeta {
  return {
    endpoint,
    model: options.model,
    retryAttempt: options.retryAttempt,
    promptLength: getPromptLength(body.messages),
    requestBytes: JSON.stringify(body).length,
    messageCount: body.messages.length,
    stream: options.useStreaming,
    responseFormat: options.responseFormat,
    appRequestId: options.appRequestId ?? null,
  }
}

function createZaiHearingError(
  message: string,
  meta: LiveRequestMeta,
  cause?: unknown,
) {
  return new ZaiHearingError(message, meta, cause)
}

function getZaiErrorMeta(error: unknown): LiveRequestMeta | null {
  return error instanceof ZaiHearingError ? error.meta : null
}

function normalizeRawSnippet(value: string | null | undefined, limit = 240) {
  return value?.replace(/\s+/g, ' ').trim().slice(0, limit) ?? ''
}

function emitStructuredHearingLog(
  level: 'warn' | 'error',
  message: string,
  meta: Record<string, unknown>,
) {
  console[level](`[hearing] ${message}`, meta)
}

function looksLikeJsonPayload(rawText: string) {
  const trimmed = rawText.trim()

  return (
    trimmed.startsWith('{')
    || trimmed.startsWith('[')
    || trimmed.includes('"reply"')
    || trimmed.includes('"assistantMessage"')
  )
}

export type HearingStreamEvent =
  | {
      type: 'text-delta'
      text: string
    }
  | {
      type: 'transport'
      transport: PlannerHearingTransport
    }

function createBaseLiveSession(goal: string, transport: PlannerHearingTransport): HearingSessionWithSummary {
  return {
    answers: {},
    insights: inferHearingInsights(goal, {}),
    messages: [
      {
        id: 'goal',
        role: 'user',
        content: `目標: ${goal.trim() || 'Webサイトを公開したい'}`,
      },
    ],
    lastQuestionId: null,
    transport,
    completedAt: null,
    summaryKeyPoints: [],
    personaIds: [],
  }
}

function sanitizeAnswers(answers: Partial<PlannerHearingAnswers> | undefined): Partial<PlannerHearingAnswers> {
  return {
    experience: answers?.experience?.trim() ?? '',
    purpose: answers?.purpose?.trim() ?? '',
    siteBehavior: answers?.siteBehavior?.trim() ?? '',
    existingMaterials: answers?.existingMaterials?.trim() ?? '',
    operatingSystem: answers?.operatingSystem?.trim() ?? '',
    localWorkCapability: answers?.localWorkCapability?.trim() ?? '',
    cliFamiliarity: answers?.cliFamiliarity?.trim() ?? '',
    aiTools: answers?.aiTools?.trim() ?? '',
  }
}

function sanitizeMessages(messages: PlannerConversationMessage[] | undefined) {
  return (messages ?? [])
    .filter((message) => (message.role === 'assistant' || message.role === 'user') && message.content?.trim())
    .slice(-18)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.trim(),
    }))
}

function sanitizeSummaryKeyPoints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, SUMMARY_POINT_LIMIT)
    .map((item) => item.slice(0, 500))
}

function getSessionSummaryKeyPoints(session: PlannerHearingSession | null | undefined) {
  return sanitizeSummaryKeyPoints((session as HearingSessionWithSummary | null | undefined)?.summaryKeyPoints)
}

function sanitizePersonaIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || !SUPPORTED_PERSONA_IDS.has(trimmed) || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= 2) break
  }

  return result
}

function getSessionPersonaIds(session: PlannerHearingSession | null | undefined) {
  return sanitizePersonaIds((session as HearingSessionWithSummary | null | undefined)?.personaIds)
}

function sanitizeSession(session: PlannerHearingSession | null | undefined): HearingSessionWithSummary | null {
  if (!session) {
    return null
  }

  return {
    answers: sanitizeAnswers(session.answers),
    insights: sanitizeHearingInsights(session.insights),
    messages: sanitizeMessages(session.messages),
    lastQuestionId: session.lastQuestionId ?? null,
    transport: session.transport,
    completedAt: session.completedAt ?? null,
    summaryKeyPoints: getSessionSummaryKeyPoints(session),
    personaIds: getSessionPersonaIds(session),
  }
}

function buildTransport(status: PlannerHearingTransport['status'], model?: string, endpoint?: string, message?: string) {
  return {
    status,
    label:
      status === 'live'
        ? 'ZAI coding plan'
        : status === 'unavailable'
          ? 'ZAI live 未利用'
          : 'ローカル hearing (簡易モード)',
    message:
      message ??
      (status === 'live'
        ? 'ZAI Coding Plan endpoint 上で open-ended hearing を進めています。'
        : status === 'unavailable'
          ? 'ZAI live 経路が未設定または未接続のため、ローカルの簡易モードへ切り替えています。'
          : 'ZAI hearing が使えないため、ローカルの簡易モードで最小限の前提だけ確認しています。'),
    model,
    endpoint,
  } satisfies PlannerHearingTransport
}

function buildFastIntakeTransport(model?: string, endpoint?: string) {
  return {
    status: 'live',
    label: 'AIメンター',
    message: '初回ヒアリングは高速処理で前提を整理し、プラン作成でAIに引き継ぎます。',
    model,
    endpoint,
  } satisfies PlannerHearingTransport
}

function isGoalMessage(message: PlannerConversationMessage) {
  return message.id === 'goal' || /^目標:\s*/.test(message.content)
}

function hasAnyAnswerValue(answers: Partial<PlannerHearingAnswers>) {
  return Object.values(answers).some((value) => typeof value === 'string' && value.length > 0)
}

function inferAnswersFromMessages(
  currentAnswers: Partial<PlannerHearingAnswers>,
  messages: PlannerConversationMessage[],
) {
  const sanitized = sanitizeAnswers(currentAnswers)

  if (hasAnyAnswerValue(sanitized)) {
    return sanitized
  }

  return messages.reduce((answers, message) => {
    if (message.role !== 'user' || isGoalMessage(message)) {
      return answers
    }

    return mergeHearingAnswers(answers, inferLocalHearingAnswerPatch(message.content, answers))
  }, sanitized)
}

function hydrateFastIntakeSession(
  goal: string,
  currentSession: PlannerHearingSession | null,
) {
  const session = sanitizeSession(currentSession)

  if (!session) {
    return null
  }

  const answers = inferAnswersFromMessages(session.answers, session.messages)

  return {
    ...session,
    answers,
    insights: mergeHearingInsights(inferHearingInsights(goal, answers), session.insights),
  } satisfies HearingSessionWithSummary
}

function createFastIntakeHearingTurn(
  goal: string,
  currentSession: PlannerHearingSession | null,
  answer: string | null,
  transport: PlannerHearingTransport,
  onEvent?: (event: HearingStreamEvent) => void,
): PlannerHearingTurnResult {
  const hydratedSession = hydrateFastIntakeSession(goal, currentSession)
  const localTurn = createLocalHearingTurn(goal, hydratedSession, answer, transport)
  const reply = localTurn.session.messages.at(-1)?.content ?? ''
  const summaryKeyPoints = buildFallbackSummaryKeyPoints(
    goal,
    localTurn.session.answers,
    localTurn.session.insights,
    [],
    hydratedSession?.summaryKeyPoints ?? [],
  )
  const nextSession = {
    ...localTurn.session,
    transport,
    summaryKeyPoints,
    personaIds: hydratedSession?.personaIds ?? localTurn.session.personaIds ?? [],
  } satisfies HearingSessionWithSummary
  const structuredOutput = buildHearingStructuredOutput(reply, Boolean(localTurn.completed), summaryKeyPoints)

  onEvent?.({
    type: 'transport',
    transport,
  })
  onEvent?.({
    type: 'text-delta',
    text: reply,
  })

  return {
    session: nextSession,
    completed: Boolean(localTurn.completed),
    structuredOutput,
  }
}

function parseModelResponse(rawText: string) {
  try {
    return JSON.parse(extractJsonCandidate(rawText)) as HearingModelPayload
  } catch {
    return null
  }
}

function extractAssistantMessagePreview(rawText: string) {
  return extractStreamingJsonFieldPreview(rawText, ['reply', 'assistantMessage'])
}

function resolveAssistantReply(rawText: string) {
  const preview = extractAssistantMessagePreview(rawText).trim()

  if (preview) {
    return preview
  }

  const trimmed = rawText.trim()

  if (!trimmed || looksLikeJsonPayload(trimmed)) {
    return ''
  }

  return trimmed
}

function synthesizeLivePayloadFromRawText(
  goal: string,
  session: HearingSessionWithSummary,
  answer: string | null,
  rawText: string,
) {
  const answerPatch = answer?.trim()
    ? inferLocalHearingAnswerPatch(answer, session.answers)
    : {}
  const mergedAnswers = mergeHearingAnswers(session.answers, sanitizeAnswers(answerPatch))
  const inferredInsights = mergeHearingInsights(inferHearingInsights(goal, mergedAnswers), session.insights)
  const reply = resolveAssistantReply(rawText)
    || buildIncompleteFallbackReply(goal, mergedAnswers, inferredInsights, countAssistantTurns(session.messages))

  if (!reply) {
    return null
  }

  return {
    reply,
    completed: false,
    answers: answerPatch,
    insights: {},
  } satisfies HearingModelPayload
}

function captureSalvagedLivePayload(
  meta: LiveRequestMeta,
  extras: Partial<LiveRequestMeta>,
) {
  const payload = {
    ...meta,
    ...extras,
  }

  emitStructuredHearingLog('warn', 'live turn salvaged', payload)
  Sentry.captureMessage('ZAI hearing response salvaged', {
    level: 'warning',
    extra: payload,
  })
}

function salvageLivePayload(
  goal: string,
  session: HearingSessionWithSummary,
  answer: string | null,
  rawText: string,
  meta: LiveRequestMeta,
  extras: Partial<LiveRequestMeta> = {},
) {
  const salvaged = synthesizeLivePayloadFromRawText(goal, session, answer, rawText)

  if (salvaged) {
    captureSalvagedLivePayload(meta, {
      ...extras,
      rawTextSnippet: normalizeRawSnippet(rawText),
    })
    return salvaged
  }

  return null
}

async function readStreamingModelResponse(
  response: Response,
  meta: LiveRequestMeta,
  onEvent?: (event: HearingStreamEvent) => void
): Promise<StreamingReadResult> {
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw createZaiHearingError(
      `ZAI hearing request failed with status ${response.status}${bodyText ? `: ${bodyText.slice(0, 240)}` : ''}`,
      {
        ...meta,
        status: response.status,
        bodySnippet: normalizeRawSnippet(bodyText),
      },
    )
  }

  if (!response.body) {
    throw createZaiHearingError('ZAI hearing response body was empty.', {
      ...meta,
      status: response.status,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let rawText = ''
  let streamedAssistantMessage = ''
  let sawStreamChunk = false

  const flushEvent = (eventText: string) => {
    const parsePayload = (payloadText: string) => {
      if (!payloadText || payloadText === '[DONE]') {
        return
      }

      try {
        const payload = JSON.parse(payloadText) as ZaiStreamChunk
        const content = payload.choices?.[0]?.delta?.content ?? ''

        if (!content) {
          return
        }

        sawStreamChunk = true
        rawText += content
        const preview = extractAssistantMessagePreview(rawText)

        if (preview.length > streamedAssistantMessage.length) {
          const nextText = preview.slice(streamedAssistantMessage.length)
          streamedAssistantMessage = preview
          if (nextText) {
            onEvent?.({
              type: 'text-delta',
              text: nextText,
            })
          }
        }
      } catch {
        return
      }
    }

    const lines = eventText.split('\n').map((line) => line.trim()).filter(Boolean)
    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())

    if (dataLines.length > 0) {
      for (const dataLine of dataLines) {
        parsePayload(dataLine)
      }

      return
    }

    const inlinePayload = lines.find((line) => line.startsWith('{') || line.startsWith('['))

    if (inlinePayload) {
      parsePayload(inlinePayload)
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    sseBuffer += decoder.decode(value, { stream: true })

    while (true) {
      const boundaryIndex = sseBuffer.indexOf('\n\n')

      if (boundaryIndex < 0) {
        break
      }

      const eventText = sseBuffer.slice(0, boundaryIndex).trim()
      sseBuffer = sseBuffer.slice(boundaryIndex + 2)

      if (!eventText) {
        continue
      }

      flushEvent(eventText)
    }
  }

  const trailing = sseBuffer.trim()
  if (trailing) {
    flushEvent(trailing)
  }

  return {
    rawText: rawText.trim(),
    sawStreamChunk,
  }
}

function extractAssistantTextFromResponse(payload: ZaiNonStreamingResponse) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text ?? '')
      .join('\n')
      .trim()
  }

  return ''
}

async function readNonStreamingModelResponse(response: Response, meta: LiveRequestMeta) {
  const responseText = await response.text().catch(() => '')

  if (!response.ok) {
    const zaiRequestId = meta.zaiRequestId ?? meta.requestId ?? null
    throw createZaiHearingError(
      `ZAI hearing request failed with status ${response.status}${responseText ? `: ${responseText.slice(0, 240)}` : ''}`,
      {
        ...meta,
        status: response.status,
        bodySnippet: normalizeRawSnippet(responseText),
        zaiRequestId,
      },
    )
  }

  let payload: ZaiNonStreamingResponse

  try {
    payload = JSON.parse(responseText || '{}') as ZaiNonStreamingResponse
  } catch (error) {
    const rawText = responseText.trim()

    if (rawText) {
      const zaiRequestId = meta.zaiRequestId ?? meta.requestId ?? null
      return {
        rawText,
        bodySnippet: normalizeRawSnippet(responseText),
        requestId: zaiRequestId,
        zaiRequestId,
      }
    }

    throw createZaiHearingError(
      'ZAI hearing response was not valid JSON.',
      {
        ...meta,
        status: response.status,
        bodySnippet: normalizeRawSnippet(responseText),
      },
      error,
    )
  }

  const assistantText = extractAssistantTextFromResponse(payload)
  const zaiRequestId = payload.request_id ?? meta.zaiRequestId ?? meta.requestId ?? null

  if (!assistantText) {
    throw createZaiHearingError(
      'ZAI hearing response did not include assistant content.',
      {
        ...meta,
        status: response.status,
        bodySnippet: normalizeRawSnippet(responseText),
        zaiRequestId,
        requestId: zaiRequestId,
      },
    )
  }

  return {
    rawText: assistantText,
    bodySnippet: normalizeRawSnippet(responseText),
    requestId: zaiRequestId,
    zaiRequestId,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function countAssistantTurns(messages: PlannerConversationMessage[]) {
  return messages.filter((message) => message.role === 'assistant' && message.id !== 'intro').length
}

function isQuestionLike(text: string | null | undefined) {
  const normalized = text?.trim() ?? ''

  if (!normalized) {
    return false
  }

  return /[？?]$/.test(normalized) || /(教えて|ありますか|でしょうか|どれくらい|何を|どんな)/.test(normalized)
}

function hasMinimumCompletionFields(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights: Partial<PlannerHearingInsights> | null | undefined
) {
  const sanitizedAnswers = sanitizeAnswers(answers)
  const effectiveAnswers = buildImplicitHearingAnswers(goal, sanitizedAnswers)
  const payload = buildPlannerHearingPayload(goal, effectiveAnswers, insights)
  const sanitizedInsights = sanitizeHearingInsights(insights)
  const hasCoreFields = Boolean(
    effectiveAnswers.purpose?.trim()
    && effectiveAnswers.siteBehavior?.trim()
  )
  const hasPlanChangingSignal = Boolean(
    payload.state.signals.project_complexity
    || payload.insights.projectType
    || payload.insights.mustHaveFeatures.length > 0
    || sanitizedAnswers.aiTools?.trim()
    || sanitizedAnswers.localWorkCapability?.trim()
    || sanitizedInsights.constraints.length > 0
    || payload.state.blockers.length > 0
    || payload.profile.availableAiTools.length > 0
  )

  if (!hasCoreFields || !hasPlanChangingSignal) {
    return false
  }

  // W57 (TQ-209 wire): vague な general goal は核心が薄いまま completed=true に
  // なってしまうと plan compiler が discovering で詰む。category が 'general'
  // かつ vague keyword (改善 / 伸ばし / なんとか 等) にヒットする短文 goal は、
  // 具体的な plan-changing signal (projectType / mustHaveFeatures / audience /
  // siteBehavior が静的以外) がない限り、もう 1 ターン待つ。
  const goalCategory = inferGoalCategory(goal, sanitizedAnswers, sanitizedInsights)
  if (goalCategory === 'general' && isVagueGoal(goal, sanitizedAnswers)) {
    const hasConcreteScopeSignal = Boolean(
      payload.insights.projectType
      || payload.insights.mustHaveFeatures.length > 0
      || sanitizedInsights.audience?.trim()
    )
    if (!hasConcreteScopeSignal) {
      return false
    }
  }

  return true
}

/**
 * TQ-225: Loose completion fields — used when the Live AI signals a high
 * confidence early-end. We trust the model when it says the Goal is clear,
 * as long as we at least have a purpose and *some* plan-changing signal
 * (project type / siteBehavior / mustHaveFeatures / personaId-ish hints).
 * Without a `purpose` answer we never early-end, even on `confidence=high`.
 */
function hasEarlyEndCompletionFields(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights: Partial<PlannerHearingInsights> | null | undefined
) {
  const sanitizedAnswers = sanitizeAnswers(answers)
  const effectiveAnswers = buildImplicitHearingAnswers(goal, sanitizedAnswers)
  const payload = buildPlannerHearingPayload(goal, effectiveAnswers, insights)
  const sanitizedInsights = sanitizeHearingInsights(insights)

  const hasPurpose = Boolean(effectiveAnswers.purpose?.trim())
  if (!hasPurpose) {
    return false
  }

  const hasAnyPlanSignal = Boolean(
    effectiveAnswers.siteBehavior?.trim()
    || payload.state.signals.project_complexity
    || payload.insights.projectType
    || payload.insights.mustHaveFeatures.length > 0
    || sanitizedAnswers.aiTools?.trim()
    || sanitizedAnswers.localWorkCapability?.trim()
    || sanitizedInsights.constraints.length > 0
    || payload.state.blockers.length > 0
    || payload.profile.availableAiTools.length > 0
    || payload.insights.audience
    || payload.insights.deadline
  )

  return hasAnyPlanSignal
}

/**
 * TQ-225: Decide whether to honor the model-supplied `is_goal_clear` /
 * `confidence` early-end signal. We require:
 * - `is_goal_clear` is true
 * - confidence is `medium` or `high`
 * - at least `MIN_ASSISTANT_TURNS_BEFORE_EARLY_END` assistant turns have
 *   been emitted so far (current turn included).
 * - early-end-loose completion fields are satisfied.
 */
function shouldEarlyEndHearing(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights: Partial<PlannerHearingInsights> | null | undefined,
  parsed: HearingModelPayload,
  assistantTurnsAfterThis: number,
) {
  if (!parsed.is_goal_clear) {
    return false
  }

  const confidence = sanitizeConfidence(parsed.confidence)
  if (confidence !== 'medium' && confidence !== 'high') {
    return false
  }

  if (assistantTurnsAfterThis < MIN_ASSISTANT_TURNS_BEFORE_EARLY_END) {
    return false
  }

  return hasEarlyEndCompletionFields(goal, answers, insights)
}

function buildFallbackSummaryKeyPoints(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights: Partial<PlannerHearingInsights> | null | undefined,
  preferred: string[] = [],
  existing: string[] = []
) {
  const payload = buildPlannerHearingPayload(goal, answers, insights)

  return sanitizeSummaryKeyPoints([
    ...preferred,
    ...existing,
    payload.state.targetOutcome ? `目標: ${payload.state.targetOutcome}` : null,
    answers.purpose?.trim() ? `目的: ${answers.purpose.trim()}` : null,
    answers.siteBehavior?.trim() ? `サイト種別: ${answers.siteBehavior.trim()}` : null,
    answers.experience?.trim() ? `経験: ${answers.experience.trim()}` : null,
    answers.operatingSystem?.trim() ? `OS: ${answers.operatingSystem.trim()}` : null,
    answers.localWorkCapability?.trim() ? `ローカル作業: ${answers.localWorkCapability.trim()}` : null,
    answers.aiTools?.trim() ? `AI ツール: ${answers.aiTools.trim()}` : null,
    answers.existingMaterials?.trim() ? `既存素材: ${answers.existingMaterials.trim()}` : null,
    payload.insights.audience ? `対象: ${payload.insights.audience}` : null,
    payload.insights.deadline ? `期限: ${payload.insights.deadline}` : null,
    ...payload.insights.constraints.map((constraint) => `制約: ${constraint}`),
    ...payload.insights.mustHaveFeatures.map((feature) => `必要機能: ${feature}`),
    ...payload.state.blockers.map((blocker) => `blocker: ${blocker}`),
  ])
}

function buildIncompleteFallbackReply(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights: Partial<PlannerHearingInsights> | null | undefined,
  assistantTurns: number
) {
  const sanitizedAnswers = buildImplicitHearingAnswers(goal, sanitizeAnswers(answers))
  const effectiveAnswers = buildImplicitHearingAnswers(goal, sanitizedAnswers)
  const payload = buildPlannerHearingPayload(goal, effectiveAnswers, insights)

  if (!effectiveAnswers.purpose) {
    return buildHearingPurposePrompt(goal)
  }

  if (!effectiveAnswers.siteBehavior) {
    return '最初の版は、見るだけの静的ページで足りますか？ それとも入力・保存・ログインなどの動きが必要ですか？'
  }

  if (!sanitizedAnswers.experience && assistantTurns < MAX_ASSISTANT_TURNS - 1) {
    return '進め方の難易度を合わせたいので、パソコンで何かを作った経験がどれくらいあるかを教えてください。ブログやノーコードの経験でも大丈夫です。'
  }

  if (
    !sanitizedAnswers.aiTools
    && !sanitizedAnswers.localWorkCapability
    && payload.state.blockers.length === 0
    && sanitizeHearingInsights(insights).constraints.length === 0
  ) {
    return '最後に、今使える AI ツールや、会社 PC の制限など進め方に影響する条件があれば 1 つ教えてください。'
  }

  if (!sanitizedAnswers.existingMaterials && assistantTurns < MAX_ASSISTANT_TURNS - 1) {
    return 'プランを短くできるか見たいので、使えそうな文章・画像・ロゴ・参考サイトがあれば教えてください。なければ「まだない」で大丈夫です。'
  }

  return '必要な前提が揃いました。ここまでの内容でプラン作成に進みます。'
}

function buildCompletionReply(rawReply: string | null | undefined) {
  const normalized = rawReply?.trim()

  if (normalized && !isQuestionLike(normalized)) {
    return normalized
  }

  return '必要な前提が揃いました。ここまでの内容でプランを作成します。'
}

function isCompletionLikeReply(text: string) {
  return /(必要な前提が揃いました|ここまでの内容でプラン|プランを作成|ヒアリング完了)/.test(text)
}

function shouldUseIncompleteFallbackReply(rawReply: string, answers: Partial<PlannerHearingAnswers>) {
  if (!rawReply.trim() || isCompletionLikeReply(rawReply)) {
    return true
  }

  const normalizedReply = rawReply.toLowerCase()

  if (!answers.siteBehavior?.trim() && /(os|pc|パソコン|mac|windows|linux)/.test(normalizedReply)) {
    return true
  }

  return false
}

function buildHearingStructuredOutput(reply: string, completed: boolean, summaryKeyPoints: string[]) {
  const decisions =
    completed
      ? ['hearing の前提整理が完了した']
      : summaryKeyPoints.slice(0, 2)

  return parseMentorChatStructuredOutput(
    JSON.stringify({
      reply,
      decisions,
      open_questions: completed ? [] : [],
      next_question: completed ? null : reply,
      next_action: completed ? 'ヒアリング内容を確認してプランを作成する' : null,
    }),
    'planner-hearing',
  ).structuredOutput
}

function buildLiveHearingSystemPrompt(
  goal: string,
  session: HearingSessionWithSummary,
  assistantTurns: number,
  personalization?: AiPersonalizationContext | null
) {
  const remainingTurns = Math.max(0, MAX_ASSISTANT_TURNS - assistantTurns)
  const personalizationPayload = personalization
    ? formatPersonalizationPayload(personalization)
    : null
  const knownAnswers = Object.fromEntries(
    Object.entries(sanitizeAnswers(session.answers)).filter(([, value]) => Boolean(value))
  )
  const knownInsights = sanitizeHearingInsights(session.insights)
  // W57 (TQ-209 wire): expose inferred goal category as a soft hint so the
  // LLM can pick category-relevant follow-ups (marketer-app vs lp-copy vs
  // sns-batch). 'general' is also surfaced so the model knows nothing
  // specific was matched.
  const goalCategory: HearingGoalCategory = inferGoalCategory(
    goal,
    sanitizeAnswers(session.answers),
    knownInsights,
  )

  return [
    THREE_AXIS_GUIDE,
    '',
    'あなたは School の AI メンターです。ヒアリング担当として、日本語で自然に会話してください。',
    '目的は、学習者の goal を plan compiler に渡せる状態まで短い対話で具体化することです。',
    '固定順の質問は禁止です。直前の回答と既知情報を踏まえて、次に何を確認すると plan が良くなるかで焦点を選んでください。',
    '1 ターンで 1 問だけ聞いてください。複数質問を並べたり、質問リストを出したりしてはいけません。',
    '定型の相槌や過度な賞賛で始めないでください。goal をそのまま言い換えるだけの返しも避けてください。',
    '例示を並べて誘導するのは避けてください。どうしても例が必要な場合でも 1 例までにしてください。',
    '質問してよいのは、その答えで教材順、技術スタック、最初の成果物が変わる場合だけです。',
    '対象者や期限はユーザーが自分から言った場合だけ拾ってください。未確定でも completed を妨げず、確認のためだけに質問してはいけません。',
    'Webアプリ goal では「誰に見てもらうか」ではなく、最初に動かす機能やデータの扱いを確認してください。',
    'Webサイト / LP / ポートフォリオ goal では、必要な場合だけ最初のページで伝える内容を確認してください。',
    '特に Web 制作 goal では、静的ページで足りるのか、フォーム/予約/ログイン/DB などの動的要件があるのかを必ず確認し、insights.projectType と answers.siteBehavior に反映してください。',
    '静的ページで足りる場合は、最初から Next.js / Supabase を前提にしないでください。HTML/CSS + Codex CLI or Claude Code で始められる可能性を plan compiler に渡してください。',
    'Webアプリ要件がある場合だけ、Next.js / Supabase / Vercel などの分岐判断に必要な制約を確認してください。',
    'すでに会話や knownAnswers / knownInsights から確定できる項目は answers / insights に埋め、同じことを聞き直さないでください。',
    '不明な項目は無理に埋めなくてよいですが、ユーザーが「未定」「まだない」と答えた事実は有効な情報として扱ってください。',
    'completed=true にする条件は、purpose と siteBehavior が埋まり、教材順・技術スタック・最初の成果物を決められることです。OS、経験、対象者、期限は必須ではありません。',
    // TQ-225: Dynamic early-end signaling. The host service consumes
    // is_goal_clear / confidence to terminate the loop before MAX_ASSISTANT_TURNS.
    'is_goal_clear / confidence / next_question を必ず返してください。これらは、ヒアリングを早期終了してよいかをホスト側が判断する根拠になります。',
    'is_goal_clear=true は「いま分かっている情報だけで、Goal を plan compiler に渡せて最初のレッスンを引ける」と判断したときだけ true にしてください。purpose が空・siteBehavior 不明・projectType も推定不能のときは必ず false にしてください。',
    'confidence は high / medium / low のいずれかです。high は「情報が揃っており、これ以上の質問は plan を変えない」、medium は「核心は分かったが詰めの余地がある」、low は「まだ確認したい質問が複数ある」を意味します。',
    'next_question は completed=false かつ追加質問があるときに「次に聞く 1 問」の文字列を入れてください。逆に is_goal_clear=true で追加質問が不要なときは null にしてください。reply 本文と矛盾しないようにしてください。',
    `assistant ターンは今回を含めて最大 ${MAX_ASSISTANT_TURNS} 回です。現在 ${assistantTurns} 回消化済みで、残り ${remainingTurns} 回です。最低でも 3 ターン (goal + 2 回答) は会話してから completed=true にすることを推奨しますが、purpose / persona / scope の核が揃ったら早期終了してください。`,
    remainingTurns <= 1
      ? 'このターンで必要な情報をまとめ、completed=true / is_goal_clear=true / confidence=high にしてください。追加質問で引き延ばしてはいけません。'
      : '情報が十分なら早めに completed=true にし、is_goal_clear=true / confidence=high を立ててください。',
    'reply はユーザーに見せる自然な日本語 1〜3 文です。completed=false のときは最後を next_question と同じ 1 問で終えてください。completed=true のときはヒアリング完了と、次に plan を作ることを短く伝えてください。',
    'summaryKeyPoints には compile で有用な短い要点を 3〜8 件入れてください。各項目は 1 文以内で、重複を避けてください。',
    'personaIds は次の候補から 0〜2 件を選んでください。goal と purpose の内容から判断し、合致する候補がなければ空配列にしてください。候補: persona.web-builder (Web サイト / ページ / LP 制作), persona.ai-content-creator (AI で記事・動画・SNS などコンテンツ制作), persona.ai-app-builder (AI を使ったアプリ・プロダクト・ツール開発)。',
    'JSON オブジェクトだけを返してください。Markdown・前置き・コードフェンスは禁止です。',
    '返す JSON schema:',
    '{"reply":"string","completed":true,"is_goal_clear":true,"confidence":"low|medium|high","next_question":"string|null","answers":{"experience":"string","purpose":"string","siteBehavior":"string","existingMaterials":"string","operatingSystem":"string","localWorkCapability":"string","cliFamiliarity":"string","aiTools":"string"},"insights":{"buildGoal":"string|null","audience":"string|null","deadline":"string|null","projectType":"content-site|database-app|authenticated-app|null","constraints":["string"],"preferences":["string"],"mustHaveFeatures":["string"],"planningFocus":["string"]},"summaryKeyPoints":["string"],"personaIds":["string"]}',
    `goal: ${goal}`,
    `goal_category: ${goalCategory}`,
    `knownAnswers: ${JSON.stringify(knownAnswers, null, 2)}`,
    `knownInsights: ${JSON.stringify(knownInsights, null, 2)}`,
    `optionalTopicHints: ${OPTIONAL_HEARING_TOPICS.join(' / ')}`,
    personalizationPayload
      ? `personalization: ${JSON.stringify(personalizationPayload, null, 2)}`
      : '',
  ].filter(Boolean).join('\n')
}

function resolveConfiguredModel(): string {
  return getExternalPlannerConfig().model ?? DEFAULT_ZAI_MODEL
}

function buildLiveHearingRequestBody(
  goal: string,
  session: HearingSessionWithSummary,
  answer: string | null,
  personalization?: AiPersonalizationContext | null,
  options: {
    model: string
    responseFormat: LiveResponseFormat
  } = {
    model: resolveConfiguredModel(),
    responseFormat: 'json_object',
  },
) {
  const assistantTurns = countAssistantTurns(session.messages)
  const messages = [
    {
      role: 'system',
      content: buildLiveHearingSystemPrompt(goal, session, assistantTurns, personalization),
    },
    ...sanitizeMessages(session.messages).map(({ role, content }) => ({ role, content })),
    ...(answer?.trim()
      ? [{ role: 'user', content: answer.trim() }]
      : []),
  ]

  return {
    model: options.model,
    temperature: 0.1,
    top_p: 0.8,
    max_tokens: 1024,
    response_format: {
      type: options.responseFormat,
    },
    messages,
  }
}

function buildZaiHealthCheckRequestBody(model: string, responseFormat: LiveResponseFormat) {
  const systemPrompt =
    responseFormat === 'text'
      ? [
          'You are a health check for the School hearing endpoint.',
          'Reply with exactly pong.',
          'Do not include markdown or code fences.',
        ].join('\n')
      : [
          'You are a health check for the School hearing endpoint.',
          'Return a compact JSON object with a single "reply" string field set to "pong".',
          'Do not include markdown or code fences.',
        ].join('\n')

  return {
    model,
    temperature: 0,
    top_p: 0.1,
    max_tokens: ZAI_HEALTH_CHECK_MAX_TOKENS,
    response_format: {
      type: responseFormat,
    },
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: 'ping',
      },
    ],
  }
}

async function fetchLiveHearingResponse(
  endpoint: string,
  apiKey: string,
  body: object,
  signal: AbortSignal,
  useStreaming: boolean
) {
  return fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, stream: useStreaming }),
      cache: 'no-store',
      signal,
    },
    { operation: 'ai.hearing' },
  )
}

async function requestLiveResponse(
  endpoint: string,
  apiKey: string,
  body: ReturnType<typeof buildLiveHearingRequestBody> | ReturnType<typeof buildZaiHealthCheckRequestBody>,
  options: RequestResponseOptions,
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LIVE_HEARING_TIMEOUT_MS)
  const meta = createLiveRequestMeta(endpoint, body, options)
  const startedAt = Date.now()

  try {
    const response = await fetchLiveHearingResponse(
      endpoint,
      apiKey,
      body,
      controller.signal,
      options.useStreaming,
    )

    return {
      response,
      meta: {
        ...meta,
        latencyMs: Date.now() - startedAt,
        status: response.status,
        zaiRequestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'),
        requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'),
      } satisfies LiveRequestMeta,
    }
  } catch (error) {
    throw createZaiHearingError(
      error instanceof Error ? error.message : 'ZAI hearing request failed.',
      {
        ...meta,
        latencyMs: Date.now() - startedAt,
      },
      error,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestLiveHearingTurn(
  goal: string,
  currentSession: PlannerHearingSession | null,
  answer: string | null,
  onEvent?: (event: HearingStreamEvent) => void,
  personalization?: AiPersonalizationContext | null,
  options: HearingExecutionOptions = {},
): Promise<PlannerHearingTurnResult> {
  const allowFallback = options.allowFallback ?? true
  const externalConfig = getExternalPlannerConfig()

  // TQ-210: Live AI (GLM-5/ZAI) is the canonical hearing path. The legacy
  // regex-based fast intake path is only used when both the caller opts in
  // (`preferFastIntake: true`) AND the deployment explicitly enables the
  // fallback via `MENTOR_FAST_INTAKE_FALLBACK=1`. Otherwise we fall through
  // to the Live AI path below.
  if (options.preferFastIntake && isFastIntakeFallbackEnabled()) {
    return createFastIntakeHearingTurn(
      goal,
      currentSession,
      answer,
      buildFastIntakeTransport(externalConfig.model, externalConfig.endpoint),
      onEvent,
    )
  }

  if (!externalConfig.available) {
    if (!allowFallback) {
      throw new Error(externalConfig.reason)
    }

    const fallback = createLocalHearingTurn(
      goal,
      currentSession,
      answer,
      buildTransport('unavailable', externalConfig.model, externalConfig.endpoint, externalConfig.reason)
    )
    onEvent?.({
      type: 'transport',
      transport: fallback.session.transport,
    })
    onEvent?.({
      type: 'text-delta',
      text: fallback.session.messages.at(-1)?.content ?? '',
    })
    return {
      ...fallback,
      structuredOutput: buildMentorChatStructuredOutputFallback(
        fallback.session.messages.at(-1)?.content ?? '',
      ),
    }
  }

  const transport = buildTransport('live', externalConfig.model, externalConfig.endpoint)
  onEvent?.({
    type: 'transport',
    transport,
  })
  const session = sanitizeSession(currentSession) ?? createBaseLiveSession(goal, transport)
  const requestParsedLiveTurn = async (retryAttempt: number) => {
    const shouldStream = Boolean(onEvent)
    const jsonRequestBody = buildLiveHearingRequestBody(goal, session, answer, personalization, {
      model: externalConfig.model,
      responseFormat: 'json_object',
    })
    // Network failures propagate to the outer retry loop; only parse failures trigger
    // the in-attempt text-mode salvage below.
    const { response, meta } = await requestLiveResponse(
      externalConfig.endpoint,
      externalConfig.apiKey,
      jsonRequestBody,
      {
        retryAttempt,
        responseFormat: 'json_object',
        model: externalConfig.model,
        useStreaming: shouldStream,
        appRequestId: options.appRequestId ?? null,
      },
    )

    let primaryRawText = ''
    let primaryExtras: Partial<LiveRequestMeta> = {}

    if (shouldStream) {
      const streamingResult = await readStreamingModelResponse(response, meta, onEvent)
      primaryRawText = streamingResult.rawText
      primaryExtras = { sawStreamChunk: streamingResult.sawStreamChunk }

      const parsed = streamingResult.sawStreamChunk ? parseModelResponse(streamingResult.rawText) : null
      if (parsed) {
        return parsed
      }
    } else {
      const primaryResult = await readNonStreamingModelResponse(response, meta)
      primaryRawText = primaryResult.rawText
      primaryExtras = {
        bodySnippet: primaryResult.bodySnippet,
        requestId: primaryResult.requestId,
        zaiRequestId: primaryResult.zaiRequestId,
      }

      const parsed = parseModelResponse(primaryResult.rawText)
      if (parsed) {
        return parsed
      }
    }

    const fallbackRequestBody = buildLiveHearingRequestBody(goal, session, answer, personalization, {
      model: externalConfig.model,
      responseFormat: 'text',
    })

    let textRawText = ''
    let textMeta: LiveRequestMeta | null = null
    let textExtras: Partial<LiveRequestMeta> = {}

    try {
      const { response: fallbackResponse, meta: fallbackMeta } = await requestLiveResponse(
        externalConfig.endpoint,
        externalConfig.apiKey,
        fallbackRequestBody,
        {
          retryAttempt,
          responseFormat: 'text',
          model: externalConfig.model,
          useStreaming: false,
          appRequestId: options.appRequestId ?? null,
        },
      )
      const fallbackResult = await readNonStreamingModelResponse(fallbackResponse, fallbackMeta)
      textRawText = fallbackResult.rawText
      textMeta = fallbackMeta
      textExtras = {
        bodySnippet: fallbackResult.bodySnippet,
        requestId: fallbackResult.requestId,
        zaiRequestId: fallbackResult.zaiRequestId,
      }

      const parsed = parseModelResponse(fallbackResult.rawText)
      if (parsed) {
        return parsed
      }
    } catch (error) {
      emitStructuredHearingLog('warn', 'text mode fallback request failed', {
        error,
        meta,
      })
    }

    const salvageRawText = textRawText || primaryRawText
    const salvageMeta = textMeta ?? meta
    const salvageExtras = textMeta ? textExtras : primaryExtras

    if (!textRawText.trim() && !primaryRawText.trim()) {
      throw createZaiHearingError(
        'ZAI hearing response yielded no usable model text from either json or text mode.',
        {
          ...salvageMeta,
          rawTextSnippet: '',
          ...salvageExtras,
        },
      )
    }

    const salvaged = salvageLivePayload(goal, session, answer, salvageRawText, salvageMeta, salvageExtras)

    if (salvaged) {
      return salvaged
    }

    throw createZaiHearingError(
      'ZAI hearing request could not be parsed or salvaged.',
      {
        ...salvageMeta,
        rawTextSnippet: normalizeRawSnippet(salvageRawText),
        ...salvageExtras,
      },
    )
  }

  try {
    let parsed: HearingModelPayload | null = null
    let lastError: unknown = null

    for (let attempt = 1; attempt <= LIVE_HEARING_RETRY_BACKOFF_MS.length + 1; attempt += 1) {
      try {
        parsed = await requestParsedLiveTurn(attempt)
        break
      } catch (error) {
        lastError = error
        const meta = getZaiErrorMeta(error)
        const backoffMs = LIVE_HEARING_RETRY_BACKOFF_MS[attempt - 1]

        emitStructuredHearingLog('warn', 'live turn retry', {
          error,
          meta,
          attempt,
          nextBackoffMs: backoffMs ?? null,
        })

        if (!backoffMs) {
          throw lastError
        }

        await sleep(backoffMs)
      }
    }

    if (!parsed) {
      throw lastError ?? new Error('ZAI hearing request failed without a parsed payload.')
    }

    const llmMergedAnswers = mergeHearingAnswers(session.answers, sanitizeAnswers(parsed.answers))
    const llmMergedInsights = mergeHearingInsights(
      mergeHearingInsights(inferHearingInsights(goal, llmMergedAnswers), session.insights),
      parsed.insights
    )
    // W57 (TQ-209 wire): apply post-merge heuristic lift over the user
    // utterance buffer so aiTools / audience / operatingSystem do not stay
    // empty when the LLM omitted them. This is idempotent — heuristics never
    // override values that the LLM already filled (see
    // `applyHeuristicHearingExtraction` doc).
    const heuristicMessages: PlannerConversationMessage[] = [
      ...session.messages,
      ...(answer?.trim()
        ? [{
          id: `answer-${Date.now()}`,
          role: 'user' as const,
          content: answer.trim(),
        }]
        : []),
    ]
    const heuristicLifted = applyHeuristicHearingExtraction(
      llmMergedAnswers,
      llmMergedInsights,
      heuristicMessages,
    )
    const mergedAnswers = heuristicLifted.answers
    const mergedInsights = heuristicLifted.insights
    const assistantTurns = countAssistantTurns(session.messages)
    const assistantTurnsAfterThis = assistantTurns + 1
    const forcedCompletion = assistantTurnsAfterThis >= MAX_ASSISTANT_TURNS
    // TQ-225: Honor the model's dynamic early-end signal
    // (`is_goal_clear=true` + `confidence>=medium`) once we have at least the
    // minimum number of assistant turns and a usable purpose. This is what
    // lets a Live AI hearing terminate at 3-5 questions instead of running
    // through the full MAX_ASSISTANT_TURNS budget.
    const earlyEnd = shouldEarlyEndHearing(
      goal,
      mergedAnswers,
      mergedInsights,
      parsed,
      assistantTurnsAfterThis,
    )
    const completed =
      forcedCompletion
      || earlyEnd
      || hasMinimumCompletionFields(goal, mergedAnswers, mergedInsights)
      || (Boolean(parsed.completed) && hasMinimumCompletionFields(goal, mergedAnswers, mergedInsights))
    const rawReply = parsed.reply?.trim() ?? parsed.assistantMessage?.trim() ?? ''
    const fallbackReply = completed
      ? buildCompletionReply(rawReply)
      : buildIncompleteFallbackReply(goal, mergedAnswers, mergedInsights, assistantTurns)
    const resolvedReply = completed
      ? buildCompletionReply(rawReply || fallbackReply)
      : shouldUseIncompleteFallbackReply(rawReply, mergedAnswers) ? fallbackReply : rawReply
    const summaryKeyPoints = buildFallbackSummaryKeyPoints(
      goal,
      mergedAnswers,
      mergedInsights,
      sanitizeSummaryKeyPoints(parsed.summaryKeyPoints),
      session.summaryKeyPoints ?? []
    )
    const parsedPersonaIds = sanitizePersonaIds(parsed.personaIds)
    const personaIds = parsedPersonaIds.length > 0
      ? parsedPersonaIds
      : session.personaIds ?? []
    const structuredOutput = buildHearingStructuredOutput(
      resolvedReply,
      completed,
      summaryKeyPoints,
    )
    const nextMessages = [...session.messages]

    if (answer?.trim()) {
      nextMessages.push({
        id: `answer-${Date.now()}`,
        role: 'user',
        content: answer.trim(),
      })
    }

    nextMessages.push({
      id: completed ? `hearing-finished-${Date.now() + 1}` : `hearing-turn-${Date.now() + 1}`,
      role: 'assistant',
      content: structuredOutput.reply,
    })

    const nextSession = {
      answers: mergedAnswers,
      insights: mergedInsights,
      messages: nextMessages,
      lastQuestionId: null,
      transport,
      completedAt: completed ? new Date().toISOString() : null,
      summaryKeyPoints,
      personaIds,
    } as HearingSessionWithSummary

    return {
      session: nextSession,
      completed,
      structuredOutput,
    }
  } catch (error) {
    if (!allowFallback) {
      throw error
    }

    const meta = getZaiErrorMeta(error)
    emitStructuredHearingLog('error', 'live turn failed', {
      message: error instanceof Error ? error.message : 'ZAI hearing request failed.',
      meta,
    })
    Sentry.captureException(error, {
      tags: {
        operation: 'ai.hearing',
        model: meta?.model ?? externalConfig.model,
        request_id: meta?.appRequestId ?? options.appRequestId ?? 'unknown',
      },
      extra: {
        request_id: meta?.appRequestId ?? options.appRequestId ?? null,
        appRequestId: meta?.appRequestId ?? options.appRequestId ?? null,
        zaiRequestId: meta?.zaiRequestId ?? meta?.requestId ?? null,
        status: meta?.status,
        bodySnippet: meta?.bodySnippet,
        rawTextSnippet: meta?.rawTextSnippet,
        promptLength: meta?.promptLength,
        requestBytes: meta?.requestBytes,
        messageCount: meta?.messageCount,
        retryAttempt: meta?.retryAttempt,
        model: meta?.model ?? externalConfig.model,
        endpoint: meta?.endpoint ?? externalConfig.endpoint,
        stream: meta?.stream,
        responseFormat: meta?.responseFormat,
        latencyMs: meta?.latencyMs,
        sawStreamChunk: meta?.sawStreamChunk,
        requestId: meta?.requestId,
      },
    })
    const message = error instanceof Error ? error.message : 'ZAI hearing request failed.'
    const fallback = createLocalHearingTurn(
      goal,
      currentSession,
      answer,
      buildTransport('fallback', externalConfig.model, externalConfig.endpoint, message)
    )
    onEvent?.({
      type: 'transport',
      transport: fallback.session.transport,
    })
    onEvent?.({
      type: 'text-delta',
      text: fallback.session.messages.at(-1)?.content ?? '',
    })
    return {
      ...fallback,
      structuredOutput: buildMentorChatStructuredOutputFallback(
        fallback.session.messages.at(-1)?.content ?? '',
      ),
    }
  }
}

export async function probeZaiHearingHealth(
  options: ZaiHealthProbeOptions = {},
): Promise<ZaiHealthProbeResult> {
  const externalConfig = getExternalPlannerConfig()
  const responseFormat = options.responseFormat ?? 'json_object'
  const stream = Boolean(options.stream)

  if (!externalConfig.available) {
    return {
      ok: false,
      available: false,
      model: externalConfig.model,
      status: 503,
      stream,
      responseFormat,
      error: externalConfig.reason,
    }
  }

  try {
    const requestBody = buildZaiHealthCheckRequestBody(externalConfig.model, responseFormat)
    const { response, meta } = await requestLiveResponse(
      externalConfig.endpoint,
      externalConfig.apiKey,
      requestBody,
      {
        retryAttempt: 1,
        responseFormat,
        model: externalConfig.model,
        useStreaming: stream,
        appRequestId: null,
      },
    )

    if (stream) {
      const streamingResult = await readStreamingModelResponse(response, meta)
      const rawTextSnippet = normalizeRawSnippet(streamingResult.rawText)

      return {
        ok: response.ok,
        available: true,
        model: externalConfig.model,
        status: meta.status,
        latencyMs: meta.latencyMs,
        bodySnippet: rawTextSnippet,
        rawTextSnippet,
        promptLength: meta.promptLength,
        requestBytes: meta.requestBytes,
        messageCount: meta.messageCount,
        stream,
        responseFormat,
        zaiRequestId: meta.zaiRequestId ?? meta.requestId ?? null,
        sawStreamChunk: streamingResult.sawStreamChunk,
        parsed: responseFormat === 'json_object'
          ? Boolean(parseModelResponse(streamingResult.rawText))
          : Boolean(resolveAssistantReply(streamingResult.rawText)),
      }
    }

    const nonStreamingResult = await readNonStreamingModelResponse(response, meta)

    return {
      ok: response.ok,
      available: true,
      model: externalConfig.model,
      status: meta.status,
      latencyMs: meta.latencyMs,
      bodySnippet: nonStreamingResult.bodySnippet,
      rawTextSnippet: normalizeRawSnippet(nonStreamingResult.rawText),
      promptLength: meta.promptLength,
      requestBytes: meta.requestBytes,
      messageCount: meta.messageCount,
      stream,
      responseFormat,
      zaiRequestId: nonStreamingResult.zaiRequestId ?? meta.zaiRequestId ?? meta.requestId ?? null,
      parsed: responseFormat === 'json_object'
        ? Boolean(parseModelResponse(nonStreamingResult.rawText))
        : Boolean(resolveAssistantReply(nonStreamingResult.rawText)),
    }
  } catch (error) {
    const meta = getZaiErrorMeta(error)
    emitStructuredHearingLog('warn', 'zai health probe failed', {
      message: error instanceof Error ? error.message : 'ZAI health probe failed.',
      meta,
    })

    return {
      ok: false,
      available: true,
      model: meta?.model ?? externalConfig.model,
      status: meta?.status,
      latencyMs: meta?.latencyMs,
      bodySnippet: meta?.bodySnippet,
      rawTextSnippet: meta?.rawTextSnippet,
      promptLength: meta?.promptLength,
      requestBytes: meta?.requestBytes,
      messageCount: meta?.messageCount,
      stream,
      responseFormat,
      zaiRequestId: meta?.zaiRequestId ?? meta?.requestId ?? null,
      sawStreamChunk: meta?.sawStreamChunk,
      parsed: false,
      error: error instanceof Error ? error.message : 'ZAI health probe failed.',
    }
  }
}

export async function advanceHearingSession(
  goal: string,
  currentSession: PlannerHearingSession | null,
  answer: string | null,
  personalization?: AiPersonalizationContext | null,
  options: HearingExecutionOptions = {},
): Promise<PlannerHearingTurnResult> {
  return requestLiveHearingTurn(goal, currentSession, answer, undefined, personalization, options)
}

export async function advanceHearingSessionStream(
  goal: string,
  currentSession: PlannerHearingSession | null,
  answer: string | null,
  onEvent?: (event: HearingStreamEvent) => void,
  personalization?: AiPersonalizationContext | null,
  options: HearingExecutionOptions = {},
): Promise<PlannerHearingTurnResult> {
  return requestLiveHearingTurn(goal, currentSession, answer, onEvent, personalization, options)
}
