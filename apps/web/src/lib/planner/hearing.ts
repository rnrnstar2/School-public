import type { LearnerProfileInput } from '@/types'
import type {
  PlannerConversationMessage,
  PlannerHearingAnswers,
  PlannerHearingInsights,
  PlannerHearingProjectType,
  PlannerHearingQuestionId,
  PlannerHearingQuestion,
  PlannerHearingSession,
  PlannerHearingSummaryEntry,
  PlannerHearingTransport,
  PlannerPersistedHearingPayload,
} from '@/lib/planner/types'

export const plannerHearingQuestions: PlannerHearingQuestion[] = [
  {
    id: 'experience',
    label: '経験',
    prompt: 'まず、パソコンを使って何かを作った経験はどれくらいありますか？ ブログやSNS運営、ノーコードツール、Webサイト制作なども含めて教えてください。',
    choices: [
      '全くの初めてで、パソコンで何かを作った経験はほとんどない',
      'ブログやSNS運営、ノーコードツールなどで少し作ったことがある',
      'Webサイトやアプリを作ったことがある',
      'Webサイトやアプリを業務や制作で継続的に作っている',
    ],
  },
  {
    id: 'purpose',
    label: '目的',
    prompt: '最初に作りたいものを、もう一段だけ具体的に教えてください。短くて大丈夫です。',
  },
  {
    id: 'siteBehavior',
    label: '動き',
    prompt: '最初の版は、見るだけのページで足りますか？ それとも入力・保存・ログインなどの動きが必要ですか？',
    choices: [
      '文章・画像中心の静的ページでよい',
      '問い合わせフォームなど少し動きがほしい',
      'Webアプリとして動かしたい',
      'まだ決めきれていない',
    ],
  },
  {
    id: 'existingMaterials',
    label: '既存素材',
    prompt: 'すでに使えそうな文章、画像、ロゴ、参考サイト、ワイヤーなどはありますか？',
    choices: ['まだない', 'いくつかある'],
  },
  {
    id: 'operatingSystem',
    label: 'OS',
    prompt: '使う予定の PC の OS を教えてください。',
    choices: ['Mac', 'Windows', 'Linux'],
  },
  {
    id: 'localWorkCapability',
    label: 'ローカル作業',
    prompt: 'PC でアプリのインストールやターミナル利用はできそうですか？',
    choices: ['できる', '難しい', 'わからない'],
  },
  {
    id: 'cliFamiliarity',
    label: 'CLI 慣れ',
    prompt: 'ターミナルや CLI にはどれくらい慣れていますか？',
    choices: ['ほぼ初めて', '少し触れる', '普段から使う'],
  },
  {
    id: 'aiTools',
    label: 'AI ツール',
    prompt: '今使える AI ツールはありますか？',
    choices: ['Claude Code', 'Cursor', 'ChatGPT', 'まだない'],
  },
]

const orderedQuestionIds = plannerHearingQuestions.map((question) => question.id)
const fallbackQuestionIds: PlannerHearingQuestionId[] = ['purpose', 'siteBehavior']
const explicitUnknownPattern = /^(まだない|なし|特になし|未定|わからない|不明|まだ決めきれていない)$/

export const defaultFallbackHearingTransport: PlannerHearingTransport = {
  status: 'fallback',
  label: 'ローカル hearing (簡易モード)',
  message: 'ZAI hearing が使えないため、ローカルの簡易モードで最小限の前提だけ集めています。',
}

export const emptyHearingInsights: PlannerHearingInsights = {
  buildGoal: null,
  audience: null,
  deadline: null,
  projectType: null,
  constraints: [],
  preferences: [],
  mustHaveFeatures: [],
  planningFocus: [],
}

const DEADLINE_PATTERNS: RegExp[] = [
  /(\d+)\s*(?:ヶ月|か月|カ月)(?:以内|まで)?/,
  /(\d+)\s*(?:週間|しゅうかん)(?:以内|まで)?/,
  /(\d+)\s*(?:日|にち)(?:以内|まで)?/,
  /(?:今月|来月|再来月)(?:まで|中)?/,
  /(\d{4})\s*年\s*(\d{1,2})\s*月/,
]

function normalizeAnswer(value: string | undefined) {
  return value?.trim() ?? ''
}

function normalizeForMatch(value: string | undefined) {
  return normalizeAnswer(value).toLowerCase()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
}

