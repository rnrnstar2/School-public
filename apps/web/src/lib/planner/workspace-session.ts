'use client'

import { defaultFallbackHearingTransport } from '@/lib/planner/hearing'
import { buildMentorWorkspaceFromContinuationStep, resolveContinuationStepTaskState } from '@/lib/planner/continuation-view'
import type {
  PlannerAdapterResult,
  PlannerContinuationStep,
  PlannerHearingSession,
  PlannerMentorSpaceMessage,
  PlannerMentorWorkspace,
  PlannerTaskProgressRecord,
  PlannerWorkspaceSnapshot,
} from '@/lib/planner/types'
import type { LearnerState, MentorMemory } from '@/types'
import { isTaskFinished } from '@/lib/planner/status-helpers'
import { deleteSyncedSnapshot, scheduleSyncToDB } from '@/lib/planner/workspace-sync'

export const PLANNER_GOAL_STORAGE_KEY = 'school:planner-goal-v1'
export const PLANNER_WORKSPACE_STORAGE_KEY = 'school:mentor-workspace-v2'

export function writePlannerGoalToStorage(goal: string) {
  if (typeof window === 'undefined') {
    return
  }

  const normalized = goal.trim()
  if (!normalized) {
    return
  }

  window.localStorage.setItem(PLANNER_GOAL_STORAGE_KEY, normalized)
}

export interface DerivedWorkspaceState {
  workspace: PlannerMentorWorkspace | null
  activeStep: PlannerContinuationStep | null
  nextStep: PlannerContinuationStep | null
  taskProgress: Record<string, PlannerTaskProgressRecord>
  completedCount: number
}

function buildWorkspaceStorageKey(goal: string) {
  return goal.trim().toLowerCase()
}

function parseWorkspaceStorage(): Record<string, PlannerWorkspaceSnapshot> {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(PLANNER_WORKSPACE_STORAGE_KEY)

  if (!raw) {
    return {}
  }

  try {
    return (JSON.parse(raw) as Record<string, PlannerWorkspaceSnapshot>) ?? {}
  } catch {
    return {}
  }
}

function writeWorkspaceStorage(store: Record<string, PlannerWorkspaceSnapshot>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PLANNER_WORKSPACE_STORAGE_KEY, JSON.stringify(store))
}

export function readWorkspaceSnapshot(goal: string): PlannerWorkspaceSnapshot | null {
  const store = parseWorkspaceStorage()
  const snapshot = store[buildWorkspaceStorageKey(goal)] ?? null

  if (!snapshot?.hearing) {
    return snapshot
  }

  return {
    ...snapshot,
    hearing: {
      answers: snapshot.hearing.answers ?? {},
      messages: snapshot.hearing.messages ?? [],
      lastQuestionId: snapshot.hearing.lastQuestionId ?? null,
      transport: snapshot.hearing.transport ?? defaultFallbackHearingTransport,
      completedAt: snapshot.hearing.completedAt ?? null,
    },
  }
}

export function writeWorkspaceSnapshot(snapshot: PlannerWorkspaceSnapshot) {
  writePlannerGoalToStorage(snapshot.goal)
  const store = parseWorkspaceStorage()
  store[buildWorkspaceStorageKey(snapshot.goal)] = snapshot
  writeWorkspaceStorage(store)
  scheduleSyncToDB(snapshot)
}

export function writeWorkspaceHearingSnapshot(goal: string, hearing: PlannerHearingSession, result: PlannerAdapterResult | null = null) {
  const currentSnapshot = readWorkspaceSnapshot(goal)

  writeWorkspaceSnapshot({
    goal,
    result: result === null ? null : currentSnapshot?.result ?? result,
    hearing,
    taskProgress: currentSnapshot?.taskProgress ?? {},
    selectedStepId: currentSnapshot?.selectedStepId ?? null,
    mentorMessages: currentSnapshot?.mentorMessages ?? [],
    savedAt: new Date().toISOString(),
  })
}

