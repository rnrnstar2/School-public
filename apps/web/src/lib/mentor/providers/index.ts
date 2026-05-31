/**
 * Provider thin-client public surface — TQ-245
 *
 * Sub-agent class は本 index から `dispatchProviderCall` と
 * `isPhase3ProviderEnabled` を import して Phase 3 経路に乗る。
 *
 * Phase 1 (default): `isPhase3ProviderEnabled()` は false を返し、各 sub-agent
 * は既存 mock / heuristic / ZAI fetch path を維持する。
 *
 * Phase 3 (env opt-in): `MENTOR_PROVIDER_PHASE3=1` で true を返し、各 sub-agent
 * は BYOK key を `getApiKey(provider)` で引いて `dispatchProviderCall` を呼ぶ。
 */

export { dispatchProviderCall } from './provider-dispatch'
export type {
  ProviderCallParams,
  ProviderCallResult,
  ProviderMessage,
} from './types'
export { callAnthropic } from './anthropic-client'
export { callOpenAI } from './openai-client'
export { callGemini } from './gemini-client'
export {
  maybeRunPhase3ProviderCall,
  type MaybePhase3CallInput,
} from './phase3-helper'
export {
  maybeRunPhase1ZaiCall,
  shouldRunPhase1ZaiCall,
  type MaybePhase1ZaiCallInput,
  type Phase1ZaiCallResult,
} from './phase1-zai-helper'
export {
  BudgetCapError,
  DEFAULT_PHASE_ESTIMATE_USD,
  enforceUserBudgetCapForPhase,
  getActiveMentorBudgetCapContext,
  runWithMentorBudgetCap,
  type MentorBudgetCapContext,
} from './budget-cap-runtime'

/**
 * Phase 3 opt-in flag。
 *
 * 既定 (`undefined` / `'0'` / その他) では false を返し、各 sub-agent は
 * Phase 1 互換 path（既存 mock / heuristic / ZAI fetch）を維持する。
 *
 * `MENTOR_PROVIDER_PHASE3=1` で true を返し、sub-agent は BYOK key を
 * 解決して `dispatchProviderCall` を呼ぶ経路に乗る。実 API call が走るため
 * 学習者口座保護の観点で **Owner 明示判断必須**（PR ベースで env 設定）。
 */
export function isPhase3ProviderEnabled(): boolean {
  return process.env.MENTOR_PROVIDER_PHASE3 === '1'
}