function inferProjectTypeFromText(goal: string, purpose: string, siteBehavior = '') {
  const normalized = normalizeForMatch(`${goal} ${purpose} ${siteBehavior}`)

  if (/(静的|文章|画像中心|見るだけ|見せるだけ|html|css)/.test(normalized)) {
    return 'content-site' satisfies PlannerHearingProjectType
  }

  if (/(ログイン|会員|認証|アカウント|マイページ|ダッシュボード)/.test(normalized)) {
    return 'authenticated-app' satisfies PlannerHearingProjectType
  }

  if (/(予約|フォーム|一覧|登録|データベース|cms|管理画面)/.test(normalized)) {
    return 'database-app' satisfies PlannerHearingProjectType
  }

  if (/(webアプリ|web app|アプリ|ツール|サービス|プロダクト|チャット|todo|タスク|メモ|bot)/.test(normalized)) {
    return 'database-app' satisfies PlannerHearingProjectType
  }

  return null
}

function inferAudience(goal: string, purpose: string) {
  const text = normalizeAnswer(purpose) || normalizeAnswer(goal)
  const audienceMatch = text.match(/(.+?)(?:向け|の人向け|に見せたい|に届けたい)/)
  return audienceMatch?.[1]?.trim() ?? null
}

function inferDeadline(goal: string, purpose: string) {
  const text = normalizeAnswer(`${purpose} ${goal}`)

  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern)

    if (match?.[0]?.trim()) {
      return match[0].trim()
    }
  }

  return null
}

function inferConstraints(
  localWorkCapability: string,
  operatingSystem: string,
  existingMaterials: string
) {
  const constraints: string[] = []

  if (normalizeAnswer(localWorkCapability)) {
    constraints.push(`ローカル作業条件: ${normalizeAnswer(localWorkCapability)}`)
  }

  if (normalizeAnswer(operatingSystem)) {
    constraints.push(`利用OS: ${normalizeAnswer(operatingSystem)}`)
  }

  if (isExplicitUnknown(existingMaterials)) {
    constraints.push('既存素材なし')
  }

  return uniqueStrings(constraints)
}

function inferPreferences(purpose: string, existingMaterials: string, aiTools: string) {
  const preferences: string[] = []
  const normalizedPurpose = normalizeForMatch(purpose)
  const normalizedMaterials = normalizeForMatch(existingMaterials)
  const normalizedTools = normalizeForMatch(aiTools)

  if (/(ポートフォリオ|lp|ランディング|ホームページ|店舗|紹介)/.test(normalizedPurpose)) {
    preferences.push('見た目を早めに形にしたい')
  }

  if (normalizedMaterials && !isExplicitUnknown(existingMaterials)) {
    preferences.push('既存素材を活かしたい')
  }

  if (/(claude|codex|cursor|chatgpt)/.test(normalizedTools)) {
    preferences.push('AIを使って実装を進めたい')
  }

  return uniqueStrings(preferences)
}

function inferMustHaveFeatures(goal: string, purpose: string, siteBehavior = '') {
  const text = normalizeForMatch(`${goal} ${purpose} ${siteBehavior}`)
  const features: string[] = []

  if (/(ログイン|会員|認証|マイページ)/.test(text)) {
    features.push('認証')
  }

  if (/(予約|フォーム|登録|一覧|cms|データベース|webアプリ|web app|アプリ|チャット|todo|タスク|メモ|bot)/.test(text)) {
    features.push('データ入出力')
  }

  if (/(lp|ランディング|ポートフォリオ|ホームページ|紹介|店舗)/.test(text)) {
    features.push('見せるための公開ページ')
  }

  return uniqueStrings(features)
}

function inferPlanningFocus(
  experience: string,
  cliFamiliarity: string,
  localWorkCapability: string,
  purpose: string,
  siteBehavior: string,
  deadline: string
) {
  const focus: string[] = []
  const skillLevel = inferSkillLevel(experience)
  const normalizedCli = normalizeForMatch(cliFamiliarity)
  const normalizedLocal = normalizeForMatch(localWorkCapability)
  const normalizedPurpose = normalizeForMatch(`${purpose} ${siteBehavior}`)
  const normalizedDeadline = normalizeForMatch(deadline)

  if (skillLevel === 'beginner' || /(初めて|不安|ほぼ初めて)/.test(normalizedCli)) {
    focus.push('setup-support')
  }

  if (/(できない|難しい|厳しい|制限|スマホだけ)/.test(normalizedLocal)) {
    focus.push('workflow-constraints')
  }

  if (/(ログイン|会員|認証|予約|フォーム|一覧|登録|cms|データベース)/.test(normalizedPurpose)) {
    focus.push('first-slice')
  } else {
    focus.push('scope')
  }

  if (normalizedDeadline && !/(特に急がない|急がない|未定)/.test(normalizedDeadline)) {
    focus.push('pace')
  }

  return uniqueStrings(focus)
}

