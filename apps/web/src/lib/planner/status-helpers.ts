import type { PlannerTaskProgressStatus } from '@/lib/planner/types'

export function getTaskStatusTone(status: PlannerTaskProgressStatus) {
  switch (status) {
    case 'in-progress':
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200'
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'on-hold':
      return 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200'
    case 'blocked':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200'
    case 'skipped':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-200'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
  }
}

export function isTaskFinished(status: PlannerTaskProgressStatus | undefined) {
  return status === 'completed' || status === 'skipped'
}

/**
 * A milestone is complete when all **required** steps are finished.
 * Optional steps that are skipped or not-started do not block completion.
 */
export function isMilestoneComplete(
  steps: Array<{ id: string; requirement: 'required' | 'optional' }>,
  taskProgress: Record<string, { status?: PlannerTaskProgressStatus }>,
) {
  const requiredSteps = steps.filter((s) => s.requirement === 'required')
  if (requiredSteps.length === 0) return false
  return requiredSteps.every((s) => isTaskFinished(taskProgress[s.id]?.status))
}

/** Count finished steps within a milestone (required + optional that are done). */
export function countFinishedSteps(
  steps: Array<{ id: string }>,
  taskProgress: Record<string, { status?: PlannerTaskProgressStatus }>,
) {
  return steps.filter((s) => isTaskFinished(taskProgress[s.id]?.status)).length
}

/** Count only required steps in a list. */
export function countRequiredSteps(
  steps: Array<{ requirement: 'required' | 'optional' }>,
) {
  return steps.filter((s) => s.requirement === 'required').length
}

export function getRequirementBadgeTone(requirement: 'required' | 'optional') {
  return requirement === 'required'
    ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200'
    : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200'
}

export interface TaskEditorState {
  title: string
  status: PlannerTaskProgressStatus
  do: string
  learn: string
  why: string
  relevantLessonIds: string[]
}

export interface TaskStatusOption {
  value: PlannerTaskProgressStatus
  label: string
  description: string
}
