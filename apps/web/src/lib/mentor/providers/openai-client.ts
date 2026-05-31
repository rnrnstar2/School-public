/**
 * OpenAI provider thin client — TQ-245
 *
 * Phase 3 用の **薄い wrapper**。OpenAI chat.completions API を `openai` SDK
 * 経由で呼び、共通 `ProviderCallResult` で返す。Phase 1 では実 traffic は
 * ZAI に強制（Owner Q5）されるため本関数は呼ばれない。env
 * `MENTOR_PROVIDER_PHASE3=1` で `provider-dispatch.ts` 経由で起動される。
 *
 * 設計指針:
 * - Tool-Scout (sub-agent #3) は本来 OpenAI Responses API + websearch tool を
 *   使う設計（router で `openai:gpt-5.x`）。本 thin client は Phase 3 skeleton
 *   として chat.completions ベースで動かし、websearch tool 配線は別 TQ で
 *   `params.tools` 経由に拡張する。
 * - SDK インスタンスは per-call 生成（BYOK / budget cap の hook 余地）。
 * - 例外は catch せず投げる（caller 責務）。
 */

import OpenAI from 'openai'
import type { ProviderCallParams, ProviderCallResult } from './types'

export async function callOpenAI(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  if (!params.apiKey) {
    throw new Error('openai: missing apiKey (BYOK lookup returned null)')
  }

  const client = new OpenAI({ apiKey: params.apiKey })

  // OpenAI chat.completions では system は messages[0] として注入する。
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (params.system) {
    messages.push({ role: 'system', content: params.system })
  }
  for (const m of params.messages) {
    messages.push({ role: m.role, content: m.content })
  }

  const response = await client.chat.completions.create({
    model: params.model,
    messages,
    ...(typeof params.maxTokens === 'number'
      ? { max_tokens: params.maxTokens }
      : {}),
    ...(typeof params.temperature === 'number'
      ? { temperature: params.temperature }
      : {}),
  })

  const text = response.choices?.[0]?.message?.content ?? ''

  return {
    provider: 'openai',
    model: response.model ?? params.model,
    text: typeof text === 'string' ? text : '',
    raw: response,
  }
}