export function sanitizeHearingInsights(insights?: Partial<PlannerHearingInsights> | null): PlannerHearingInsights {
  const projectType = insights?.projectType
  const normalizedProjectType =
    projectType === 'content-site' || projectType === 'database-app' || projectType === 'authenticated-app'
      ? projectType
      : null

  return {
    buildGoal: normalizeAnswer(insights?.buildGoal ?? undefined) || null,
    audience: normalizeAnswer(insights?.audience ?? undefined) || null,
    deadline: normalizeAnswer(insights?.deadline ?? undefined) || null,
    projectType: normalizedProjectType,
    constraints: uniqueStrings(insights?.constraints ?? []),
    preferences: uniqueStrings(insights?.preferences ?? []),
    mustHaveFeatures: uniqueStrings(insights?.mustHaveFeatures ?? []),
    planningFocus: uniqueStrings(insights?.planningFocus ?? []),
  }
}

export function mergeHearingInsights(
  current: Partial<PlannerHearingInsights> | null | undefined,
  incoming: Partial<PlannerHearingInsights> | null | undefined
) {
  const currentSanitized = sanitizeHearingInsights(current)
  const incomingSanitized = sanitizeHearingInsights(incoming)

  return {
    buildGoal: incomingSanitized.buildGoal ?? currentSanitized.buildGoal,
    audience: incomingSanitized.audience ?? currentSanitized.audience,
    deadline: incomingSanitized.deadline ?? currentSanitized.deadline,
    projectType: incomingSanitized.projectType ?? currentSanitized.projectType,
    constraints: uniqueStrings([...currentSanitized.constraints, ...incomingSanitized.constraints]),
    preferences: uniqueStrings([...currentSanitized.preferences, ...incomingSanitized.preferences]),
    mustHaveFeatures: uniqueStrings([...currentSanitized.mustHaveFeatures, ...incomingSanitized.mustHaveFeatures]),
    planningFocus: uniqueStrings([...currentSanitized.planningFocus, ...incomingSanitized.planningFocus]),
  } satisfies PlannerHearingInsights
}

export function inferHearingInsights(goal: string, answers: Partial<PlannerHearingAnswers>) {
  const experience = normalizeAnswer(answers.experience)
  const purpose = normalizeAnswer(answers.purpose)
  const siteBehavior = normalizeAnswer(answers.siteBehavior)
  const existingMaterials = normalizeAnswer(answers.existingMaterials)
  const operatingSystem = normalizeAnswer(answers.operatingSystem)
  const localWorkCapability = normalizeAnswer(answers.localWorkCapability)
  const cliFamiliarity = normalizeAnswer(answers.cliFamiliarity)
  const aiTools = normalizeAnswer(answers.aiTools)
  const deadline = inferDeadline(goal, purpose)

  return sanitizeHearingInsights({
    buildGoal: purpose || goal.trim() || null,
    audience: inferAudience(goal, purpose),
    deadline,
    projectType: inferProjectTypeFromText(goal, purpose, siteBehavior),
    constraints: inferConstraints(localWorkCapability, operatingSystem, existingMaterials),
    preferences: inferPreferences(purpose, existingMaterials, aiTools),
    mustHaveFeatures: inferMustHaveFeatures(goal, purpose, siteBehavior),
    planningFocus: inferPlanningFocus(experience, cliFamiliarity, localWorkCapability, purpose, siteBehavior, deadline ?? ''),
  })
}

function isExplicitUnknown(value: string | undefined) {
  return explicitUnknownPattern.test(normalizeForMatch(value))
}

function hasConcreteAppFeatureSignal(value: string) {
  return /(予約|フォーム|ログイン|会員|認証|チャット|todo|タスク|家計簿|カレンダー|日報|在庫|ec|決済|検索|投稿|掲示板|ブログ|cms|管理|ダッシュボード|マイページ|aiチャット|bot|分析|レポート)/.test(value)
}

function isLikelyAppGoal(goal: string) {
  const normalized = normalizeForMatch(goal)

  if (/(サービスページ|紹介サイト|紹介ページ|ホームページ|ポートフォリオ|lp|ランディング|店舗|お店)/.test(normalized)) {
    return false
  }

  return /(webアプリ|web app|アプリ|ツール|サービス|プロダクト|ダッシュボード)/.test(normalized)
}

function isGenericAppGoal(goal: string) {
  const normalized = normalizeForMatch(goal)

  if (!isLikelyAppGoal(normalized)) {
    return false
  }

  return !hasConcreteAppFeatureSignal(normalized)
}

function isLikelyShowcaseGoal(goal: string) {
  return /(ポートフォリオ|ホームページ|webサイト|サイト|lp|ランディング|店舗|お店|紹介|採用|ブランド|サービスページ)/.test(
    normalizeForMatch(goal)
  )
}

function hasPurposeDetail(goal: string) {
  return /(向け|に見せ|に届け|紹介したい|掲載したい|公開したい|集客|採用|予約|問い合わせ|問合せ|ログイン|フォーム|管理|販売|決済)/.test(
    normalizeForMatch(goal)
  )
}

