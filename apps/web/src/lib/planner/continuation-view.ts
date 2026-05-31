import { applyResumeSummaryToTask, buildPersonalizedMentorMemory, type PlannerResumeContext } from '@/lib/planner/resume-personalization'
import { resolveTaskLessonState } from '@/lib/planner/task-lessons'
import type {
  PlannerContinuationStep,
  PlannerHearingAnswers,
  PlannerHearingInsights,
  PlannerMentorWorkspace,
  PlannerResolvedTaskState,
  PlannerTaskProgressRecord,
  PlannerToolRecommendation,
} from '@/lib/planner/types'

function defaultResumeContext(context?: PlannerResumeContext): PlannerResumeContext {
  return context ?? {
    learnerState: null,
    mentorMemory: null,
  }
}

function buildToolRecommendation(): PlannerToolRecommendation {
  return {
    name: 'AI mentor',
    reason: '現在のタスクに合わせて atom を 1 つずつ進めます。',
    usageNote: '詰まったら今の atom 名とどこで止まったかをそのまま共有してください。',
  }
}

export function resolveContinuationStepTaskState(
  step: PlannerContinuationStep,
  hearing?: PlannerHearingAnswers,
  progress?: PlannerTaskProgressRecord,
  context?: PlannerResumeContext,
): PlannerResolvedTaskState {
  const taskState = resolveTaskLessonState(step, hearing, progress, context)
  const resumeContext = defaultResumeContext(context)

  return {
    currentTask: applyResumeSummaryToTask(
      {
        ...taskState.currentTask,
        lessonRefs: taskState.relevantLessons,
      },
      resumeContext,
    ),
    relevantLessons: taskState.relevantLessons,
    lessonConnections: taskState.lessonConnections,
    blockedSuggestions: taskState.blockedSuggestions,
    supplementarySuggestions: taskState.supplementarySuggestions,
  }
}

export function buildMentorWorkspaceFromContinuationStep(
  goal: string,
  step: PlannerContinuationStep,
  hearing?: PlannerHearingAnswers,
  _hearingInsights?: PlannerHearingInsights,
  context?: PlannerResumeContext,
): PlannerMentorWorkspace {
  const resumeContext = defaultResumeContext(context)
  const taskState = resolveContinuationStepTaskState(step, hearing, undefined, resumeContext)

  return {
    goalSummary: `「${goal.trim() || '学習を進めたい'}」に向けて、現在の atom を前に進める段階です。`,
    currentMilestone: {
      id: step.milestoneId ?? 'current-milestone',
      title: step.milestoneId ?? '現在のマイルストーン',
      description: step.description,
      evidence: [step.completionCriteria || step.outcome].filter(Boolean),
    },
    currentTask: taskState.currentTask,
    relevantLessons: taskState.relevantLessons,
    toolRecommendation: buildToolRecommendation(),
    mentorMemory: buildPersonalizedMentorMemory(goal, resumeContext),
    artifacts: (step.artifacts ?? []).map((artifact) => ({
      label: artifact,
      detail: `${step.title} の成果として残す想定です。`,
    })),
  }
}
