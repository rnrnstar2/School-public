import type {
  PlannerBlockedSuggestion,
  PlannerContinuationStep,
  PlannerCurrentTask,
  PlannerHearingAnswers,
  PlannerLessonReference,
  PlannerResolvedTaskState,
  PlannerSupplementarySuggestion,
  PlannerTaskLessonConnection,
  PlannerTaskLessonConnectionId,
  PlannerTaskProgressRecord,
} from '@/lib/planner/types'
import type { LearnerState, LessonFeedback, MentorMemory } from '@/types'
import {
  resolveDesiredDifficulty,
  shouldPrioritizeBlockerResolution,
  type LearnerUnderstandingProfile,
} from '@/lib/planner/resume-personalization'

interface PlannerResumeContext {
  learnerState?: LearnerState | null
  mentorMemory?: MentorMemory | null
  understanding?: LearnerUnderstandingProfile | null
  recentFeedback?: LessonFeedback[] | null
}

type TaskFacetScore = Record<PlannerTaskLessonConnectionId, number>

function normalizeText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function extractTokens(value: string) {
  return Array.from(new Set(normalizeText(value).match(/[a-z0-9][a-z0-9-]*|[ぁ-んァ-ヶ一-龠]{2,}/g) ?? []))
}

function countMatches(tokens: string[], text: string) {
  if (tokens.length === 0 || !text) {
    return 0
  }

  return tokens.reduce((count, token) => (text.includes(token) ? count + 1 : count), 0)
}

function buildLessonSearchText(lesson: PlannerLessonReference) {
  return normalizeText(
    [
      lesson.title,
      lesson.summary,
      lesson.moduleTitle,
      lesson.whyNow,
      lesson.recommendationReason,
    ].join(' '),
  )
}

function buildCurrentTask(step: PlannerContinuationStep, relevantLessons: PlannerLessonReference[], progress?: PlannerTaskProgressRecord) {
  const firstLesson = relevantLessons[0] ?? step.lessonRefs[0]
  const doSummary = step.description.split('。').map((sentence) => sentence.trim()).find(Boolean) ?? step.description
  const learnSummary = firstLesson
    ? `${firstLesson.moduleTitle} のレッスンを使って、${firstLesson.title} を進めます。`
    : 'このタスクに対応するレッスンを確認しながら進めます。'

  return {
    id: step.id,
    title: progress?.title?.trim() || step.title,
    do: progress?.do?.trim() || doSummary,
    learn: progress?.learn?.trim() || learnSummary,
    why: progress?.why?.trim() || step.outcome,
    outcome: step.outcome,
    lessonRefs: relevantLessons,
  } satisfies PlannerCurrentTask
}

function buildResumeContextText(context?: PlannerResumeContext) {
  if (!context) {
    return ''
  }

  return normalizeText(
    [
      context.learnerState?.target_outcome,
      context.learnerState?.existing_materials,
      ...(context.learnerState?.blockers ?? []),
      context.mentorMemory?.title,
      ...(context.mentorMemory?.bullets ?? []),
      ...(context.understanding?.weaknesses ?? []),
      ...(context.understanding?.commonBlockers ?? []),
    ].join(' '),
  )
}

function buildFacetContext(
  facet: PlannerTaskLessonConnectionId,
  currentTask: PlannerCurrentTask,
  step: PlannerContinuationStep,
  hearing?: PlannerHearingAnswers,
  progress?: PlannerTaskProgressRecord,
) {
  const purpose = hearing?.purpose?.trim()

  if (facet === 'do') {
    return progress?.status === 'blocked'
      ? 'いま詰まっている作業をそのまま前に進めるための lesson です。'
      : `いま着手する作業を細かい実装単位へ落とすため、${step.title} に直結する lesson を寄せています。`
  }

  if (facet === 'learn') {
    return purpose
      ? `「${purpose}」に必要な理解へ短く到達するため、今の task で吸収すべき lesson を優先しています。`
      : 'この task を進めるときに先に理解しておくと止まりにくい lesson を優先しています。'
  }

  return `${currentTask.why} を満たすために、いま学ぶ意味がはっきりしている lesson を前に出しています。`
}

