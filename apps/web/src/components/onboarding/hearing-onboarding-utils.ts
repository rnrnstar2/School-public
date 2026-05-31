'use client'

import {
  buildHearingSummaryEntries,
  buildPlannerHearingPayload,
  defaultFallbackHearingTransport,
  sanitizeHearingInsights,
} from '@/lib/planner/hearing'
import type {
  PlannerConversationMessage,
  PlannerHearingQuestionId,
  PlannerHearingSession,
  PlannerHearingTransport,
} from '@/lib/planner/types'

const HEARING_QUESTION_IDS: PlannerHearingQuestionId[] = [
  'experience',
  'purpose',
  'siteBehavior',
  'existingMaterials',
  'operatingSystem',
  'localWorkCapability',
  'cliFamiliarity',
  'aiTools',
]

const DEFAULT_PERSONA_ID = 'persona.web-builder'

const SUPPORTED_PERSONA_IDS: ReadonlySet<string> = new Set([
  'persona.web-builder',
  'persona.ai-content-creator',
  'persona.ai-app-builder',
  // W67 (2026-05-09 / Wave 14, Audit A4 b-axis + B4 #3): 非エンジニア向け
  // Web アプリ persona。onboarding chip 表示でも 4 ペルソナ目として案内する。
  'persona.noneng-webapp',
])

const PERSONA_LABELS: Record<string, string> = {
  'persona.web-builder': 'Web制作',
  'persona.ai-content-creator': 'AIコンテンツ制作',
  'persona.ai-app-builder': 'AIアプリ開発',
  'persona.noneng-webapp': '非エンジニアWebアプリ',
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
}

function normalizeSummaryKeyPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 30)
    .map((item) => item.slice(0, 500))
}

function getSessionSummaryKeyPoints(session: PlannerHearingSession | null | undefined) {
  return normalizeSummaryKeyPoints((session as (PlannerHearingSession & { summaryKeyPoints?: unknown }) | null | undefined)?.summaryKeyPoints)
}

function normalizePersonaIds(value: unknown): string[] {
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
  return normalizePersonaIds((session as (PlannerHearingSession & { personaIds?: unknown }) | null | undefined)?.personaIds)
}

function normalizeTransport(value: unknown): PlannerHearingTransport {
  if (!value || typeof value !== 'object') {
    return defaultFallbackHearingTransport
  }

  const candidate = value as Record<string, unknown>
  const status = candidate.status

  return {
    status: status === 'live' || status === 'fallback' || status === 'unavailable'
      ? status
      : defaultFallbackHearingTransport.status,
    label: typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : defaultFallbackHearingTransport.label,
    message: typeof candidate.message === 'string' && candidate.message.trim()
      ? candidate.message.trim()
      : defaultFallbackHearingTransport.message,
    model: typeof candidate.model === 'string' && candidate.model.trim() ? candidate.model.trim() : undefined,
    endpoint: typeof candidate.endpoint === 'string' && candidate.endpoint.trim() ? candidate.endpoint.trim() : undefined,
  }
}

function normalizeMessage(message: unknown, index: number): PlannerConversationMessage | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const candidate = message as Record<string, unknown>
  const role = candidate.role === 'assistant' || candidate.role === 'user' ? candidate.role : null
  const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''

  if (!role || !content) {
    return null
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `hearing-message-${index}`,
    role,
    content,
  }
}

function normalizeAnswerValue(questionId: PlannerHearingQuestionId, value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return ''
    }

    if (questionId === 'cliFamiliarity') {
      const normalized = trimmed.toLowerCase()

      if (normalized === 'comfortable') return '普段から使う'
      if (normalized === 'basic' || normalized === 'beginner') return '少し触れる'
      if (normalized === 'none') return 'ほぼ初めて'
    }

    return trimmed
  }

  if (typeof value === 'boolean') {
    if (questionId === 'localWorkCapability') {
      return value ? 'できる' : '難しい'
    }

    return value ? 'はい' : 'いいえ'
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

export function coerceHearingSession(value: unknown): PlannerHearingSession | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const rawAnswers = candidate.answers && typeof candidate.answers === 'object'
    ? (candidate.answers as Record<string, unknown>)
    : {}
  const answers = Object.fromEntries(
    HEARING_QUESTION_IDS.map((questionId) => [
      questionId,
      normalizeAnswerValue(questionId, rawAnswers[questionId]),
    ]).filter((entry) => Boolean(entry[1])),
  ) as PlannerHearingSession['answers']
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages
      .map((message, index) => normalizeMessage(message, index))
      .filter((message): message is PlannerConversationMessage => message !== null)
    : []
  const lastQuestionId =
    typeof candidate.lastQuestionId === 'string' && HEARING_QUESTION_IDS.includes(candidate.lastQuestionId as PlannerHearingQuestionId)
      ? (candidate.lastQuestionId as PlannerHearingQuestionId)
      : null
  const summaryKeyPoints = normalizeSummaryKeyPoints(candidate.summaryKeyPoints)
  const personaIds = normalizePersonaIds(candidate.personaIds)

  return {
    answers,
    insights: sanitizeHearingInsights(candidate.insights as Record<string, unknown> | undefined),
    messages,
    lastQuestionId,
    transport: normalizeTransport(candidate.transport),
    completedAt: typeof candidate.completedAt === 'string' && candidate.completedAt.trim()
      ? candidate.completedAt.trim()
      : null,
    ...(summaryKeyPoints.length > 0 ? { summaryKeyPoints } : {}),
    ...(personaIds.length > 0 ? { personaIds } : {}),
  } as PlannerHearingSession
}