function goalNeedsPurposeDetail(goal: string) {
  const normalized = normalizeForMatch(goal)

  if (!normalized) {
    return true
  }

  if (isGenericAppGoal(normalized)) {
    return true
  }

  if (/^(webサイト|サイト|ホームページ|webアプリ|アプリ|ツール|サービス)(を)?作りたい$/.test(normalized)) {
    return true
  }

  if (isLikelyShowcaseGoal(normalized) && !hasPurposeDetail(normalized)) {
    return true
  }

  if (normalized.length >= 16) {
    return false
  }

  return !/(ポートフォリオ|ホームページ|サイト|lp|ランディングページ|予約|フォーム|店舗|お店|ブログ|メディア|会員|ログイン|ダッシュボード)/.test(
    normalized
  )
}

export function buildHearingPurposePrompt(goal: string) {
  if (isLikelyAppGoal(goal)) {
    return '最初に動かしたい機能を1つだけ教えてください。短くて大丈夫です。'
  }

  if (isLikelyShowcaseGoal(goal)) {
    return '最初のページで一番伝えたい内容を1つだけ教えてください。短くて大丈夫です。'
  }

  return '最初に作りたいものを、もう一段だけ具体的に教えてください。短くて大丈夫です。'
}

function buildHearingSiteBehaviorPrompt(goal: string) {
  if (isLikelyAppGoal(goal)) {
    return 'その機能は、ログインやデータ保存が必要ですか？ まずは画面だけで確認できれば十分ですか？'
  }

  return '最初の版は、見るだけの静的ページで足りますか？ それとも入力・保存・ログインなどの動きが必要ですか？'
}

function buildContextualHearingPrompt(goal: string, questionId: PlannerHearingQuestionId) {
  if (questionId === 'purpose') {
    return buildHearingPurposePrompt(goal)
  }

  if (questionId === 'siteBehavior') {
    return buildHearingSiteBehaviorPrompt(goal)
  }

  const question = plannerHearingQuestions.find((item) => item.id === questionId)
  return question?.prompt ?? '次に必要な前提を一つ教えてください。'
}

function hasExplicitSiteBehaviorSignal(value: string) {
  const normalized = normalizeForMatch(value)

  return /(ログイン|会員|認証|アカウント|マイページ|ダッシュボード|データ保存|データベース|db|webアプリ|web app|アプリ|ツール|サービス|プロダクト|チャット|todo|タスク|メモ|bot|フォーム|問い合わせ|問合せ|予約|決済|登録|検索|cms|管理画面|少し動き|動きがほしい|静的|文章|画像|見るだけ|見せるだけ|html|css|ページだけ|lp|ランディング|ポートフォリオ|ホームページ|紹介|店舗|お店|未定|わからない|決めきれていない|迷っている)/.test(normalized)
}

export function buildImplicitHearingAnswers(
  goal: string,
  answers: Partial<PlannerHearingAnswers>
): Partial<PlannerHearingAnswers> {
  const nextAnswers = mergeHearingAnswers({}, answers)
  const normalizedGoal = goal.trim()
  const currentPurpose = normalizeAnswer(nextAnswers.purpose)

  if (
    (!currentPurpose || isExplicitUnknown(currentPurpose))
    && normalizedGoal
    && !goalNeedsPurposeDetail(normalizedGoal)
  ) {
    nextAnswers.purpose = normalizedGoal
  }

  if (!normalizeAnswer(nextAnswers.siteBehavior)) {
    const siteBehaviorSource = `${normalizedGoal} ${normalizeAnswer(nextAnswers.purpose)}`
    const inferredSiteBehavior = hasExplicitSiteBehaviorSignal(siteBehaviorSource)
      ? inferFallbackSiteBehavior(siteBehaviorSource)
      : ''

    if (inferredSiteBehavior) {
      nextAnswers.siteBehavior = inferredSiteBehavior
    }
  }

  return nextAnswers
}

export function mergeHearingAnswers(
  current: Partial<PlannerHearingAnswers>,
  incoming: Partial<PlannerHearingAnswers>
): Partial<PlannerHearingAnswers> {
  const nextAnswers = { ...current }

  for (const questionId of orderedQuestionIds) {
    const candidate = normalizeAnswer(incoming[questionId])

    if (candidate) {
      nextAnswers[questionId] = candidate
    }
  }

  return nextAnswers
}

export function getRequiredHearingQuestionIds(goal: string, answers: Partial<PlannerHearingAnswers>) {
  const effectiveAnswers = buildImplicitHearingAnswers(goal, answers)

  return fallbackQuestionIds.filter((questionId) => !normalizeAnswer(effectiveAnswers[questionId]))
}

export function getMissingHearingQuestionIds(goal: string, answers: Partial<PlannerHearingAnswers>) {
  return getRequiredHearingQuestionIds(goal, answers)
}