export function clearWorkspaceSnapshot(goal: string) {
  const store = parseWorkspaceStorage()
  delete store[buildWorkspaceStorageKey(goal)]
  writeWorkspaceStorage(store)
  deleteSyncedSnapshot(goal)
}

export function updateWorkspaceTaskProgress(goal: string, taskId: string, record: PlannerTaskProgressRecord) {
  const snapshot = readWorkspaceSnapshot(goal)

  if (!snapshot) {
    return null
  }

  const nextSnapshot: PlannerWorkspaceSnapshot = {
    ...snapshot,
    taskProgress: {
      ...snapshot.taskProgress,
      [taskId]: record,
    },
    savedAt: new Date().toISOString(),
  }

  writeWorkspaceSnapshot(nextSnapshot)
  return nextSnapshot
}

export function updateWorkspaceMentorSpace(goal: string, selectedStepId: string | null, mentorMessages: PlannerMentorSpaceMessage[]) {
  const snapshot = readWorkspaceSnapshot(goal)

  if (!snapshot) {
    return null
  }

  const nextSnapshot: PlannerWorkspaceSnapshot = {
    ...snapshot,
    selectedStepId,
    mentorMessages,
    savedAt: new Date().toISOString(),
  }

  writeWorkspaceSnapshot(nextSnapshot)
  return nextSnapshot
}

function findActiveStep(
  steps: PlannerContinuationStep[],
  taskProgress: Record<string, PlannerTaskProgressRecord>,
  fallbackId?: string,
  preferredId?: string | null
) {
  return (
    steps.find((step) => step.id === preferredId && !isTaskFinished(taskProgress[step.id]?.status)) ??
    steps.find((step) => !isTaskFinished(taskProgress[step.id]?.status)) ??
    steps.find((step) => step.id === preferredId) ??
    steps.find((step) => step.id === fallbackId) ??
    steps[steps.length - 1] ??
    null
  )
}

export function deriveWorkspaceState(
  goal: string,
  result: PlannerAdapterResult | null,
  taskProgress: Record<string, PlannerTaskProgressRecord>,
  selectedStepId?: string | null,
  learnerState?: LearnerState | null,
  mentorMemory?: MentorMemory | null
) {
  if (!result?.recommendation.mentorWorkspace) {
    return {
      workspace: null,
      activeStep: null,
      nextStep: null,
      taskProgress,
      completedCount: 0,
    } satisfies DerivedWorkspaceState
  }

  const continuationSteps = result.recommendation.continuation?.steps ?? []
  const activeStep = findActiveStep(
    continuationSteps,
    taskProgress,
    result.recommendation.mentorWorkspace.currentTask.id,
    selectedStepId ?? learnerState?.active_task_id
  )
  const workspace = activeStep
    ? (() => {
        const personalizationContext = {
          learnerState: learnerState ?? null,
          mentorMemory: mentorMemory ?? null,
        }
        const baseWorkspace = buildMentorWorkspaceFromContinuationStep(
          goal,
          activeStep,
          result.recommendation.hearing,
          result.recommendation.hearingInsights,
          personalizationContext
        )
        const taskState = resolveContinuationStepTaskState(
          activeStep,
          result.recommendation.hearing,
          taskProgress[activeStep.id],
          personalizationContext
        )

        return {
          ...baseWorkspace,
          currentTask: taskState.currentTask,
          relevantLessons: taskState.relevantLessons,
        }
      })()
    : result.recommendation.mentorWorkspace
  const activeIndex = activeStep ? continuationSteps.findIndex((step) => step.id === activeStep.id) : -1
  const nextStep = activeIndex >= 0 ? continuationSteps[activeIndex + 1] ?? null : null
  const completedCount = continuationSteps.filter((step) => taskProgress[step.id]?.status === 'completed').length

  return {
    workspace,
    activeStep,
    nextStep,
    taskProgress,
    completedCount,
  } satisfies DerivedWorkspaceState
}
