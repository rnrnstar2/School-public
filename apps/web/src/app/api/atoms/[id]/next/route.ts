import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { previewNextAtom } from '@/lib/atoms/next-atom-resolver'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'atom-next', RL_READ)
  if (rlResponse) {
    return rlResponse
  }

  const { id } = await params
  const atomId = id?.trim()

  if (!atomId) {
    return jsonResponse({ error: 'atom_id は必須です。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const next = await previewNextAtom({
    userId: user.id,
    justCompletedAtomId: atomId,
    client: supabase,
  })

  return jsonResponse({ ok: true, next }, {}, request)
}