function buildHearingQuestionPriority(goal: string, answers: Partial<PlannerHearingAnswers>) {
  void goal
  const missing = new Set(getMissingHearingQuestionIds(goal, answers))
  const priority: PlannerHearingQuestionId[] = []

  if (missing.has('purpose')) {
    priority.push('purpose')
  }

  if (missing.has('siteBehavior')) {
    priority.push('siteBehavior')
  }

  if (missing.has('operatingSystem')) {
    priority.push('operatingSystem')
  }

  return priority
}

export function findNextHearingQuestionId(goal: string, answers: Partial<PlannerHearingAnswers>) {
  return buildHearingQuestionPriority(goal, answers)[0] ?? null
}

export function isHearingComplete(goal: string, answers: Partial<PlannerHearingAnswers>) {
  return getMissingHearingQuestionIds(goal, answers).length === 0
}

export function getCurrentHearingQuestion(session: PlannerHearingSession | null) {
  if (!session || session.completedAt) {
    return null
  }

  const goalMessage = session.messages.find((message) => message.id === 'goal')?.content ?? ''
  const questionId = session.lastQuestionId ?? findNextHearingQuestionId(goalMessage.replace(/^目標:\s*/, ''), session.answers)
  return plannerHearingQuestions.find((question) => question.id === questionId) ?? null
}

export function createInitialHearingSession(
  goal: string,
  transport: PlannerHearingTransport = defaultFallbackHearingTransport
): PlannerHearingSession {
  const initialAnswers = buildImplicitHearingAnswers(goal, {})
  const nextQuestionId = findNextHearingQuestionId(goal, initialAnswers)
  const completedAt = nextQuestionId ? null : new Date().toISOString()
  const assistantMessage = nextQuestionId
    ? buildContextualHearingPrompt(goal, nextQuestionId)
    : '必要な前提が揃いました。ここまでの内容でプランを作成します。'

  return {
    answers: initialAnswers,
    insights: inferHearingInsights(goal, initialAnswers),
    messages: [
      {
        id: 'goal',
        role: 'user',
        content: `目標: ${goal.trim() || 'Webサイトを公開したい'}`,
      },
      {
        id: nextQuestionId ? `${nextQuestionId}-prompt` : 'hearing-finished',
        role: 'assistant',
        content: assistantMessage,
      },
    ],
    lastQuestionId: nextQuestionId,
    transport,
    completedAt,
  }
}

function normalizeFallbackOperatingSystem(value: string) {
  const normalized = value.toLowerCase()

  if (/(mac|macos|mac os)/.test(normalized)) {
    return 'Mac'
  }

  if (/(windows|win11|win10|win)/.test(normalized)) {
    return 'Windows'
  }

  if (/(linux|ubuntu|debian|fedora)/.test(normalized)) {
    return 'Linux'
  }

  return ''
}

function inferFallbackExperience(value: string) {
  const normalized = value.toLowerCase()

  if (!normalized.trim()) {
    return ''
  }

  if (/(初めて|未経験|ほぼ初めて|初心者)/.test(normalized)) {
    return '全くの初めてで、パソコンで何かを作った経験はほとんどない'
  }

  if (/(ブログ|sns|ノーコード|少し|触った|学習した|授業|チュートリアル)/.test(normalized)) {
    return 'ブログやSNS運営、ノーコードツールなどで少し作ったことがある'
  }

  if (/(実務|業務|継続的|仕事|案件)/.test(normalized)) {
    return 'Webサイトやアプリを業務や制作で継続的に作っている'
  }

  if (/(サイト|アプリ|作ったことがある|開発した)/.test(normalized)) {
    return 'Webサイトやアプリを作ったことがある'
  }

  return ''
}

function inferFallbackLocalWorkCapability(value: string) {
  const normalized = value.toLowerCase()

  if (!normalized.trim()) {
    return ''
  }

  if (/(できない|難しい|厳しい|制限|権限がない|インストール不可|会社pc)/.test(normalized)) {
    return '難しい'
  }

  if (/(mac|windows|linux|できる|可能|自分のpc|インストールできる|ターミナル)/.test(normalized)) {
    return 'できる'
  }

  return ''
}

