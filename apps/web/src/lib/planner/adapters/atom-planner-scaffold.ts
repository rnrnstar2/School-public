import { buildPlannerHearingPayload } from '@/lib/planner/hearing'
import { buildAtomPlanFromGoalCached, normalizeGoal } from '@/lib/planner/goal-first'
import { atomPlanToContinuationPlan } from '@/lib/planner/atom-plan-adapter'
import { detectPlannerIntent, normalizePlannerGoal } from '@/lib/planner/intent'
import type {
  PlannerContinuationPlan,
  PlannerHearingSummaryEntry,
  PlannerMentorWorkspace,
  PlannerRequest,
  PlannerTrackPreview,
} from '@/lib/planner/types'

const TRACK_COPY: Record<string, { label: string; headline: string; summary: string; targetStack: string[] }> = {
  web: {
    label: 'Web制作',
    headline: 'AI を使いながら公開できる Web サイトを形にします。',
    summary: '現在の MVP では Web 制作の atom plan を最も厚くサポートしています。',
    targetStack: ['Next.js', 'Vercel', 'Supabase', 'Claude Code'],
  },
}

export interface AtomPlannerScaffold {
  continuation?: PlannerContinuationPlan
  matchedIntent: string
  mentorWorkspace?: PlannerMentorWorkspace
  normalizedGoal: string
  recommendedTrack?: PlannerTrackPreview
  supported: boolean
  supportMessage: string
  userFacingGoal: string
}

function buildFallbackWebContinuation(goal: string): PlannerContinuationPlan {
  return {
    kind: 'inline-plan',
    title: `「${goal.trim() || 'Webサイトを公開する'}」学習プラン`,
    summary: 'Web 制作の atom catalog を読み込めないため、最低限のフォールバック手順で案内します。',
    ctaLabel: 'このプランで進める',
    steps: [
      {
        id: 'scope-goal',
        title: '作りたいサイトの目的を言語化する',
        description: '誰向けに何を公開するサイトかを 1 文で整理します。',
        outcome: '公開するサイトの目的が 1 文で説明できる',
        purpose: '最初の実装対象を迷わず決めるための準備です。',
        completionCriteria: 'サイトの目的、主要導線、最初の公開範囲が書き出されていること。',
        artifacts: ['サイトの一言説明'],
        requirement: 'required',
        estimateMinutes: 20,
        milestoneId: 'milestone-001',
        lessonRefs: [
          {
            lessonId: 'atom.web-builder.choose-project-goal',
            title: '作りたいサイトの目的を決める',
            summary: '誰に何を届けるサイトかを最初に固めます。',
            estimatedMinutes: 20,
            moduleTitle: '企画整理',
            whyNow: '最初の実装対象を絞るために必要です。',
          },
        ],
      },
    ],
    milestones: [
      {
        id: 'milestone-001',
        title: '企画整理',
        description: '最初に公開する範囲を言語化します。',
        artifactGoal: 'サイトの一言説明',
        evidenceRule: 'サイトの目的と MVP 範囲を説明できる状態にする',
        steps: [],
      },
    ],
  }
}

export function buildHearingEntries(request: PlannerRequest) {
  const hearing = request.hearing

  if (!hearing) {
    return []
  }

  const entries: PlannerHearingSummaryEntry[] = [
    { id: 'experience', label: '経験', value: hearing.experience },
    { id: 'purpose', label: '目的', value: hearing.purpose },
    { id: 'existingMaterials', label: '既存素材', value: hearing.existingMaterials },
    { id: 'operatingSystem', label: 'OS', value: hearing.operatingSystem },
    { id: 'localWorkCapability', label: 'ローカル作業', value: hearing.localWorkCapability },
    { id: 'cliFamiliarity', label: 'CLI 慣れ', value: hearing.cliFamiliarity },
    { id: 'aiTools', label: 'AI ツール', value: hearing.aiTools },
  ]

  return entries.filter((entry) => entry.value?.trim())
}

export function formatHearingSummary(request: PlannerRequest) {
  const hearingEntries = buildHearingEntries(request)

  if (!hearingEntries.length) {
    return ''
  }

  return `ヒアリングでは ${hearingEntries
    .slice(0, 3)
    .map((entry) => `${entry.label}は「${entry.value}」`)
    .join('、')} と把握しています。`
}

