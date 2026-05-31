/**
 * Gemini provider thin client — TQ-245
 *
 * Phase 3 用の **薄い wrapper**。Google Generative AI を `@google/generative-ai`
 * SDK 経由で呼び、共通 `ProviderCallResult` で返す。Phase 1 では実 traffic は
 * ZAI に強制（Owner Q5）されるため本関数は呼ばれない。env
 * `MENTOR_PROVIDER_PHASE3=1` で `provider-dispatch.ts` 経由で起動される。
 *
 * 設計指針:
 * - Tech-Stack Scout (sub-agent #2) は本来 Gemini + Google grounding を
 *   使う設計（router で `gemini:gemini-pro-3`）。本 thin client は Phase 3
 *   skeleton として generateContent ベースで動かし、grounding tool 配線は
 *   別 TQ で `params.tools` 経由に拡張する。
 * - SDK インスタンスは per-call 生成（BYOK / budget cap の hook 余地）。
 * - 例外は catch せず投げる（caller 責務）。
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ProviderCallParams, ProviderCallResult } from './types'

export async function callGemini(
  params: ProviderCallParams,
): Promise<ProviderCallResult> {
  if (!params.apiKey) {
    throw new Error('gemini: missing apiKey (BYOK lookup returned null)')
  }

  const genAI = new GoogleGenerativeAI(params.apiKey)
  const generativeModel = genAI.getGenerativeModel({
    model: params.model,
    ...(params.system
      ? {
          systemInstruction: {
            role: 'system',
            parts: [{ text: params.system }],
          },
        }
      : {}),
    ...(typeof params.temperature === 'number' ||
    typeof params.maxTokens === 'number'
      ? {
          generationConfig: {
            ...(typeof params.temperature === 'number'
              ? { temperature: params.temperature }
              : {}),
            ...(typeof params.maxTokens === 'number'
              ? { maxOutputTokens: params.maxTokens }
              : {}),
          },
        }
      : {}),
  })

  // Gemini は role: 'user' / 'model' のみ受け付ける（'assistant' 不可）。
  const contents = params.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const result = await generativeModel.generateContent({ contents })
  const text =
    typeof result.response.text === 'function' ? result.response.text() : ''

  return {
    provider: 'gemini',
    model: params.model,
    text,
    raw: result,
  }
}