function inferFallbackSiteBehavior(value: string) {
  const normalized = value.toLowerCase()

  if (!normalized.trim()) {
    return ''
  }

  if (/(ログイン|会員|認証|アカウント|マイページ|ダッシュボード|データ保存|データベース|db)/.test(normalized)) {
    return 'ログインやデータ保存があるWebアプリにしたい'
  }

  if (/(フォーム|問い合わせ|問合せ|予約|決済|登録|検索|cms|管理画面|少し動き|動きがほしい)/.test(normalized)) {
    return '問い合わせフォームなど少し動きがほしい'
  }

  if (/(静的|文章|画像|見るだけ|見せるだけ|html|css|ページだけ|lp|ランディング|ポートフォリオ|ホームページ|紹介|店舗|お店)/.test(normalized)) {
    return '文章・画像中心の静的ページでよい'
  }

  if (/(webアプリ|web app|アプリ|ツール|サービス|プロダクト|チャット|todo|タスク|メモ|bot)/.test(normalized)) {
    return 'Webアプリとして動かしたい'
  }

  if (/(未定|わからない|決めきれていない|迷っている)/.test(normalized)) {
    return 'まだ決めきれていない'
  }

  return ''
}

function inferFallbackAiTools(value: string) {
  const matched = uniqueStrings(
    ['Claude Code', 'Codex', 'Cursor', 'ChatGPT'].filter((tool) => value.toLowerCase().includes(tool.toLowerCase()))
  )

  return matched.join('、')
}

export function inferLocalHearingAnswerPatch(
  answer: string,
  currentAnswers: Partial<PlannerHearingAnswers> = {},
): Partial<PlannerHearingAnswers> {
  const trimmed = answer.trim()

  if (!trimmed) {
    return {}
  }

  const patch: Partial<PlannerHearingAnswers> = {}

  if (!normalizeAnswer(currentAnswers.purpose)) {
    patch.purpose = trimmed
  }

  if (!normalizeAnswer(currentAnswers.experience)) {
    const inferred = inferFallbackExperience(trimmed)
    if (inferred) {
      patch.experience = inferred
    }
  }

  if (!normalizeAnswer(currentAnswers.siteBehavior)) {
    const inferred = hasExplicitSiteBehaviorSignal(trimmed)
      ? inferFallbackSiteBehavior(trimmed)
      : ''
    if (inferred) {
      patch.siteBehavior = inferred
    }
  }

  if (!normalizeAnswer(currentAnswers.operatingSystem)) {
    const inferred = normalizeFallbackOperatingSystem(trimmed)
    if (inferred) {
      patch.operatingSystem = inferred
    }
  }

  if (!normalizeAnswer(currentAnswers.localWorkCapability)) {
    const inferred = inferFallbackLocalWorkCapability(trimmed)
    if (inferred) {
      patch.localWorkCapability = inferred
    }
  }

  if (!normalizeAnswer(currentAnswers.aiTools)) {
    const inferred = inferFallbackAiTools(trimmed)
    if (inferred) {
      patch.aiTools = inferred
    }
  }

  return patch
}

export function createLocalHearingTurn(
  goal: string,
  currentSession: PlannerHearingSession | null,
  answer: string | null,
  transport: PlannerHearingTransport = defaultFallbackHearingTransport
) {
  const session = currentSession ?? createInitialHearingSession(goal, transport)

  if (!answer?.trim()) {
    return {
      session,
      completed: Boolean(session.completedAt),
    }
  }

  const baseAnswers = buildImplicitHearingAnswers(goal, session.answers)
  const questionId = session.lastQuestionId ?? findNextHearingQuestionId(goal, baseAnswers)
  const inferredPatch = inferLocalHearingAnswerPatch(answer, baseAnswers)
  const directAnswerPatch: Partial<PlannerHearingAnswers> = {}

  if (questionId === 'purpose') {
    directAnswerPatch.purpose = answer.trim()
  }

  if (questionId === 'siteBehavior') {
    const inferredSiteBehavior = inferFallbackSiteBehavior(answer)
    if (inferredSiteBehavior) {
      directAnswerPatch.siteBehavior = inferredSiteBehavior
    }
  }

  if (questionId === 'operatingSystem') {
    directAnswerPatch.operatingSystem = normalizeFallbackOperatingSystem(answer) || answer.trim()
  }

  const nextAnswers = mergeHearingAnswers(baseAnswers, {
    ...inferredPatch,
    ...directAnswerPatch,
  })
  const nextQuestionId = findNextHearingQuestionId(goal, nextAnswers)
  const completedAt = nextQuestionId ? null : new Date().toISOString()

  const nextInsights = mergeHearingInsights(inferHearingInsights(goal, nextAnswers), session.insights)
  const nextMessages = [
    ...session.messages,
    {
      id: `answer-${Date.now()}`,
      role: 'user' as const,
      content: answer.trim(),
    },
  ]

  if (nextQuestionId && !completedAt) {
    nextMessages.push({
      id: `${nextQuestionId}-prompt-${Date.now() + 1}`,
      role: 'assistant',
      content: buildContextualHearingPrompt(goal, nextQuestionId),
    })
  } else {
    nextMessages.push({
      id: `hearing-finished-${Date.now() + 1}`,
      role: 'assistant',
      content: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
    })
  }

  return {
    session: {
      answers: nextAnswers,
      insights: nextInsights,
      messages: nextMessages,
      lastQuestionId: nextQuestionId ?? null,
      transport,
      completedAt,
    },
    completed: Boolean(completedAt),
  }
}

