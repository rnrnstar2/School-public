import type { GoalHistory } from '@/types'

export type TrackStatus = 'learning' | 'graduated' | 'not-started'

export interface TrackProgressSummary {
  trackId: string
  label: string
  headline: string
  status: TrackStatus
  totalLessons: number
  completedLessons: number
  progressPercent: number
  completedModules: string[]
  totalModules: number
}

export interface SharedSkill {
  skill: string
  trackIds: string[]
  lessonIds: string[]
  completedLessonIds: string[]
}

export interface CrossTrackSkillAnalysis {
  sharedSkills: SharedSkill[]
  skippableLessonIds: string[]
}

export interface TrackRecommendation {
  trackId: string
  label: string
  headline: string
  score: number
  reasons: string[]
  transferableSkills: number
}

export interface CrossTrackTimelineEntry {
  goalId: string
  goal: string
  trackId: string | null
  trackLabel: string | null
  status: GoalHistory['status']
  startedAt: string
  endedAt: string | null
}

const TRACK_CATALOG = [
  {
    trackId: 'web',
    label: 'Web制作',
    headline: '公開できる Web サイトを AI と一緒に形にします。',
    totalLessons: 20,
    totalModules: 5,
  },
  {
    trackId: 'automation',
    label: '業務自動化',
    headline: '定型業務を少しずつ自動化して運用へつなげます。',
    totalLessons: 10,
    totalModules: 4,
  },
  {
    trackId: 'content',
    label: 'コンテンツ制作',
    headline: '記事・SNS・資料づくりを AI と一緒に前へ進めます。',
    totalLessons: 10,
    totalModules: 4,
  },
  {
    trackId: 'app',
    label: 'アプリ制作',
    headline: 'プロトタイプから公開までの流れを掴みます。',
    totalLessons: 10,
    totalModules: 4,
  },
] as const

function inferDomainSlugFromLessonId(lessonId: string) {
  const normalized = lessonId.trim().toLowerCase()

  if (normalized.includes('web-builder')) return 'web'
  if (normalized.includes('automation') || normalized.includes('automator')) return 'automation'
  if (normalized.includes('content')) return 'content'
  if (normalized.includes('app-builder') || normalized.includes('crm-builder') || normalized.includes('meal-planner')) return 'app'

  return null
}

function groupCompletedLessonsByTrack(completedLessonIds: string[]) {
  const grouped = new Map<string, string[]>()

  for (const lessonId of completedLessonIds) {
    const domainSlug = inferDomainSlugFromLessonId(lessonId)
    if (!domainSlug) continue

    const current = grouped.get(domainSlug) ?? []
    current.push(lessonId)
    grouped.set(domainSlug, current)
  }

  return grouped
}

export function computeTrackProgress(
  completedLessonIds: string[],
  graduatedTrackIds: string[],
  activeTrackId: string | null,
): TrackProgressSummary[] {
  const completedByTrack = groupCompletedLessonsByTrack(completedLessonIds)

  return TRACK_CATALOG.map((track) => {
    const completedLessons = completedByTrack.get(track.trackId)?.length ?? 0
    const progressPercent = track.totalLessons > 0
      ? Math.round((Math.min(completedLessons, track.totalLessons) / track.totalLessons) * 100)
      : 0

    let status: TrackStatus = 'not-started'
    if (graduatedTrackIds.includes(track.trackId)) {
      status = 'graduated'
    } else if (track.trackId === activeTrackId || completedLessons > 0) {
      status = 'learning'
    }

    return {
      trackId: track.trackId,
      label: track.label,
      headline: track.headline,
      status,
      totalLessons: track.totalLessons,
      completedLessons,
      progressPercent,
      completedModules: [],
      totalModules: track.totalModules,
    }
  })
}

export function analyzeCrossTrackSkills(
  completedLessonIds: string[],
): CrossTrackSkillAnalysis {
  const completedByTrack = groupCompletedLessonsByTrack(completedLessonIds)
  const sharedSkills: SharedSkill[] = []

  for (const [trackId, lessonIds] of completedByTrack) {
    sharedSkills.push({
      skill: `${trackId}-foundations`,
      trackIds: [trackId],
      lessonIds,
      completedLessonIds: lessonIds,
    })
  }

  return {
    sharedSkills,
    skippableLessonIds: [],
  }
}

export interface LearnerStrengthsWeaknesses {
  strengths: string[]
  weaknesses: string[]
}

export function recommendNextTracks(
  completedLessonIds: string[],
  activeTrackId: string | null,
  graduatedTrackIds: string[],
  learnerProfile?: LearnerStrengthsWeaknesses | null,
): TrackRecommendation[] {
  const completedByTrack = groupCompletedLessonsByTrack(completedLessonIds)
  const weaknessText = (learnerProfile?.weaknesses ?? []).join(' ').toLowerCase()

  return TRACK_CATALOG
    .filter((track) => track.trackId !== activeTrackId && !graduatedTrackIds.includes(track.trackId))
    .map((track) => {
      const transferableSkills = completedByTrack.size > 0 && !completedByTrack.has(track.trackId) ? 1 : 0
      const reasons: string[] = []
      let score = 50

      if (transferableSkills > 0) {
        score += 15
        reasons.push('いまの学習資産を横展開しやすい領域です')
      }

      if (weaknessText && track.label.toLowerCase().includes(weaknessText)) {
        score += 10
        reasons.push('苦手分野を補いやすい流れです')
      }

      if (reasons.length === 0) {
        reasons.push('次に広げる候補として扱いやすい領域です')
      }

      return {
        trackId: track.trackId,
        label: track.label,
        headline: track.headline,
        score,
        reasons,
        transferableSkills,
      }
    })
    .sort((left, right) => right.score - left.score)
}

export function buildCrossTrackTimeline(
  goals: GoalHistory[],
  trackIdByGoal: Record<string, string | null>,
): CrossTrackTimelineEntry[] {
  const trackLabelMap = new Map<string, string>(TRACK_CATALOG.map((track) => [track.trackId, track.label]))

  return [...goals]
    .sort((left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime())
    .map((goal) => {
      const trackId = trackIdByGoal[goal.id] ?? null

      return {
        goalId: goal.id,
        goal: goal.goal,
        trackId,
        trackLabel: trackId ? trackLabelMap.get(trackId) ?? null : null,
        status: goal.status,
        startedAt: goal.started_at,
        endedAt: goal.ended_at,
      }
    })
}
