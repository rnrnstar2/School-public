/**
 * Live AI budget guard for Playwright E2E.
 *
 * TQ-123: `useLiveAi()` から差し込み、calls / tokens / usd が env で指定した
 * 上限を超えたら明確に throw して test を fail させる。mock 縮退 (`fallback`) と
 * 混同しない — 予算超過は事故防止のため必ず RED になる。
 *
 * Env vars (any/all may be set):
 *   - AI_LIVE_E2E_MAX_CALLS   (既定 5)
 *   - AI_LIVE_E2E_MAX_TOKENS  (既定 20000)
 *   - AI_LIVE_E2E_MAX_USD     (既定 0.25)
 *   - AI_LIVE_E2E_USD_PER_TOKEN (既定 0.00002 — GLM-5 ballpark)
 */

export interface LiveAiBudgetSpec {
  maxCalls?: number
  maxTokens?: number
  maxUsd?: number
  usdPerToken?: number
}

export interface LiveAiBudgetSnapshot {
  calls: number
  tokens: number
  usd: number
  maxCalls: number
  maxTokens: number
  maxUsd: number
}

export interface LiveAiBudget {
  consumeCall(): void
  consumeTokens(count: number): void
  snapshot(): LiveAiBudgetSnapshot
}

const DEFAULTS = {
  maxCalls: 5,
  maxTokens: 20_000,
  maxUsd: 0.25,
  usdPerToken: 0.00002,
} as const

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export function createLiveAiBudget(spec: LiveAiBudgetSpec = {}): LiveAiBudget {
  const maxCalls = spec.maxCalls ?? parsePositiveNumber(
    process.env.AI_LIVE_E2E_MAX_CALLS,
    DEFAULTS.maxCalls,
  )
  const maxTokens = spec.maxTokens ?? parsePositiveNumber(
    process.env.AI_LIVE_E2E_MAX_TOKENS,
    DEFAULTS.maxTokens,
  )
  const maxUsd = spec.maxUsd ?? parsePositiveNumber(
    process.env.AI_LIVE_E2E_MAX_USD,
    DEFAULTS.maxUsd,
  )
  const usdPerToken = spec.usdPerToken ?? parsePositiveNumber(
    process.env.AI_LIVE_E2E_USD_PER_TOKEN,
    DEFAULTS.usdPerToken,
  )

  let calls = 0
  let tokens = 0
  let usd = 0

  function guard(reason: string) {
    throw new Error(`live-ai-budget exceeded: ${reason}`)
  }

  return {
    consumeCall() {
      calls += 1
      if (calls > maxCalls) {
        guard(`calls (${calls} > ${maxCalls})`)
      }
    },
    consumeTokens(count: number) {
      if (!Number.isFinite(count) || count <= 0) {
        return
      }
      tokens += count
      usd += count * usdPerToken

      if (tokens > maxTokens) {
        guard(`tokens (${tokens} > ${maxTokens})`)
      }
      if (usd > maxUsd) {
        guard(`usd (${usd.toFixed(4)} > ${maxUsd})`)
      }
    },
    snapshot() {
      return { calls, tokens, usd, maxCalls, maxTokens, maxUsd }
    },
  }
}
