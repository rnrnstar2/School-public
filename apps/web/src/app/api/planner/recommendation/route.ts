import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePlannerGoal } from '@/lib/planner/intent'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { recommendationSchema } from '@/lib/api/schemas'
import { captureServerEvent } from '@/lib/analytics/server'
import { createNotification } from '@/lib/notifications/create'
import { buildGoalFirstPlan, resolveNextAction } from '@/lib/planner/goal-first'
import { attachBridgeQuestionToNextAction } from '@/lib/planner/goal-first/bridge-question'
import type { LearnerProfile, LearnerState } from '@/types'

// ---------------------------------------------------------------------------
// Goal-first recommendation: uses buildGoalFirstPlan + resolveNextAction
// ---------------------------------------------------------------------------

async function handleRecommendation(
  request: Request,
  goal: string,
  rawGoal: string,
  client: SupabaseClient,
) {
  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }))
  const userId = user?.id

  if (!userId) {
    return jsonResponse(
      { error: 'auth_required', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  // Fetch learner profile and state from DB
  const [profileResult, stateResult, progressResult] = await Promise.all([
    client.from('learner_profile').select('*').eq('user_id', userId).maybeSingle(),
    client.from('learner_state').select('*').eq('user_id', userId).maybeSingle(),
    client.from('user_progress').select('lesson_id').eq('user_id', userId).eq('completed', true),
  ])

  const learnerProfile = (profileResult.data ?? {
    user_id: userId,
    experience_summary: null,
    operating_system: null,
    cli_familiarity: null,
    available_ai_tools: [],
    can_use_local_tools: null,
  }) as LearnerProfile

  const learnerState = (stateResult.data ?? {
    user_id: userId,
    skill_level: null,
    target_outcome: goal,
    existing_materials: null,
    blockers: [],
    active_track_id: null,
    is_first_visit: true,
  }) as LearnerState

  const completedLessonIds = (progressResult.data ?? [])
    .map((row) => (row as { lesson_id: string | null }).lesson_id)
    .filter((id): id is string => id !== null)

  // Build goal-first plan
  const plan = await buildGoalFirstPlan(goal, learnerProfile, learnerState, completedLessonIds, {
    client,
  })
  const nextAction = attachBridgeQuestionToNextAction(resolveNextAction(plan, []), {
    goalText: rawGoal.trim() || learnerState.target_outcome?.trim() || goal,
    experienceSummary: learnerProfile.experience_summary,
  })

  // Track plan generation event
  captureServerEvent({
    event: 'plan_generated',
    distinctId: userId,
    properties: {
      goal,
      step_count: plan.nodes.length,
      status: plan.nodes.length > 0 ? 'ok' : 'empty',
      planner: 'goal-first',
    },
  })

  // Send notification if plan includes lessons
  if (plan.nodes.length > 0) {
    createNotification({
      userId,
      type: 'lesson_recommendation',
      title: '新しい学習プランが作成されました',
      body: `「${goal}」に基づくプランが${plan.nodes.length}ステップで作成されました。`,
      link: '/plan',
    })
  }

  return jsonResponse(
    {
      plan,
      nextAction,
      planner: 'goal-first',
    },
    { headers: { 'Cache-Control': 'no-store' } },
    request,
  )
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'recommendation', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, recommendationSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const goal = normalizePlannerGoal(body?.goal ?? '')

  if (!goal) {
    return jsonResponse(
      {
        error: 'goal_is_required',
        message: 'ゴールを入力してください。',
      },
      { status: 400 },
      request,
    )
  }

  const client = await createClient()
  return handleRecommendation(request, goal, body?.goal ?? '', client)
}
