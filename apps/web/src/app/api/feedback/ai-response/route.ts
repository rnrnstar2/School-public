import { createClient } from '@/lib/supabase/server'
import { upsertMentorMemory } from '@/lib/learner-models'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { aiResponseFeedbackSchema } from '@/lib/api/schemas'

const REASON_LABELS: Record<string, string> = {
  off_topic: '的外れな回答',
  already_known: '既知の内容の繰り返し',
  unclear: '分かりにくい説明',
  too_simple: '簡単すぎる説明',
  too_complex: '難しすぎる説明',
  repetitive: '同じ説明パターンの繰り返し',
  other: 'その他の問題',
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'ai-feedback', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, aiResponseFeedbackSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  // Save feedback to ai_response_feedback table
  const { error: insertError } = await supabase
    .from('ai_response_feedback')
    .insert({
      user_id: user.id,
      chat_context: body.chat_context,
      context_id: body.context_id ?? null,
      message_id: body.message_id,
      rating: body.rating,
      reason: body.reason ?? null,
      comment: body.comment ?? null,
      assistant_message_preview: body.assistant_message_preview ?? null,
    })

  if (insertError) {
    return jsonResponse(
      { error: 'save_failed', message: 'フィードバックの保存に失敗しました。' },
      { status: 500 },
      request,
    )
  }

  // For negative feedback, also record in mentor_memory for prompt injection
  if (body.rating === 'negative' && body.reason) {
    const reasonLabel = REASON_LABELS[body.reason] ?? body.reason
    const preview = body.assistant_message_preview?.slice(0, 100) ?? ''
    const contextLabel = body.chat_context === 'lesson' ? 'レッスンチャット'
      : body.chat_context === 'hearing' ? 'ヒアリング'
      : 'メンターチャット'

    await upsertMentorMemory({
      title: `AI応答フィードバック: ${reasonLabel}`,
      bullets: [
        `${contextLabel}での回答に「${reasonLabel}」と評価された`,
        preview ? `対象の回答: ${preview}...` : '',
        '次回は異なるアプローチで説明すること',
      ].filter(Boolean),
      source: 'system',
    }, supabase).catch(() => {/* non-blocking */})
  }

  return jsonResponse({ ok: true }, { status: 200 }, request)
}
