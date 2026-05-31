export const REQUIRED_AI_LESSON_TAGS = ['ai-tool', 'ai-topic', 'ai-adjacent'] as const

export const LESSON_AI_COMPLIANCE_MESSAGE =
  'AIタグが必要です。ai-tool / ai-topic / ai-adjacent のいずれかを追加してください。'

type LessonTagValue =
  | string
  | {
      slug?: unknown
      value?: unknown
      id?: unknown
      name?: unknown
    }

export interface LessonAiTaggable {
  tags?: readonly LessonTagValue[] | null
  content_tags?: readonly LessonTagValue[] | null
}

export interface LessonAiComplianceResult {
  valid: boolean
  matchedTags: (typeof REQUIRED_AI_LESSON_TAGS)[number][]
  normalizedTags: string[]
  message: string | null
}

function normalizeTagValue(tag: LessonTagValue | null | undefined): string | null {
  if (typeof tag === 'string') {
    const normalized = tag.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
  }

  if (!tag || typeof tag !== 'object') {
    return null
  }

  for (const candidate of [tag.slug, tag.value, tag.id, tag.name]) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase()
      if (normalized.length > 0) {
        return normalized
      }
    }
  }

  return null
}

export function validateLessonAiCompliance(lesson: LessonAiTaggable): LessonAiComplianceResult {
  const normalizedTags = Array.from(
    new Set(
      [...(lesson.content_tags ?? []), ...(lesson.tags ?? [])]
        .map((tag) => normalizeTagValue(tag))
        .filter((tag): tag is string => tag !== null),
    ),
  )

  const matchedTags = REQUIRED_AI_LESSON_TAGS.filter((tag) => normalizedTags.includes(tag))

  return {
    valid: matchedTags.length > 0,
    matchedTags,
    normalizedTags,
    message: matchedTags.length > 0 ? null : LESSON_AI_COMPLIANCE_MESSAGE,
  }
}
