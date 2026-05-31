/**
 * Phase 1 ZAI invocation helper — W47 + W54 (CR-3 完全解消, Audit B2)
 *
 * Phase 3 (`MENTOR_PROVIDER_PHASE3=1`) opt-in でない production default で、
 * 各 sub-agent の specialized SYSTEM_PROMPT を実 LLM (ZAI) に送り届ける。
 *
 * 背景:
 * - TQ-239 で各 sub-agent 用に specialized SYSTEM_PROMPT を作成
 * - TQ-245 で `maybeRunPhase3ProviderCall` を経由して BYOK 経路から
 *   Anthropic / OpenAI / Gemini に prompt を渡す skeleton を配線
 * - W47 で Phase 1 default でも ZAI に specialized prompt を POST する経路を
 *   配線、しかし戻り値は **fire-and-forget** で 8 sub-agent が捨てていた
 *   （Audit B2 — CR-3 土管確定）
 *
 * 本 helper の役割 (W54):
 * - Phase 1 default (env off) でも `getExternalPlannerConfig()` が ZAI を
 *   解決できれば、specialized SYSTEM_PROMPT を含めて ZAI に POST する
 * - **戻り値の `text` を caller が JSON parse + Zod schema validation で
 *   解釈できるようにし、specialized output として採用できる経路を提供する**
 * - 既存の Phase 1 heuristic / mock fallback は ZAI 失敗時 / parse 失敗時 /
 *   schema 不一致時の fallback に降格（Owner Q5 学習者口座保護方針）
 * - 例外時は **catch して null 返却**。caller は既存 mock / heuristic に流す
 *
 * 設計指針:
 * - 本 helper は dispatch + 受信 + parse + schema validation までを行う
 * - Schema は caller (sub-agent) が渡す。Schema 不在なら parse のみ行い
 *   `parsedOutput` は `unknown` で返す（後方互換）
 * - ZAI が未設定なら即 null を返す。Phase 3 helper と同じ graceful degrade
 * - Phase 3 (`MENTOR_PROVIDER_PHASE3=1`) opt-in 時は Phase 3 helper が優先で
 *   呼ばれるため、本 helper は呼ばれない (caller 側で順序制御)
 */

import type { ZodType } from 'zod'

import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import {
  BudgetCapError,
  enforceUserBudgetCapForPhase,
} from './budget-cap-runtime'

const PHASE1_ZAI_TIMEOUT_MS = 30_000

export interface MaybePhase1ZaiCallInput<TParsed = unknown> {
  /** Sub-agent 固有の system prompt（`<SubAgent>.SYSTEM_PROMPT` を流用想定）。 */
  system: string
  /**
   * ZAI に渡す user message body。Phase 1 では構造化された JSON 文字列を推奨
   * （Phase 3 helper の `messages[0].content` と同等の粒度）。
   */
  userMessage: string
  /** Operation label。Sentry メトリクス用。例: `mentor.sub-agent.friction-critic`。 */
  operation?: string
  /**
   * 任意の Zod schema。指定された場合、ZAI 戻り値の `text` を JSON.parse して
   * schema.safeParse() に通す。成功すると `parsedOutput` に bind される。
   * 失敗 (parse error / schema 不一致) は **null 返却**（caller は mock fallback
   * に流す）。
   */
  outputSchema?: ZodType<TParsed>
}

export interface Phase1ZaiCallResult<TParsed = unknown> {
  /** Sub-agent ごとの dispatch 観測用に provider を固定で `zai` で返す。 */
  provider: 'zai'
  /** ZAI 側で利用された model id。 */
  model: string
  /** 抽出済みのテキスト出力。 */
  text: string
  /** 生レスポンス（debug 用）。 */
  raw: unknown
  /**
   * `outputSchema` が渡され、parse + validation に成功した場合に bind される。
   * Schema が無い場合は JSON.parse のみ試行し（成功時のみ）`unknown` で bind。
   * Parse / validation に失敗した場合は **本 helper は null を返す**ので
   * 本フィールドが定義された結果オブジェクトを caller が受け取った時点で
   * 「specialized output が利用可能」と判断できる。
   */
  parsedOutput?: TParsed
}

/**
 * Phase 1 default で specialized SYSTEM_PROMPT を ZAI に送る。
 *
 * 戻り値:
 * - `null`: ZAI が未設定 / 例外発生 / response 空 / parse 失敗 / schema 不一致。
 *   caller は既存 mock fetcher / heuristic に流す。
 * - `Phase1ZaiCallResult`: ZAI 呼び出しが成功し、`outputSchema` 指定時は
 *   parse + validation も成功した状態。`parsedOutput` に specialized output。
 *
 * 例外は本 helper 内で catch され null に畳まれる（学習者体験保護）。
 */
export async function maybeRunPhase1ZaiCall<TParsed = unknown>(
  input: MaybePhase1ZaiCallInput<TParsed>,
): Promise<Phase1ZaiCallResult<TParsed> | null> {
  const config = getExternalPlannerConfig()
  if (!config.available) return null

  // W55: per-user monthly budget cap gate. context が install されていなければ
  // no-op、cap 超過時は BudgetCapError を throw（caller が catch して mock /
  // 429 fallback に倒す）。loader 例外は swallow して通常実行（fail-safe）。
  await enforceUserBudgetCapForPhase('phase1')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PHASE1_ZAI_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.userMessage },
          ],
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      {
        operation: input.operation ?? 'mentor.sub-agent.phase1-zai',
        maxRetries: 2,
      },
    )

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      output_text?: string
    }

    const content =
      (typeof payload.output_text === 'string' ? payload.output_text : '') ||
      payload.choices?.[0]?.message?.content ||
      ''

    if (!content) {
      return null
    }

    const result: Phase1ZaiCallResult<TParsed> = {
      provider: 'zai',
      model: config.model,
      text: content,
      raw: payload,
    }

    // W54 (CR-3 完全解消): JSON parse + Zod schema validation。
    // Schema が指定された場合は厳格に validate し、不一致なら null を返して
    // caller を mock fallback に流す（Owner Q5 学習者体験保護）。
    if (input.outputSchema) {
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(content)
      } catch {
        return null
      }
      const parsed = input.outputSchema.safeParse(parsedJson)
      if (!parsed.success) {
        return null
      }
      result.parsedOutput = parsed.data
      return result
    }

    // Schema 未指定: 従来通り text のみ返す（後方互換）。
    return result
  } catch {
    // ZAI 呼び出し失敗時は静かに null を返し、既存 mock / heuristic に流す。
    // sub-agent 側は graceful 経路で継続（Owner Q5 方針）。
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Phase 3 が ON でない（= production default）かを判定する。
 *
 * Phase 3 ON 時は `maybeRunPhase3ProviderCall` が specialized prompt を BYOK 経路で
 * Anthropic / OpenAI / Gemini に渡すため、Phase 1 helper は呼ばない。
 */
export function shouldRunPhase1ZaiCall(): boolean {
  return process.env.MENTOR_PROVIDER_PHASE3 !== '1'
}

// Re-export so callers (sub-agents / fan-out / conductor) can `instanceof`
// the typed error against the same constructor reference (Owner Q5 / W55).
export { BudgetCapError }