export function buildHearingMessages(_goal: string, session: PlannerHearingSession | null): PlannerConversationMessage[] {
  return session?.messages ?? []
}

function inferSkillLevel(experience: string) {
  const normalized = experience.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (
    /(webサイトやアプリを業務や制作で継続的に作っている|業務や制作で.*作っている|実務|仕事|案件|普段から|慣れて|運用|制作したことがある|複数回|webサイトやアプリを作ったことがある)/
      .test(normalized)
  ) {
    return 'advanced' as const
  }

  if (
    /(ブログ|sns|ノーコード|少し作った|少し経験|少し|少々|触った|やったことがある|授業|学んだ|チュートリアル|写経)/
      .test(normalized)
  ) {
    return 'intermediate' as const
  }

  return 'beginner' as const
}

function inferCliFamiliarity(value: string) {
  const normalized = value.toLowerCase()

  if (!normalized.trim()) {
    return null
  }

  if (/(普段|日常的|毎日|慣れて|使っている|使えます|問題ない)/.test(normalized)) {
    return 'comfortable' as const
  }

  if (/(少し|ちょっと|少々|たまに|コピペなら|見ながらなら)/.test(normalized)) {
    return 'basic' as const
  }

  return 'none' as const
}

function inferCanUseLocalTools(localWorkCapability: string, operatingSystem: string) {
  const normalized = `${localWorkCapability} ${operatingSystem}`.toLowerCase()

  if (!normalized.trim()) {
    return null
  }

  if (/(できない|難しい|厳しい|スマホだけ|タブレットだけ|会社pcで制限|権限がない|インストール不可)/.test(normalized)) {
    return false
  }

  if (/(できる|可能|pcがある|mac|windows|linux|ubuntu|ローカル|自分のパソコン|インストールできる)/.test(normalized)) {
    return true
  }

  return null
}

function extractOperatingSystem(value: string) {
  const normalized = value.toLowerCase()

  if (normalized.includes('mac')) {
    return 'macOS'
  }

  if (normalized.includes('windows')) {
    return 'Windows'
  }

  if (normalized.includes('linux') || normalized.includes('ubuntu')) {
    return 'Linux'
  }

  return value.trim() || null
}

