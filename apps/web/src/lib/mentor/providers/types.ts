/**
 * Provider thin client 共通 I/O 型 — TQ-245
 *
 * Anthropic / OpenAI / Gemini の SDK API は形が違うので、sub-agent から見た
 * 統一インターフェースを `ProviderCallParams` / `ProviderCallResult` で吸収する。
 * `provider-dispatch.ts` が `pickModelFor(role)` の結果を見て適切な thin client
 * (anthropic-client / openai-client / gemini-client) に振り分ける。
 *
 * Phase 1 では実 traffic は ZAI に強制されるため本契約は使われない。env
 * `MENTOR_PROVIDER_PHASE3=1` opt-in で sub-agent が `dispatchProviderCall` を
 * 呼ぶ経路に乗る。
 */

import type { Provider } from '@/lib/mentor/router'

export interface ProviderMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ProviderCallParams {
  /** Provider-specific model id（例 `claude-opus-4-7` / `gpt-5.x` / `gemini-pro-3`）。 */
  model: string
  /** System prompt。Provider 側で適切な位置に注入する。 */
  system?: string
  /** Conversation messages（system は別 field）。 */
  messages: ProviderMessage[]
  /** BYOK で解決済みの API key（null は許さない、caller が dispatch 前に確認）。 */
  apiKey: string
  /** 最大出力 token 数。指定しなければ provider default。 */
  maxTokens?: number
  /** 0..1 sampling temperature。 */
  temperature?: number
  /** Anthropic extended thinking budget（tie-breaker でのみ使用）。 */
  thinking?: { budget: number }
}

export interface ProviderCallResult {
  /** dispatch した provider。 */
  provider: Provider
  /** Provider が返した model id（response 由来。指定 model と異なる場合あり）。 */
  model: string
  /** 抽出済みのテキスト出力。tool call 等は raw 経由で参照する。 */
  text: string
  /** SDK 生レスポンス。tool call / grounding metadata 等の高度なフィールドを参照する場合に使う。 */
  raw: unknown
}
