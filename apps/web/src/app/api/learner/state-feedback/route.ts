import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

const feedbackSchema = z.object({
  type: z.enum(['remove_blocker', 'add_strength', 'remove_weakness']),
  value: z.string().min(1).max(300),
})

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'state-feedback', RL_WRITE)
  if (rlResponse) return rlResponse

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'unauthorized', message: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, feedbackSchema)
  if ('error' in parsed) return parsed.error

  const { type, value } = parsed.data

  if (type === 'remove_blocker') {
    // Remove a blocker from learner_state
    const { data: state } = await client
      .from('learner_state')
      .select('blockers')
      .eq('user_id', user.id)
      .maybeSingle()

    const currentBlockers: string[] = (state?.blockers as string[]) ?? []
    const updatedBlockers = currentBlockers.filter((b) => b !== value)

    const { error } = await client
      .from('learner_state')
      .update({ blockers: updatedBlockers, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    if (error) {
      return jsonResponse({ error: 'update_failed', message: error.message }, { status: 500 }, request)
    }

    // Record feedback as mentor_memory so AI knows about the change
    await client.from('mentor_memory').insert({
      user_id: user.id,
      title: 'ブロッカー克服報告',
      bullets: [`「${value}」を克服済みとして報告`],
      source: 'system',
    })

    return jsonResponse({ success: true, updatedBlockers })
  }

  if (type === 'remove_weakness') {
    // Record as mentor_memory for AI to reference
    await client.from('mentor_memory').insert({
      user_id: user.id,
      title: '苦手分野克服報告',
      bullets: [`学習者が「${value}」を克服済みとフィードバック`],
      source: 'system',
    })

    return jsonResponse({ success: true })
  }

  if (type === 'add_strength') {
    await client.from('mentor_memory').insert({
      user_id: user.id,
      title: '得意分野追加報告',
      bullets: [`学習者が「${value}」を得意分野として追加`],
      source: 'system',
    })

    return jsonResponse({ success: true })
  }

  return jsonResponse({ error: 'invalid_type', message: '不正なフィードバックタイプです。' }, { status: 400 }, request)
}
