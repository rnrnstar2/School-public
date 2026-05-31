export interface LessonMarkdownSource {
  title: string
  moduleTitle?: string
  summary: string
  promise: string
  whyThisMatters?: string
  howToDo?: string
  commonBlockers?: string
  confirmationMethod?: string
  estimatedMinutes?: number
  primaryOutcome?: string
  outputs?: string[]
  searchTerms?: string[]
  content?: string
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function splitSentences(value?: string) {
  if (!value) return []

  return value
    .split(/\n+|(?<=[。.!?！？])\s*/)
    .map((item) => compactText(item.replace(/^[0-9①②③④⑤⑥⑦⑧⑨⑩]+[.)]?\s*/, '')))
    .filter(Boolean)
}

function buildMarkdownList(items: string[]) {
  return items.map((item) => `- ${compactText(item)}`).join('\n')
}

function buildMarkdownOrderedList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${compactText(item)}`).join('\n')
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function ensureTopLevelHeading(content: string, title: string) {
  const trimmed = content.trim()
  return trimmed.startsWith('# ')
    ? trimmed
    : `# ${title}\n\n${trimmed}`
}

export function buildLessonMarkdownContent(lesson: LessonMarkdownSource) {
  if (lesson.content?.trim()) {
    return ensureTopLevelHeading(lesson.content, lesson.title)
  }

  const outputs = unique((lesson.outputs ?? []).map(compactText)).filter(Boolean)
  const progressSteps = splitSentences(lesson.howToDo)
  const blockers = splitSentences(lesson.commonBlockers)
  const confirmationChecks = splitSentences(lesson.confirmationMethod)
  const searchTerms = unique((lesson.searchTerms ?? []).map(compactText)).slice(0, 5)

  const fallbackSteps = unique([
    progressSteps[0] ?? lesson.summary,
    outputs.length > 0 ? `${outputs.join('、')} を作業結果として残します。` : '',
    confirmationChecks[0] ?? lesson.promise,
  ]).filter(Boolean)

  const promptExample = [
    '```text',
    `今は「${lesson.title}」を進めています。`,
    `目的: ${compactText(lesson.promise)}`,
    `現状: ${compactText(lesson.summary)}`,
    outputs.length > 0 ? `今回残したい成果物: ${outputs.join('、')}` : '',
    '次の一手を 3 ステップで提案し、確認ポイントも添えてください。',
    '```',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `# ${lesson.title}`,
    compactText(lesson.summary),
    `## このレッスンのゴール\n${compactText(lesson.promise)}`,
    [
      '## 先に把握しておくこと',
      lesson.moduleTitle ? `- モジュール: **${lesson.moduleTitle}**` : '',
      lesson.estimatedMinutes ? `- 想定時間: **${lesson.estimatedMinutes} 分**` : '',
      lesson.primaryOutcome ? `- 到達したい状態: ${compactText(lesson.primaryOutcome)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    lesson.whyThisMatters ? `## なぜ今やるのか\n${compactText(lesson.whyThisMatters)}` : '',
    `## 進め方\n${buildMarkdownOrderedList(progressSteps.length > 0 ? progressSteps : fallbackSteps)}`,
    outputs.length > 0 ? `## このレッスンで残すもの\n${buildMarkdownList(outputs)}` : '',
    blockers.length > 0 ? `## 詰まりやすいポイント\n${buildMarkdownList(blockers)}` : '',
    `## AI への依頼例\n${promptExample}`,
    confirmationChecks.length > 0 ? `## 完了チェック\n${buildMarkdownList(confirmationChecks)}` : '',
    searchTerms.length > 0 ? `## 関連キーワード\n${buildMarkdownList(searchTerms.map((term) => `\`${term}\``))}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function withGeneratedLessonContent<T extends LessonMarkdownSource & { content?: string }>(lesson: T): T {
  return {
    ...lesson,
    content: buildLessonMarkdownContent(lesson),
  }
}
