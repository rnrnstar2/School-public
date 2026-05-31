/**
 * Provider Dispatch — TQ-245
 *
 * `pickModelFor(role)` で resolve した `ModelConfig` を見て、適切な thin client
 * (Anthropic / OpenAI / Gemini) を呼び出す。各 sub-agent class の Phase 3
 * injection point から共通で叩くファサード。
 *
 * 設計指針:
 * - **本ファイルは provider 切り替えのみ**。retry / fallback chain / circuit
 *   breaker は別 TQ（Phase 3 後段）で実装する。Phase 1 では skeleton として
 *   `model.fallbackChain` を見ない（fallback 発火条件 / 実 traffic 切替は
 *   owner 別判断）。
 * - **ZAI は本 dispatch から呼ばない**。Phase 1 の実 traffic は ZAI 一本だが、
 *   それは sub-agent class 側で `MENTOR_PROVIDER_PHASE3` 未設定時に既存 mock /
 *   heuristic を使うことで担保する。本 dispatch は Phase 3 opt-in 時のみ通る。
 * - 例外は呼び出し側に伝播する（sub-agent class が catch して `status='error'`
 *   の SubAgentReport を組み立てる）。
 */

import type { ModelConfig, Provider } from '@/lib/mentor/router'
import { callAnthropic } from './anthropic-client'
import { callOpenAI } from './openai-client'
import { callGemini } from './gemini-client'
import type { ProviderCallParams, ProviderCallResult } from './types'

export interface DispatchProviderCallInput {
  model: ModelConfig
  system?: string
  messages: ProviderCallParams['messages']
  /** BYOK で解決済みの key。null/undefined は弾く（呼び出し前に caller がチェック）。 */
  apiKey: string
}

/**
 * `model.provider` を見て適切な thin client にディスパッチする。
 *
 * - `'anthropic'` → `callAnthropic`
 * - `'openai'`    → `callOpenAI`
 * - `'gemini'`    → `callGemini`
 * - `'zai'`       → 本 dispatch 経由では呼ばない（Phase 1 互換 path で扱う）
 *
 * `'zai'` が渡された場合は明示エラーを投げる。Phase 1 では sub-agent class が
 * 既存 mock / ZAI fetch path を選択するため、本 dispatch には到達しない。
 */
export async function dispatchProviderCall(
  input: DispatchProviderCallInput,
): Promise<ProviderCallResult> {
  const provider: Provider = input.model.provider
  const params: ProviderCallParams = {
    model: input.model.model,
    apiKey: input.apiKey,
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(typeof input.model.maxTokens === 'number'
      ? { maxTokens: input.model.maxTokens }
      : {}),
    ...(typeof input.model.temperature === 'number'
      ? { temperature: input.model.temperature }
      : {}),
    ...(input.model.thinking ? { thinking: input.model.thinking } : {}),
  }

  switch (provider) {
    case 'anthropic':
      return callAnthropic(params)
    case 'openai':
      return callOpenAI(params)
    case 'gemini':
      return callGemini(params)
    case 'zai':
      throw new Error(
        'provider-dispatch: ZAI provider is handled by the legacy fetch path, not this dispatcher',
      )
    case 'xai':
      // W16: xAI (Grok) is registered in the routing config but the thin
      // client is not yet implemented (xAI SDK / API URL pending owner
      // confirmation). Until Wave 17+ wires `callXai`, treat dispatch
      // attempts as an explicit, non-silent error so callers fall back to
      // the role's `fallbackChain` rather than masquerade as success.
      throw new Error(
        'provider-dispatch: xAI provider is registered but the thin client is not wired yet (W16). Set MENTOR_MODEL_<ROLE> to a non-xai provider or wait for Wave 17 fetch wiring.',
      )
    default: {
      const exhaustive: never = provider
      throw new Error(`provider-dispatch: unknown provider ${exhaustive}`)
    }
  }
}
