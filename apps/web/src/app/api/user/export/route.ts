import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'user:export', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const userId = user.id

  // Fetch all user-related data in parallel
  const [
    profileRes,
    stateRes,
    memoryRes,
    goalHistoryRes,
    compiledPlansRes,
    mentorSessionRes,
    chatRes,
  ] = await Promise.all([
    supabase.from('learner_profile').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('learner_state').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('mentor_memory').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('goal_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('compiled_plans').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('mentor_sessions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    supabase.from('lesson_chat_messages').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
  ])

  // Fetch task_progress via plan IDs
  const planIds = (compiledPlansRes.data ?? []).map((plan) => plan.plan_id)
  let taskProgressData: unknown[] = []
  if (planIds.length > 0) {
    const { data } = await supabase
      .from('task_progress')
      .select('*')
      .in('plan_id', planIds)
      .order('updated_at', { ascending: false })
    taskProgressData = data ?? []
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    learner_profile: profileRes.data ?? null,
    learner_state: stateRes.data ?? null,
    mentor_memory: memoryRes.data ?? [],
    mentor_sessions: mentorSessionRes.data ?? [],
    goal_history: goalHistoryRes.data ?? [],
    compiled_plans: compiledPlansRes.data ?? [],
    task_progress: taskProgressData,
    lesson_chat_messages: chatRes.data ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="school-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
