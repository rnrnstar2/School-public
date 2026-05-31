type LessonBodyFallbackSource = {
  content?: string | null
  summary?: string | null
  whyThisMatters?: string | null
  howToDo?: string | null
  commonBlockers?: string | null
  confirmationMethod?: string | null
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildLessonBodyFallback(source: LessonBodyFallbackSource | null | undefined) {
  if (!source) {
    return null
  }

  const explicitContent = trimOrNull(source.content)
  if (explicitContent) {
    return explicitContent
  }

  const sections = [
    trimOrNull(source.summary),
    trimOrNull(source.whyThisMatters),
    trimOrNull(source.howToDo),
    trimOrNull(source.commonBlockers),
    trimOrNull(source.confirmationMethod),
  ].filter((section): section is string => Boolean(section))

  return sections.length > 0 ? sections.join('\n\n') : null
}

export function resolveLessonBodyContent({
  primaryContent,
  fallbackSource,
}: {
  primaryContent?: string | null
  fallbackSource?: LessonBodyFallbackSource | null
}) {
  return trimOrNull(primaryContent) ?? buildLessonBodyFallback(fallbackSource)
}