function parseAiTools(value: string) {
  if (isExplicitUnknown(value)) {
    return []
  }

  return value
    .split(/[、,\n/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(まだない|なし|未使用|特になし)$/.test(item.toLowerCase()))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
}

function inferProjectComplexity(purpose: string, siteBehavior: string, insights?: PlannerHearingInsights) {
  const normalized = `${purpose} ${siteBehavior} ${(insights?.mustHaveFeatures ?? []).join(' ')}`.toLowerCase()
  const projectType = insights?.projectType ?? null

  if (
    projectType === 'authenticated-app'
    || /(ログイン|会員|認証|アカウント|マイページ|ダッシュボード|webアプリ|web app|アプリ|データ保存|データベース|db)/.test(normalized)
  ) {
    return 'web-app' as const
  }

  if (
    projectType === 'database-app'
    || /(フォーム|問い合わせ|問合せ|予約|決済|登録|検索|cms|管理画面|少し動き)/.test(normalized)
  ) {
    return 'interactive-site' as const
  }

  if (projectType === 'content-site' || /(静的|文章|画像中心|見るだけ|見せるだけ|html|css|ページだけ)/.test(normalized)) {
    return 'static-site' as const
  }

  return undefined
}

function recommendedStackForComplexity(
  complexity: ReturnType<typeof inferProjectComplexity>,
  aiTools: string,
) {
  const normalizedTools = aiTools.toLowerCase()
  const aiTool = /(claude code)/.test(normalizedTools)
    ? 'Claude Code'
    : /(codex)/.test(normalizedTools)
      ? 'Codex CLI'
      : /(cursor)/.test(normalizedTools)
        ? 'Cursor'
        : 'AI coding CLI'

  if (complexity === 'static-site') {
    return [aiTool, 'HTML', 'CSS']
  }

  if (complexity === 'interactive-site') {
    return [aiTool, 'HTML/CSS or Next.js', 'Form/backend service']
  }

  if (complexity === 'web-app') {
    return [aiTool, 'Next.js', 'Supabase', 'Vercel']
  }

  return [aiTool]
}

function inferSignals(
  purpose: string,
  siteBehavior: string,
  aiTools: string,
  localWorkCapability: string,
  insights?: PlannerHearingInsights
) {
  const normalizedPurpose = purpose.toLowerCase()
  const normalizedSiteBehavior = siteBehavior.toLowerCase()
  const normalizedTools = aiTools.toLowerCase()
  const normalizedLocal = localWorkCapability.toLowerCase()
  const mustHaveFeatures = (insights?.mustHaveFeatures ?? []).join(' ').toLowerCase()
  const projectType = insights?.projectType ?? null
  const projectComplexity = inferProjectComplexity(purpose, siteBehavior, insights)
  const wantsStaticSite = projectComplexity === 'static-site'
  const needsBackend = projectComplexity === 'interactive-site' || projectComplexity === 'web-app'
  const needsNextjs = projectComplexity === 'web-app'

  return {
    audience: insights?.audience ?? undefined,
    deadline: insights?.deadline ?? undefined,
    wants_content_site:
      wantsStaticSite
      || /(ポートフォリオ|紹介|店舗|お店|lp|ランディングページ|ホームページ)/.test(`${normalizedPurpose} ${normalizedSiteBehavior}`),
    wants_static_site: wantsStaticSite,
    wants_authenticated_app:
      projectType === 'authenticated-app' || /(ログイン|会員|認証|ダッシュボード)/.test(`${normalizedPurpose} ${mustHaveFeatures}`),
    wants_database_app:
      projectType === 'database-app' || /(予約|フォーム|一覧|登録|データベース|cms)/.test(`${normalizedPurpose} ${mustHaveFeatures}`),
    needs_backend: needsBackend,
    needs_nextjs: needsNextjs,
    project_complexity: projectComplexity,
    recommended_stack: recommendedStackForComplexity(projectComplexity, aiTools),
    has_node: /(claude code|codex|cursor|vscode|node|npm|pnpm)/.test(`${normalizedTools} ${normalizedLocal}`),
  }
}

export function buildHearingSummaryEntries(answers: Partial<PlannerHearingAnswers>): PlannerHearingSummaryEntry[] {
  return plannerHearingQuestions
    .map((question) => ({
      id: question.id,
      label: question.label,
      value: normalizeAnswer(answers[question.id]),
    }))
    .filter((entry) => entry.value)
}

export function buildPlannerHearingPayload(
  goal: string,
  answers: Partial<PlannerHearingAnswers>,
  insights?: Partial<PlannerHearingInsights> | null
): PlannerPersistedHearingPayload {
  const effectiveAnswers = buildImplicitHearingAnswers(goal, answers)
  const experience = normalizeAnswer(effectiveAnswers.experience)
  const purpose = normalizeAnswer(effectiveAnswers.purpose) || goal.trim()
  const siteBehavior = normalizeAnswer(effectiveAnswers.siteBehavior)
  const existingMaterials = normalizeAnswer(effectiveAnswers.existingMaterials)
  const operatingSystem = normalizeAnswer(effectiveAnswers.operatingSystem)
  const localWorkCapability = normalizeAnswer(effectiveAnswers.localWorkCapability)
  const cliFamiliarity = normalizeAnswer(effectiveAnswers.cliFamiliarity)
  const aiTools = normalizeAnswer(effectiveAnswers.aiTools)
  const resolvedInsights = mergeHearingInsights(inferHearingInsights(goal, effectiveAnswers), insights)
  const blockers = uniqueStrings(
    resolvedInsights.constraints.filter((constraint) => /(できない|難しい|厳しい|制限|不足|なし|未定|不明)/.test(constraint.toLowerCase()))
  )

  return {
    profile: {
      experienceSummary: experience || null,
      operatingSystem: extractOperatingSystem(operatingSystem),
      cliFamiliarity: inferCliFamiliarity(cliFamiliarity),
      availableAiTools: parseAiTools(aiTools),
      canUseLocalTools: inferCanUseLocalTools(localWorkCapability, operatingSystem),
    },
    state: {
      targetOutcome: resolvedInsights.buildGoal || purpose || null,
      skillLevel: inferSkillLevel(experience),
      existingMaterials: existingMaterials || null,
      blockers,
      signals: inferSignals(purpose, siteBehavior, aiTools, localWorkCapability, resolvedInsights),
    },
    insights: resolvedInsights,
  }
}

export function toLearnerProfileInput(payload: PlannerPersistedHearingPayload): LearnerProfileInput {
  return {
    experience_summary: payload.profile.experienceSummary,
    operating_system: payload.profile.operatingSystem,
    cli_familiarity: payload.profile.cliFamiliarity,
    available_ai_tools: payload.profile.availableAiTools,
    can_use_local_tools: payload.profile.canUseLocalTools,
  }
}

export function toLearnerStateInput(payload: PlannerPersistedHearingPayload) {
  return {
    target_outcome: payload.state.targetOutcome,
    skill_level: payload.state.skillLevel,
    existing_materials: payload.state.existingMaterials,
    blockers: payload.state.blockers,
    signals: payload.state.signals,
  }
}