function scoreLessonForFacet(
  facet: PlannerTaskLessonConnectionId,
  lesson: PlannerLessonReference,
  searchText: string,
  step: PlannerContinuationStep,
  currentTask: PlannerCurrentTask,
  hearing?: PlannerHearingAnswers,
  progress?: PlannerTaskProgressRecord,
  context?: PlannerResumeContext,
) {
  const facetText = currentTask[facet]
  const facetTokens = extractTokens(facetText)
  const stepTokens = extractTokens(`${step.title} ${step.description} ${step.purpose} ${step.outcome}`)
  const hearingTokens = extractTokens(
    `${hearing?.purpose ?? ''} ${hearing?.existingMaterials ?? ''} ${hearing?.experience ?? ''}`,
  )
  const resumeTokens = extractTokens(buildResumeContextText(context))

  let score = 0
  score += countMatches(facetTokens, searchText) * 4
  score += countMatches(stepTokens, searchText) * 2
  score += countMatches(hearingTokens, searchText)
  score += countMatches(resumeTokens, searchText) * 2

  if (progress?.relevantLessonIds?.includes(lesson.lessonId)) {
    score += 24
  }

  if (step.lessonRefs.findIndex((item) => item.lessonId === lesson.lessonId) === 0) {
    score += 3
  }

  if (facet === 'do' && lesson.estimatedMinutes <= 30) {
    score += 4
  }

  if (facet === 'learn' && lesson.summary.trim()) {
    score += 3
  }

  if (facet === 'why' && lesson.whyNow?.trim()) {
    score += 4
  }

  const blockers = context?.learnerState?.blockers ?? []
  if (blockers.length > 0) {
    const blockerTokens = extractTokens(blockers.join(' '))
    score += countMatches(blockerTokens, searchText) * 3
  }

  const desiredDifficulty = resolveDesiredDifficulty(context?.understanding ?? null)
  if (desiredDifficulty === 'easier' && lesson.estimatedMinutes <= 25) {
    score += 6
  }
  if (desiredDifficulty === 'harder' && lesson.estimatedMinutes >= 35) {
    score += 4
  }

  if (shouldPrioritizeBlockerResolution(context?.understanding ?? null)) {
    const blockerTokens = extractTokens((context?.understanding?.commonBlockers ?? []).join(' '))
    score += countMatches(blockerTokens, searchText) * 4
  }

  const weaknesses = context?.understanding?.weaknesses ?? []
  if (weaknesses.length > 0) {
    const weaknessTokens = extractTokens(weaknesses.join(' '))
    score += countMatches(weaknessTokens, searchText) * 2
  }

  return score
}

function buildRecommendationReason(
  lesson: PlannerLessonReference,
  progress?: PlannerTaskProgressRecord,
  context?: PlannerResumeContext,
): string | undefined {
  if (lesson.recommendationReason?.trim()) {
    return lesson.recommendationReason
  }

  const searchText = buildLessonSearchText(lesson)

  if (progress?.status === 'blocked') {
    return '現在の詰まりをほどくために優先して確認したいレッスンです'
  }

  const weaknesses = context?.understanding?.weaknesses ?? []
  if (weaknesses.length > 0 && countMatches(extractTokens(weaknesses.join(' ')), searchText) > 0) {
    return '苦手分野を補強するために関連度の高いレッスンです'
  }

  return lesson.summary ? 'このタスクに直結する内容から優先しています' : undefined
}

