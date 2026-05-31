import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { exerciseResultSchema } from '@/lib/api/schemas'

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'exercise-result', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, exerciseResultSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  // Count previous attempts for this exercise
  const { count } = await supabase
    .from('exercise_results')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('exercise_id', body.exercise_id)

  const attemptNumber = (count ?? 0) + 1

  const { data, error } = await supabase.from('exercise_results').insert({
    user_id: user.id,
    lesson_id: body.lesson_id,
    exercise_id: body.exercise_id,
    code: body.code,
    passed: body.passed,
    attempt_number: attemptNumber,
  }).select('id, passed, attempt_number').single()

  if (error) {
    return jsonResponse(
      { error: 'insert_failed', message: '演習結果の保存に失敗しました。' },
      { status: 500 },
      request,
    )
  }

  return jsonResponse(data, { status: 201 }, request)
}
