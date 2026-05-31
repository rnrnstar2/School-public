/**
 * BYOK API key settings endpoint — TQ-226
 *
 * GET    /api/settings/api-keys           → list registered providers (masked)
 * POST   /api/settings/api-keys           → upsert one provider's key
 * DELETE /api/settings/api-keys?provider= → remove one provider's key
 *
 * The plaintext key never leaves this route handler — encrypted at the
 * application layer with AES-256-GCM via lib/byok/api-keys before insert.
 * RLS on `learner_api_keys` enforces own-row only.
 */

import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import {
  BYOK_PROVIDERS,
  deleteApiKey,
  isByokProvider,
  listApiKeysForUser,
  upsertApiKey,
} from '@/lib/byok/api-keys'

const upsertSchema = z.object({
  provider: z.enum(BYOK_PROVIDERS),
  key: z
    .string()
    .min(8, 'API キーは 8 文字以上で入力してください')
    .max(2048, 'API キーが長すぎます'),
})

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'settings:api-keys:get', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const rows = await listApiKeysForUser(supabase, user.id)
  // Always return the canonical list of providers so the UI can render
  // 設定済み / 未設定 for every supported provider in one shot.
  const byProvider = new Map(rows.map((row) => [row.provider, row]))
  const providers = BYOK_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider)
    return {
      provider,
      configured: Boolean(row),
      keyHint: row?.key_hint ?? null,
      updatedAt: row?.updated_at ?? null,
    }
  })

  return jsonResponse({ providers }, {}, request)
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'settings:api-keys:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, upsertSchema)
  if ('error' in parsed) return parsed.error

  const result = await upsertApiKey(supabase, user.id, parsed.data.provider, parsed.data.key)
  if (!result.ok) {
    const status = result.error === 'unauthenticated' ? 401 : 400
    return jsonResponse(
      { error: result.error, message: 'API キーの保存に失敗しました。' },
      { status },
      request,
    )
  }

  return jsonResponse(
    { success: true, provider: parsed.data.provider, keyHint: result.keyHint },
    {},
    request,
  )
}

export async function DELETE(request: Request) {
  const rlResponse = await applyRateLimit(request, 'settings:api-keys:delete', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')
  if (!isByokProvider(provider)) {
    return jsonResponse(
      { error: 'invalid_provider', message: '不正な provider です。' },
      { status: 400 },
      request,
    )
  }

  const result = await deleteApiKey(supabase, user.id, provider)
  if (!result.ok) {
    return jsonResponse(
      { error: result.error, message: 'API キーの削除に失敗しました。' },
      { status: 400 },
      request,
    )
  }

  return jsonResponse({ success: true, provider }, {}, request)
}
