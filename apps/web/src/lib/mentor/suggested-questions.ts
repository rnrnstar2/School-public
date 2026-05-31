export interface SuggestedQuestionLessonContext {
  id: string
  title: string
  summary?: string | null
}

export interface BuildSuggestedQuestionsInput {
  lessonContext?: SuggestedQuestionLessonContext | null
  blockers?: string[] | null
  memoryBullets?: string[] | null
  goalText?: string | null
}

const FALLBACK_SUGGESTED_QUESTIONS = [
  '今日の学習で、いちばん整理したいことは何ですか？',
  '今いちばん手が止まっているポイントはどこですか？',
  '次の一歩を決めるために、何を一緒に確認したいですか？',
] as const

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/^[-*・]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function trimSentenceEnding(value: string): string {
  return value.replace(/[。！？!?]+$/u, '').trim()
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeTopic(value: string | null | undefined, maxLength = 28): string | null {
  const normalized = trimSentenceEnding(normalizeText(value))
  if (!normalized) {
    return null
  }

  return truncateLabel(normalized, maxLength)
}

function normalizeList(values: string[] | null | undefined, maxLength = 28): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values ?? []) {
    const topic = normalizeTopic(value, maxLength)
    if (!topic) {
      continue
    }

    const dedupeKey = topic.toLocaleLowerCase('ja-JP')
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    normalized.push(topic)
  }

  return normalized
}

function pushUniqueQuestion(target: string[], question: string) {
  if (!target.includes(question)) {
    target.push(question)
  }
}

export function buildSuggestedQuestions(input: BuildSuggestedQuestionsInput): string[] {
  const lessonTitle = normalizeTopic(input.lessonContext?.title, 36)
  const blockers = normalizeList(input.blockers, 30)
  const memoryBullets = normalizeList(input.memoryBullets, 30)
  const goalText = normalizeTopic(input.goalText, 34)
  const primaryBlocker = blockers[0] ?? null
  const recentMemory = memoryBullets[0] ?? null
  const questions: string[] = []

  if (lessonTitle && primaryBlocker) {
    pushUniqueQuestion(
      questions,
      `前回つまずいた「${primaryBlocker}」を、「${lessonTitle}」のどこから一緒に整理しますか？`,
    )
  }

  if (lessonTitle && recentMemory) {
    pushUniqueQuestion(
      questions,
      `前に話していた「${recentMemory}」を踏まえると、「${lessonTitle}」のどこを確認したいですか？`,
    )
  }

  if (lessonTitle && goalText) {
    pushUniqueQuestion(
      questions,
      `「${goalText}」に近づくために、「${lessonTitle}」で今いちばん聞きたいことは何ですか？`,
    )
  }

  if (lessonTitle) {
    pushUniqueQuestion(
      questions,
      `「${lessonTitle}」のどこから始めるか迷っていますか？`,
    )
    pushUniqueQuestion(
      questions,
      `「${lessonTitle}」で手が止まりそうなポイントはどこですか？`,
    )
  }

  if (primaryBlocker) {
    pushUniqueQuestion(
      questions,
      `いちばん止まっている「${primaryBlocker}」を、どこからほどきたいですか？`,
    )
  }

  if (recentMemory) {
    pushUniqueQuestion(
      questions,
      `前回メモした「${recentMemory}」の続きで、今どこを整理したいですか？`,
    )
  }

  if (goalText) {
    pushUniqueQuestion(
      questions,
      `「${goalText}」のために、今いちばん優先したい一歩は何ですか？`,
    )
  }

  for (const fallbackQuestion of FALLBACK_SUGGESTED_QUESTIONS) {
    pushUniqueQuestion(questions, fallbackQuestion)
  }

  return questions.slice(0, 3)
}

export const TEST_ONLY = {
  FALLBACK_SUGGESTED_QUESTIONS,
}
