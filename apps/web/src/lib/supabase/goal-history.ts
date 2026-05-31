import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createServiceClient } from '@/lib/supabase/service'
import type { ApiResponse, GoalHistory, GoalHistoryInput } from '@/types'

type GoalHistoryClient = SupabaseClient<Database>
const MISSING_TARGET_COMPILED_PLAN_ERROR = 'target compiled plan missing'
type SwitchToGoalContext = {
  userId?: string
  compiledPlanClient?: GoalHistoryClient | null
}

async function resolveUserId(client: GoalHistoryClient) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error) throw new Error(error.message)
  if (!user) throw new Error('認証ユーザーが見つかりません')
  return user.id
}

async function clearDanglingGoalPlanId(
  goalHistoryId: string,
  updatedAt: string,
  client: GoalHistoryClient
) {
  const { error } = await client
    .from('goal_history')
    .update({
      plan_id: null,
      updated_at: updatedAt,
    })
    .eq('id', goalHistoryId)

  if (error) throw error
}

export async function getGoalHistory(
  client: GoalHistoryClient
): Promise<ApiResponse<GoalHistory[]>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('goal_history')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })

    if (error) throw error
    return { data: (data as GoalHistory[]) ?? [], error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}

export async function getActiveGoalHistory(
  client: GoalHistoryClient
): Promise<ApiResponse<GoalHistory | null>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('goal_history')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return { data: (data as GoalHistory | null) ?? null, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}

export async function createGoalHistory(
  input: GoalHistoryInput,
  client: GoalHistoryClient
): Promise<ApiResponse<GoalHistory>> {
  try {
    const userId = await resolveUserId(client)

    // Archive any currently active goal
    await client
      .from('goal_history')
      .update({
        status: 'archived',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Insert new active goal
    const { data, error } = await client
      .from('goal_history')
      .insert({
        user_id: userId,
        goal: input.goal,
        plan_id: input.plan_id ?? null,
        status: input.status ?? 'active',
      })
      .select('*')
      .single()

    if (error) throw error
    return { data: data as GoalHistory, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}

export async function archiveGoalHistory(
  goalHistoryId: string,
  client: GoalHistoryClient
): Promise<ApiResponse<GoalHistory>> {
  try {
    const { data, error } = await client
      .from('goal_history')
      .update({
        status: 'archived',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalHistoryId)
      .select('*')
      .single()

    if (error) throw error
    return { data: data as GoalHistory, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}

export async function switchToGoal(
  goalHistoryId: string,
  client: GoalHistoryClient,
  context: SwitchToGoalContext = {}
): Promise<ApiResponse<GoalHistory>> {
  try {
    const userId = context.userId ?? await resolveUserId(client)
    const compiledPlanClient =
      context.compiledPlanClient
      ?? createServiceClient()
      ?? client
    const timestamp = new Date().toISOString()

    const { data: targetGoalData, error: targetGoalError } = await client
      .from('goal_history')
      .select('*')
      .eq('id', goalHistoryId)
      .single()

    if (targetGoalError) throw targetGoalError

    const targetGoalHistory = targetGoalData as GoalHistory

    if (targetGoalHistory.plan_id) {
      const { data: compiledPlan, error: compiledPlanError } = await client
        .from('compiled_plans')
        .select('plan_id')
        .eq('user_id', userId)
        .eq('plan_id', targetGoalHistory.plan_id)
        .maybeSingle()

      if (compiledPlanError) throw compiledPlanError

      if (!compiledPlan) {
        await clearDanglingGoalPlanId(goalHistoryId, timestamp, client)
        return { data: null, error: MISSING_TARGET_COMPILED_PLAN_ERROR }
      }
    }

    // Archive currently active goal
    await client
      .from('goal_history')
      .update({
        status: 'archived',
        ended_at: timestamp,
        updated_at: timestamp,
      })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Reactivate selected goal
    const { data, error } = await client
      .from('goal_history')
      .update({
        status: 'active',
        ended_at: null,
        updated_at: timestamp,
      })
      .eq('id', goalHistoryId)
      .select('*')
      .single()

    if (error) throw error

    const goalHistory = data as GoalHistory

    // Deactivate the current compiled plan, then reactivate the one linked to
    // this goal when present.
    await compiledPlanClient
      .from('compiled_plans')
      .update({ status: 'archived' })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (goalHistory.plan_id) {
      const { data: activatedPlan, error: activatePlanError } = await compiledPlanClient
        .from('compiled_plans')
        .update({ status: 'active' })
        .eq('user_id', userId)
        .eq('plan_id', goalHistory.plan_id)
        .select('plan_id')
        .maybeSingle()

      if (activatePlanError) throw activatePlanError

      if (!activatedPlan) {
        await clearDanglingGoalPlanId(goalHistoryId, new Date().toISOString(), client)
        return { data: null, error: MISSING_TARGET_COMPILED_PLAN_ERROR }
      }
    }

    return { data: goalHistory, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '不明なエラー' }
  }
}
