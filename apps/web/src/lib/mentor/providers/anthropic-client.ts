/**
 * Anthropic provider thin client — TQ-245
 *
 * Phase 3 用の **薄い wrapper**。Anthropic Messages API を `@anthropic-ai/sdk`
 * 経由で呼び、共通 `ProviderCallResult` で返す。Phase 1 では実 traffic は
 * ZAI に強制（Owner Q5: 学習者口座保護）されるため本関数は呼ばれない。
 * env `MENTOR_PROVIDER_PHASE3=1` で `provider-dispatch.ts` 経由で起動される。
 *
 * 設計指針:
 * - SDK インスタンスは **per-call で生成** する。BYOK で per-user key を
 *   注入する都合上、グローバル singleton にしない。Phase 3 で per-user budget
 *   cap を入れる際もここに hook できる。
 * - 例外は **catch せず投げる**。caller (`provider-dispatch`) が catch して
 *   sub-agent の status を `error` にする責務。
 * - `system` / `messages` 形式は Anthropic Messages API の native shape に
 *   合わせる。OpenAI / Gemini との違いは `provider-dispatch` で吸収する。
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ProviderCallParams, ProviderCallResult } from './types'

export async function callAnthropic(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  if (!params.apiKey) {
    throw new Error('anthropic: missing apiKey (BYOK lookup returned null)')
  }

  const client = new Anthropic({ apiKey: params.apiKey })

  const messages = params.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const response = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 4096,
    ...(typeof params.temperature === 'number'
      ? { temperature: params.temperature }
      : {}),
    ...(params.system ? { system: params.system } : {}),
    ...(params.thinking
      ? {
          thinking: {
            type: 'enabled',
            budget_tokens: params.thinking.budget,
          },
        }
      : {}),
    messages,
  })

  // Extract text from text content blocks (skip thinking / tool_use blocks).
  const text = (response.content ?? [])
    .map((block) => {
      if (
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      ) {
        return (block as { text: string }).text
      }
      return ''
    })
    .filter((t) => t.length > 0)
    .join('\n')

  return {
    provider: 'anthropic',
    model: response.model ?? params.model,
    text,
    raw: response,
  }
}