function buildRecommendedTrack(intentId: string, continuation: PlannerContinuationPlan): PlannerTrackPreview | undefined {
  const copy = TRACK_COPY[intentId]

  if (!copy) {
    return undefined
  }

  return {
    trackId: intentId,
    trackLabel: copy.label,
    headline: copy.headline,
    summary: copy.summary,
    promise: continuation.summary,
    targetStack: copy.targetStack,
    modules: continuation.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      outcome: step.outcome,
      milestoneIds: step.milestoneId ? [step.milestoneId] : [],
    })),
    milestones: continuation.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      evidence: [milestone.evidenceRule],
    })),
    starterLessons: continuation.steps.slice(0, 3).flatMap((step) =>
      step.lessonRefs.map((lesson) => ({
        id: lesson.lessonId,
        title: lesson.title,
        trackId: intentId,
        moduleId: step.id,
        milestoneId: step.milestoneId ?? `milestone-${step.id}`,
        version: 1,
        status: 'published' as const,
        summary: lesson.summary,
        promise: lesson.whyNow ?? lesson.summary,
        difficultyLevel: 'beginner',
        skillLevel: {
          min: 'beginner' as const,
          recommended: 'beginner' as const,
          max: 'intermediate' as const,
        },
        estimatedMinutes: lesson.estimatedMinutes,
        lessonType: 'build' as const,
        deliveryMode: 'guided' as const,
        moduleTitle: lesson.moduleTitle,
        primaryOutcome: lesson.title,
        outputs: [],
        prerequisiteIds: [],
        recommendedBeforeIds: [],
        mutuallyReinforcingIds: [],
        dependencies: [],
        unlocks: [],
        stack: {
          frameworks: [],
          backend: [],
          database: [],
          styling: [],
          ui: [],
          hosting: [],
          tooling: [],
        },
        personaTags: [],
        goalTags: [],
        capabilityTags: [],
        blockerTags: [],
        contentTypes: [],
        searchTerms: [],
        searchMetadata: {
          locale: 'ja' as const,
          tags: [],
          searchTerms: [],
          searchText: `${lesson.title} ${lesson.summary}`.trim(),
        },
        selectionMetadata: {
          sequencingModes: [],
          projectTypes: [],
          canSkipWhen: [],
          evidenceSignals: [],
        },
      })),
    ),
    totalLessons: continuation.steps.length,
  }
}

function buildMentorWorkspace(goal: string, continuation: PlannerContinuationPlan, request: PlannerRequest): PlannerMentorWorkspace {
  const firstMilestone = continuation.milestones[0]
  const firstStep = continuation.steps[0]
  const relevantLessons = firstStep?.lessonRefs ?? []

  return {
    goalSummary: goal.trim() || continuation.title,
    currentMilestone: {
      id: firstMilestone?.id ?? 'milestone-001',
      title: firstMilestone?.title ?? '最初のマイルストーン',
      description: firstMilestone?.description ?? '',
      evidence: [firstMilestone?.evidenceRule ?? '最初の atom を完了する'],
    },
    currentTask: {
      id: firstStep?.id ?? 'step-001',
      title: firstStep?.title ?? '最初のステップ',
      do: firstStep?.description ?? goal,
      learn: relevantLessons[0]?.summary ?? firstStep?.description ?? '',
      why: firstStep?.outcome ?? continuation.summary,
      outcome: firstStep?.outcome ?? continuation.summary,
      lessonRefs: relevantLessons,
    },
    relevantLessons,
    toolRecommendation: {
      name: TRACK_COPY.web.targetStack[0],
      reason: '現在の atom plan で最初の実装に入りやすい組み合わせです。',
      usageNote: TRACK_COPY.web.targetStack.join(' / '),
    },
    hearingSummary: buildHearingEntries(request),
  }
}

export async function buildAtomPlannerScaffold(request: PlannerRequest): Promise<AtomPlannerScaffold> {
  const normalizedGoal = normalizePlannerGoal(request.goal)
  const matchedIntent = detectPlannerIntent(normalizedGoal)
  const hearingPayload = buildPlannerHearingPayload(request.goal, request.hearing ?? {}, request.hearingInsights)
  // Route through the cached wrapper so the HEARING/preview flow participates
  // in the same compiled_plans cache as the authenticated routes. PlannerRequest
  // doesn't carry a userId, so this wrapper will always fall through to a fresh
  // build — but keeping a single call site means any future migration that
  // threads userId here will automatically benefit from the cache.
  const cachedResult = await buildAtomPlanFromGoalCached({
    goal: request.goal,
    learnerState: {
      skillLevel: hearingPayload.state.skillLevel,
      blockers: hearingPayload.state.blockers,
      signals: hearingPayload.state.signals,
    },
  })
  const atomPlan = cachedResult.plan
  const supportStatus = normalizeGoal(request.goal).supportStatus

  if (supportStatus === 'coming-soon') {
    return {
      matchedIntent,
      normalizedGoal,
      supported: false,
      supportMessage: atomPlan.rationale,
      userFacingGoal: request.goal.trim(),
    }
  }

  const continuation =
    atomPlan.steps.length > 0
      ? atomPlanToContinuationPlan(atomPlan)
      : matchedIntent === 'web'
        ? buildFallbackWebContinuation(request.goal)
        : null

  if (!continuation) {
    return {
      matchedIntent,
      normalizedGoal,
      supported: false,
      supportMessage: atomPlan.rationale,
      userFacingGoal: request.goal.trim(),
    }
  }

  const recommendedTrack = buildRecommendedTrack(matchedIntent, continuation)

  return {
    continuation,
    matchedIntent,
    mentorWorkspace: buildMentorWorkspace(request.goal, continuation, request),
    normalizedGoal,
    recommendedTrack,
    supported: true,
    supportMessage: continuation.summary,
    userFacingGoal: request.goal.trim(),
  }
}