function deriveGoalTags(goal: string, session: PlannerHearingSession) {
  const payload = buildPlannerHearingPayload(goal, session.answers, session.insights)
  const searchable = [
    goal,
    session.answers.purpose,
    payload.insights.buildGoal,
    payload.insights.audience,
    payload.insights.deadline,
    ...payload.insights.mustHaveFeatures,
    ...payload.insights.preferences,
    ...payload.insights.constraints,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const tags = new Set<string>(['any-web-project', 'website-launch'])

  if (/(ポートフォリオ|portfolio|作品|実績|自己紹介|showcase)/.test(searchable)) {
    tags.add('portfolio-site')
  }

  if (/(会社|企業|お店|店舗|事業|ホームページ|homepage|コーポレート|公式サイト|サービス紹介)/.test(searchable)) {
    tags.add('business-homepage')
  }

  if (/(lp|ランディング|landing|キャンペーン|広告|cta)/.test(searchable)) {
    tags.add('landing-page')
  }

  if (
    payload.insights.projectType === 'authenticated-app'
    || payload.insights.projectType === 'database-app'
    || /(saas|mvp|ログイン|会員|認証|ダッシュボード|予約|フォーム|一覧|登録|データベース|cms|管理画面)/.test(searchable)
  ) {
    tags.add('saas-mvp')
  }

  if (/(ブログ|blog|記事|オウンドメディア|メディア)/.test(searchable)) {
    tags.add('blog-site')
  }

  return Array.from(tags)
}

function derivePersonaIds(goal: string, session: PlannerHearingSession) {
  const aiPersonaIds = getSessionPersonaIds(session)
  if (aiPersonaIds.length > 0) {
    return aiPersonaIds
  }

  const searchable = `${goal} ${session.answers.purpose ?? ''}`.toLowerCase()

  if (
    session.insights?.projectType
    || /(web|サイト|ページ|ホームページ|portfolio|ポートフォリオ|landing|ブログ|next\.js|vercel)/.test(searchable)
  ) {
    return [DEFAULT_PERSONA_ID]
  }

  return []
}

function buildHearingSummary(goal: string, session: PlannerHearingSession) {
  const payload = buildPlannerHearingPayload(goal, session.answers, session.insights)
  const aiSummaryKeyPoints = getSessionSummaryKeyPoints(session)
  const fallbackKeyPoints = uniqueStrings([
    payload.state.targetOutcome ? `目標要約: ${payload.state.targetOutcome}` : null,
    ...buildHearingSummaryEntries(session.answers).map((entry) => `${entry.label}: ${entry.value}`),
    payload.insights.audience ? `対象読者: ${payload.insights.audience}` : null,
    payload.insights.deadline ? `期限: ${payload.insights.deadline}` : null,
    ...payload.insights.constraints.map((constraint) => `制約: ${constraint}`),
    ...payload.insights.mustHaveFeatures.map((feature) => `必要機能: ${feature}`),
    ...payload.state.blockers.map((blocker) => `blocker: ${blocker}`),
  ])
    .slice(0, 30)
    .map((item) => item.slice(0, 500))
  const keyPoints = aiSummaryKeyPoints.length > 0 ? aiSummaryKeyPoints : fallbackKeyPoints

  if (keyPoints.length === 0 && !session.completedAt) {
    return undefined
  }

  return {
    keyPoints,
    ...(session.completedAt ? { lastSessionCompletedAt: session.completedAt } : {}),
  }
}

export function buildHearingPlanDraft(goal: string, session: PlannerHearingSession) {
  const payload = buildPlannerHearingPayload(goal, session.answers, session.insights)
  const personaIds = derivePersonaIds(goal, session)
  const goalTags = deriveGoalTags(goal, session)
  const hearingSummary = buildHearingSummary(goal, session)
  const blockers = payload.state.blockers.length > 0
    ? payload.state.blockers
    : payload.insights.constraints

  return {
    compileRequest: {
      goal,
      ...(goalTags.length > 0 ? { goalTags } : {}),
      ...(personaIds.length > 0 ? { personaIds } : {}),
      learnerState: {
        skillLevel: payload.state.skillLevel,
        blockers,
        signals: payload.state.signals,
      },
      ...(hearingSummary ? { hearingSummary } : {}),
    },
    goalRequest: {
      goal,
      tools: payload.profile.availableAiTools,
      os: session.answers.operatingSystem ?? '',
      cliFamiliarity: session.answers.cliFamiliarity ?? '',
      programmingExperience: session.answers.experience ?? '',
      aiExperience: session.answers.aiTools ?? '',
      audience: payload.insights.audience ?? '',
      deadline: payload.insights.deadline ?? '',
    },
    summary: {
      goal: payload.state.targetOutcome ?? goal,
      audience: payload.insights.audience,
      deadline: payload.insights.deadline,
      blockers,
      keyPoints: hearingSummary?.keyPoints ?? [],
      personaIds,
      personaLabels: personaIds.map((personaId) => PERSONA_LABELS[personaId] ?? personaId),
      preferredTools: payload.profile.availableAiTools,
      transport: session.transport,
    },
  }
}
