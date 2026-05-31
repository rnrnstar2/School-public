/**
 * @deprecated Use lesson-completion-v2.ts instead. This file uses localStorage only.
 * Retained for backward compatibility with tests. Will be removed in next cleanup.
 */

export const LESSON_COMPLETION_STORAGE_PREFIX = 'school:lesson-completed:'

const LESSON_COMPLETION_EVENT = 'school:lesson-completion-updated'

function buildLessonCompletionStorageKey(lessonId: string) {
  return `${LESSON_COMPLETION_STORAGE_PREFIX}${lessonId}`
}

export function isLessonCompletedLocally(lessonId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(buildLessonCompletionStorageKey(lessonId)) === '1'
}

export function markLessonCompletedLocally(lessonId: string): void {
  if (typeof window === 'undefined' || !lessonId.trim()) {
    return
  }

  window.localStorage.setItem(buildLessonCompletionStorageKey(lessonId), '1')
  window.dispatchEvent(
    new CustomEvent(LESSON_COMPLETION_EVENT, {
      detail: { lessonId },
    })
  )
}

export function readLocallyCompletedLessonIds(lessonIds?: string[]): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  const candidateIds = lessonIds ? new Set(lessonIds.map((lessonId) => lessonId.trim()).filter(Boolean)) : null
  const completedLessonIds = new Set<string>()

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (!key?.startsWith(LESSON_COMPLETION_STORAGE_PREFIX)) {
      continue
    }

    if (window.localStorage.getItem(key) !== '1') {
      continue
    }

    const lessonId = key.slice(LESSON_COMPLETION_STORAGE_PREFIX.length).trim()

    if (!lessonId || (candidateIds && !candidateIds.has(lessonId))) {
      continue
    }

    completedLessonIds.add(lessonId)
  }

  return Array.from(completedLessonIds)
}

export function subscribeToLessonCompletionChanges(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCompletionUpdate = () => listener()
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(LESSON_COMPLETION_STORAGE_PREFIX)) {
      listener()
    }
  }

  window.addEventListener(LESSON_COMPLETION_EVENT, handleCompletionUpdate)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(LESSON_COMPLETION_EVENT, handleCompletionUpdate)
    window.removeEventListener('storage', handleStorage)
  }
}

export function filterIncompleteLessons<T extends { lessonId: string }>(
  lessons: T[],
  completedLessonIds: Set<string>
): T[] {
  return lessons.filter((lesson) => !completedLessonIds.has(lesson.lessonId))
}

export function resolveRecommendedLessonId<T extends { lessonId: string }>(
  preferredLessonId: string | null | undefined,
  relevantLessons: T[],
  availableLessons: T[],
  completedLessonIds: Set<string>
): string | null {
  if (preferredLessonId && !completedLessonIds.has(preferredLessonId)) {
    return preferredLessonId
  }

  return (
    filterIncompleteLessons(relevantLessons, completedLessonIds)[0]?.lessonId
    ?? filterIncompleteLessons(availableLessons, completedLessonIds)[0]?.lessonId
    ?? null
  )
}
