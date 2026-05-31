/**
 * Phase 3 invocation helper — TQ-245 / TQ-246
 *
 * 各 sub-agent class が共通で叩くファサード。
 *
 * 役割:
 * - env `MENTOR_PROVIDER_PHASE3` の確認
 * - BYOK 経由で `getApiKey(provider)` を呼んで key を解決
 * - `dispatchProviderCall` で実 LLM call を発火
 * - 例外 / key 未解決 / env off の場合は **null を返す**（caller は既存 mock /
 *   heuristic 経路にフォールバック）
 *
 * 設計指針:
 * - **本 helper は判定 + dispatch のみ**。payload 整形は呼び出し側 sub-agent の
 *   責務。Phase 3 で各 sub-agent に対する parser を生やす際は、ここを通って
 *   返ってきた `text` を sub-agent ごとに JSON / 構造化情報に変換する。
 * - **Phase 1 では呼ばれても何も起きない**。env が立っていないので即 null。
 *   `getApiKey` 未指定でも null。Phase 1 default 動作は完全互換。
 * - 例外時は **catch して null 返却**。sub-agent の status を error にせず、
 *   既存 mock fallback で穏当に継続する設計（Owner Q5: 学習者口座保護方針に
 *   従い、key 障害でユーザー体験を壊さない）。
 */

import type { ModelConfig, Provider } from '@/lib/mentor/router'
import { dispatchProviderCall } from './provider-dispatch'
import { isPhase3ProviderEnabled } from './index'
import type { ProviderCallResult, ProviderMessage } from './types'
import {
  BudgetCapError,
  enforceUserBudgetCapForPhase,
} from './budget-cap-runtime'

export interface MaybePhase3CallInput {
  /** Provider key 解決関数。BYOK 由来（route.ts → conductor → sub-agent deps）。 */
  getApiKey?: (provider: Provider) => Promise<string | null>
  /** `pickModelFor(role)` で resolve した ModelConfig。 */
  model: ModelConfig
  /** Sub-agent 固有の system prompt（`<SubAgent>.SYSTEM_PROMPT` を流用想定）。 */
  system?: string
  /** Conversation messages（role: 'user' / 'assistant'）。 */
  messages: ProviderMessage[]
}

/**
 * Phase 3 path に乗るか判定し、可能なら `dispatchProviderCall` を実行する。
 *
 * 戻り値:
 * - `null`: Phase 1 互換 path を使う（env off / getApiKey 未指定 / key null /
 *   ZAI provider / 例外発生）。caller は既存 mock fetcher / heuristic に流す。
 * - `ProviderCallResult`: Phase 3 で実 LLM call が成功した。caller は本結果を
 *   sub-agent payload にパースする責務（parser 接続は別 TQ）。
 *
 * 例外は本 helper 内で catch され null に畳まれる（学習者体験保護）。
 */
export async function maybeRunPhase3ProviderCall(
  input: MaybePhase3CallInput,
): Promise<ProviderCallResult | null> {
  if (!isPhase3ProviderEnabled()) return null
  // ZAI は本 dispatch から呼ばない（Phase 1 既存 path を使う）
  if (input.model.provider === 'zai') return null
  if (!input.getApiKey) return null

  // W55: per-user monthly budget cap gate. context が install されていなければ
  // no-op、cap 超過時は BudgetCapError を throw（caller が catch して 429 /
  // graceful fallback に倒す）。Phase 3 は実 BYOK call が走るため発火点として
  // 最重要（Audit D2 = Phase 3 解禁の唯一の gating）。
  await enforceUserBudgetCapForPhase('phase3')

  let apiKey: string | null = null
  try {
    apiKey = await input.getApiKey(input.model.provider)
  } catch {
    return null
  }
  if (!apiKey) return null

  try {
    return await dispatchProviderCall({
      model: input.model,
      apiKey,
      messages: input.messages,
      ...(input.system ? { system: input.system } : {}),
    })
  } catch {
    // Phase 3 dispatch 失敗時は静かに null を返し、既存 mock / heuristic に流す。
    // Sub-agent 側は caller が指定した graceful 経路で継続（Owner Q5 方針）。
    return null
  }
}

// Re-export so callers (sub-agents / fan-out / conductor) can `instanceof`
// the typed error against the same constructor reference (Owner Q5 / W55).
export { BudgetCapError }
