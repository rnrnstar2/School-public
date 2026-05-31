/**
 * TODO(post-W1-B): This endpoint has no live caller after the planner-dashboard
 * removal. It's retained for future welcome-back / resume UX. If nothing
 * consumes it by mid-2026, consider deleting along with the E2E mocks in
 * `e2e/helpers.ts`, `e2e/track-helpers.ts`, `e2e/mvp-acceptance.spec.ts`, and
 * `e2e/streaming-chat.spec.ts`.
 */
import { createClient } from '@/lib/supabase/server'
import {
  getLearnerProfile,
  getLearnerState,
  getMentorMemories,
  getLessonFeedbackSummary,
} from '@/lib/learner-models'
import { getRecentLessonChatSummaries } from '@/lib/supabase/lesson-chat'
import { getCompiledPlanRecord } from '@/lib/compiled-plans'
import { resolveNextAction } from '@/lib/planner/goal-first'
import { getTaskProgressByPlan, toTaskProgressRecord } from '@/lib/supabase/task-progress'
import { buildUnderstandingProfile } from '@/lib/planner/resume-personalization'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'learner-resume', RL_READ)
  if (rlResponse) return rlResponse

  const client = await createClient()

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  const [
    profileResult,
    stateResult,
    memoriesResult,
    feedbackResult,
    compiledPlanRecord,
    chatSummariesResult,
  ] = await Promise.all([
    getLearnerProfile(client),
    getLearnerState(client),
    getMentorMemories(10, client),
    getLessonFeedbackSummary(client),
    // P0-1: migrated from legacy `plans` table to canonical `compiled_plans`
    // so /api/learner/resume now returns the same plan /plan renders.
    getCompiledPlanRecord({ userId: user.id, status: 'active', client }),
    getRecentLessonChatSummaries(5, client),
  ])

  // Shape preserved for callers (planner-dashboard reads `plan.id` + `plan.goal`).
  // Old legacy fields (title, summary, is_active, version, parent_plan_id,
  // created_at, updated_at) are mapped from the compiled_plans record.
  const plan = compiledPlanRecord
    ? {
        id: compiledPlanRecord.planId,
        user_id: user.id,
        title: compiledPlanRecord.goal,
        goal: compiledPlanRecord.goal,
        summary: compiledPlanRecord.rationale,
        is_active: compiledPlanRecord.status === 'active',
        version: 1,
        parent_plan_id: compiledPlanRecord.parentPlanId,
        created_at: compiledPlanRecord.createdAt ?? new Date(0).toISOString(),
        updated_at: compiledPlanRecord.updatedAt ?? new Date(0).toISOString(),
      }
    : null

  let taskProgress: Record<string, {
    status: string
    do?: string
    learn?: string
    why?: string
    relevantLessonIds?: string[]
    updatedAt: string
  }> = {}

  if (plan) {
    const progressResult = await getTaskProgressByPlan({ client, planId: plan.id })
    if (progressResult.data) {
      taskProgress = toTaskProgressRecord(progressResult.data)
    }
  }

  // Derive nextAction from compiled atom plan so resume callers can inspect
  // the learner's current "next step" without recompiling themselves.
  const nextAction = compiledPlanRecord
    ? resolveNextAction(
        compiledPlanRecord.plan,
        compiledPlanRecord.plan.steps
          .filter((step) => step.completedAt)
          .map((step) => step.atomId),
      )
    : null

  const learnerState = stateResult.data ?? null
  const mentorMemories = memoriesResult.data ?? []
  const feedbackEntries = feedbackResult.data ?? []

  const understanding = buildUnderstandingProfile({
    learnerState,
    mentorMemories,
    feedbackEntries,
    taskProgress,
  })

  return cachedJsonResponse(
    {
      profile: profileResult.data ?? null,
      state: learnerState,
      mentorMemories,
      chatSummaries: chatSummariesResult.data ?? [],
      feedbackSummary: feedbackEntries,
      plan,
      atomPlan: compiledPlanRecord?.plan ?? null,
      nextAction,
      taskProgress,
      understanding,
    },
    { maxAge: 30, swr: 120 },
    request,
  )
}
