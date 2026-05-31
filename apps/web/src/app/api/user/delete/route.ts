import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { applyRateLimit, RL_WRITE } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type DeletionPromise = PromiseLike<{ error: { message: string } | null }>

// User-scoped tables deleted in parallel for GDPR full PII erasure.
// Child tables (task_progress, milestone_progress) are deleted before their parents.
const USER_SCOPED_TABLES = [
  'mentor_sessions',
  'mentor_memory',
  'mentor_memory_archive',
  'ai_response_feedback',
  'goal_history',
  'goals',
  'artifacts',
  'lesson_chat_messages',
  'certificates',
  'compiled_plans',
  'lesson_feedback',
  'user_progress',
  'workspace_snapshots',
] as const

// Top-level user tables deleted last so they don't FK-block child deletions above.
const TOP_LEVEL_USER_TABLES = ['learner_profile', 'learner_state'] as const

type UserScopedTable =
  | (typeof USER_SCOPED_TABLES)[number]
  | (typeof TOP_LEVEL_USER_TABLES)[number]
  | 'milestone_progress'
  | 'task_progress'

// Attempt a delete and record the table name on failure.
// We intentionally do NOT early-abort — for GDPR erasure we want to purge as
// much data as possible, then surface a 500 so the client can retry the
// remaining failures.
async function runDeletion(
  table: UserScopedTable,
  promise: DeletionPromise,
  failures: string[],
) {
  try {
    const { error } = await promise
    if (error) {
      console.warn(`[user/delete] Failed to delete ${table}: ${error.message}`)
      failures.push(table)
    }
  } catch (error) {
    console.warn(`[user/delete] Failed to delete ${table}:`, error)
    failures.push(table)
  }
}

function deleteByUserId(
  supabase: SupabaseClient,
  table: UserScopedTable,
  userId: string,
  failures: string[],
) {
  return runDeletion(
    table,
    supabase.from(table).delete().eq('user_id', userId) as DeletionPromise,
    failures,
  )
}

export async function DELETE(request: Request) {
  const rlResponse = await applyRateLimit(request, 'user:delete', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const userId = user.id
  const failedTables: string[] = []

  // task_progress is keyed by plan_id (not user_id), so resolve plan IDs first.
  const { data: compiledPlans } = await supabase
    .from('compiled_plans')
    .select('plan_id')
    .eq('user_id', userId)

  const planIds = (compiledPlans ?? []).map((plan) => plan.plan_id)

  if (planIds.length > 0) {
    await runDeletion(
      'task_progress',
      supabase.from('task_progress').delete().in('plan_id', planIds) as DeletionPromise,
      failedTables,
    )
  }
  await deleteByUserId(supabase, 'milestone_progress', userId, failedTables)

  await Promise.all(
    USER_SCOPED_TABLES.map((table) =>
      deleteByUserId(supabase, table, userId, failedTables),
    ),
  )

  await Promise.all(
    TOP_LEVEL_USER_TABLES.map((table) =>
      deleteByUserId(supabase, table, userId, failedTables),
    ),
  )

  // GDPR: partial delete = compliance violation. If any table failed, refuse
  // to delete the auth user (so the client can retry) and surface the failure.
  if (failedTables.length > 0) {
    return jsonResponse(
      {
        error: 'partial_delete',
        message:
          '一部のデータ削除に失敗しました。時間をおいて再度お試しください。',
        failedTables,
      },
      { status: 500 },
      request,
    )
  }

  // Delete the auth user via admin API
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceRoleKey) {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
    )
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) {
      return jsonResponse(
        { error: 'auth_delete_failed', message: 'アカウントの削除に失敗しました。' },
        { status: 500 },
        request,
      )
    }
  } else {
    // Fallback: sign out user if no service role key (data already deleted)
    await supabase.auth.signOut()
  }

  return jsonResponse({ success: true, message: 'アカウントが削除されました。' }, {}, request)
}