function buildBlockedSuggestions(
  allLessons: PlannerLessonReference[],
  progress?: PlannerTaskProgressRecord,
  context?: PlannerResumeContext,
): PlannerBlockedSuggestion[] {
  if (progress?.status !== 'blocked') return []

  const blockers = extractTokens(
    [
      ...(context?.learnerState?.blockers ?? []),
      ...(context?.understanding?.commonBlockers ?? []),
    ].join(' '),
  )

  return allLessons
    .map((lesson) => {
      const searchText = buildLessonSearchText(lesson)
      const blockerScore = countMatches(blockers, searchText)

      return {
        lesson,
        score: blockerScore + (lesson.estimatedMinutes <= 30 ? 1 : 0),
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => ({
      lessonId: entry.lesson.lessonId,
      title: entry.lesson.title,
      summary: entry.lesson.summary,
      estimatedMinutes: entry.lesson.estimatedMinutes,
      moduleTitle: entry.lesson.moduleTitle,
      reason: '現在の詰まりに関連するレッスンです',
    }))
}

function buildSupplementarySuggestions(
  allLessons: PlannerLessonReference[],
  context?: PlannerResumeContext,
): PlannerSupplementarySuggestion[] {
  const difficultLessonIds = new Set(
    (context?.recentFeedback ?? [])
      .filter((feedback) => feedback.difficulty_rating >= 4)
      .map((feedback) => feedback.lesson_id),
  )

  if (difficultLessonIds.size === 0) {
    return []
  }

  return allLessons
    .filter((lesson) => !difficultLessonIds.has(lesson.lessonId))
    .slice(0, 3)
    .map((lesson) => ({
      lessonId: lesson.lessonId,
      title: lesson.title,
      summary: lesson.summary,
      estimatedMinutes: lesson.estimatedMinutes,
      moduleTitle: lesson.moduleTitle,
      reason: '負荷が高かった直近タスクを補足するレッスンです',
      triggerLessonId: Array.from(difficultLessonIds)[0] ?? lesson.lessonId,
    }))
}

export function resolveTaskLessonState(
  step: PlannerContinuationStep,
  hearing?: PlannerHearingAnswers,
  progress?: PlannerTaskProgressRecord,
  context?: PlannerResumeContext,
): PlannerResolvedTaskState {
  const defaultLessons = step.lessonRefs.slice(0, 2)
  const explicitLessons =
    progress?.relevantLessonIds
      ?.map((lessonId) => step.lessonRefs.find((lesson) => lesson.lessonId === lessonId) ?? null)
      .filter((lesson): lesson is PlannerLessonReference => Boolean(lesson)) ?? []
  const seededLessons = explicitLessons.length > 0 ? explicitLessons : defaultLessons
  const seededTask = buildCurrentTask(step, seededLessons, progress)

  const rankedLessons = step.lessonRefs
    .map((lesson) => {
      const searchText = buildLessonSearchText(lesson)
      const facetScore = {
        do: scoreLessonForFacet('do', lesson, searchText, step, seededTask, hearing, progress, context),
        learn: scoreLessonForFacet('learn', lesson, searchText, step, seededTask, hearing, progress, context),
        why: scoreLessonForFacet('why', lesson, searchText, step, seededTask, hearing, progress, context),
      } satisfies TaskFacetScore

      return {
        lesson,
        facetScore,
        score: facetScore.do + facetScore.learn + facetScore.why,
      }
    })
    .sort((left, right) => right.score - left.score || left.lesson.estimatedMinutes - right.lesson.estimatedMinutes)

  const relevantLessons =
    explicitLessons.length > 0
      ? explicitLessons
      : rankedLessons.slice(0, Math.min(Math.max(step.lessonRefs.length, 1), 3)).map((item) => item.lesson)

  const lessonsWithReasons = relevantLessons.map((lesson) => ({
    ...lesson,
    recommendationReason: buildRecommendationReason(lesson, progress, context),
  }))

  const currentTask = buildCurrentTask(step, lessonsWithReasons, progress)
  const lessonConnections = (['do', 'learn', 'why'] as const).map((facet) => {
    const facetRanked = (explicitLessons.length > 0 ? rankedLessons.filter((item) => explicitLessons.includes(item.lesson)) : rankedLessons)
      .filter((item) => item.facetScore[facet] > 0)
      .sort((left, right) => right.facetScore[facet] - left.facetScore[facet] || right.score - left.score)

    const facetLessons = (facetRanked.length > 0 ? facetRanked : rankedLessons).slice(0, 2).map((item) => item.lesson)

    return {
      id: facet,
      label: facet === 'do' ? 'Do' : facet === 'learn' ? 'Learn' : 'Why',
      value: currentTask[facet],
      context: buildFacetContext(facet, currentTask, step, hearing, progress),
      lessonRefs: facetLessons,
    } satisfies PlannerTaskLessonConnection
  })

  return {
    currentTask: {
      ...currentTask,
      lessonRefs: lessonsWithReasons,
    },
    relevantLessons: lessonsWithReasons,
    lessonConnections,
    blockedSuggestions: buildBlockedSuggestions(step.lessonRefs, progress, context),
    supplementarySuggestions: buildSupplementarySuggestions(step.lessonRefs, context),
  }
}
