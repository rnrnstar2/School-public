import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

// ── PATCH: update a mentor_memory entry ──

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  bullets: z.array(z.string().max(500)).max(20).optional(),
})

export async function PATCH(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-memory-update', RL_WRITE)
  if (rlResponse) return rlResponse

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'unauthorized', message: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, patchSchema)
  if ('error' in parsed) return parsed.error

  const { id, title, bullets } = parsed.data

  // Only allow updating own memories (RLS enforces this too)
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (bullets !== undefined) updates.bullets = bullets

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: 'no_changes', message: '更新する項目がありません。' }, { status: 400 }, request)
  }

  const { data, error } = await client
    .from('mentor_memory')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return jsonResponse({ error: 'update_failed', message: error.message }, { status: 500 }, request)
  }

  return jsonResponse({ data })
}

// ── DELETE: remove a mentor_memory entry ──

const deleteSchema = z.object({
  id: z.string().uuid(),
})

export async function DELETE(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-memory-delete', RL_WRITE)
  if (rlResponse) return rlResponse

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'unauthorized', message: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, deleteSchema)
  if ('error' in parsed) return parsed.error

  const { error } = await client
    .from('mentor_memory')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)

  if (error) {
    return jsonResponse({ error: 'delete_failed', message: error.message }, { status: 500 }, request)
  }

  return jsonResponse({ success: true })
}
