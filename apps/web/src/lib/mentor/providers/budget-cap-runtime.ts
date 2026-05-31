/**
 * Per-user budget cap runtime — W55 (Audit D2 / W11-NEW-7 wiring)
 *
 * W50 で `mentor-metrics.ts` に `assertUserBudgetCap` / `BudgetCapError` /
 * `DEFAULT_USER_MONTHLY_BUDGET_CAP_USD` が export されたが、caller 側の配線が
 * ゼロで実発火しなかった。本モジュールは Phase 1/3 dispatcher が enforcement
 * を呼ぶための **per-request scope** を提供する。
 *
 * 設計指針:
 * - **AsyncLocalStorage で per-request scope**: route handler / Conductor が
 *   `runWithMentorBudgetCap()` で context を install すると、その async 配下で
 *   走る全 sub-agent dispatcher (`maybeRunPhase1ZaiCall` /
 *   `maybeRunPhase3ProviderCall`) が同じ context を読む。これで sub-agent 自体の
 *   run() 本体を変えずに budget cap を発火できる。
 * - **opt-in**: context が無い (= scope を install していない) caller では
 *   enforcement は no-op。テストや旧 path との互換を壊さない。
 * - **fail-safe load**: `loadUserRuns()` が throw した場合は **enforcement を
 *   skip して通常実行を続行**する。Owner Q5「学習者口座保護」方針：DB 障害で
 *   学習体験を壊さない。budget は best-effort gate なので false-negative 側に倒す。
 * - **throw is the contract**: cap 超過時は `BudgetCapError` を **throw** する。
 *   caller (sub-agent 経由の fan-out runner / conductor) が catch して mock /
 *   429 fallback に倒す。helper 内部では catch しない（これが「実発火」した
 *   ことの観測点）。
 */

import {
  BudgetCapError,
  assertUserBudgetCap,
  type AgentRunRecord,
} from '@/lib/admin/mentor-metrics'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request budget cap context. Conductor / route handler が install する。
 */
export interface MentorBudgetCapContext {
  /** Auth 済み userId。`agent_runs.metadata.user_id` に対応。 */
  userId: string
  /**
   * 当月の `agent_runs` を返す loader。Conductor は service-role client から
   * `metadata->>user_id = userId` で当月分を fetch する想定。
   *
   * 本 helper は loader を 1 リクエスト中に複数回呼ぶ可能性がある（Phase 1 +
   * Phase 3 両方の helper / 複数 sub-agent）。caller 側で memoize 推奨。
   */
  loadUserRuns: () => Promise<ReadonlyArray<AgentRunRecord>>
  /** Per-call estimate (USD)。default は 0.05 USD（Phase 1 ZAI ≒ ZAI rate）。 */
  estimateUsdPerCall?: number
  /** Cap (USD)。省略時は env / default。 */
  capUsd?: number
  /** Phase 3 用の estimate を分けたい場合の override。 */
  estimateUsdPerCallPhase3?: number
}

const storage = new AsyncLocalStorage<MentorBudgetCapContext>()

/**
 * Install a per-request budget cap context. Inside `fn`, all sub-agent
 * dispatchers (Phase 1 ZAI helper / Phase 3 provider helper) will consult
 * the context and throw {@link BudgetCapError} when over cap.
 */
export function runWithMentorBudgetCap<T>(
  context: MentorBudgetCapContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn)
}

/**
 * Read the currently active context (if any). Used by helpers; tests can
 * also use it to assert that scope was installed correctly.
 */
export function getActiveMentorBudgetCapContext(): MentorBudgetCapContext | null {
  return storage.getStore() ?? null
}

/**
 * Helper-side enforcement entry point. Called by `maybeRunPhase1ZaiCall` and
 * `maybeRunPhase3ProviderCall` before issuing the LLM POST.
 *
 * Behavior:
 * - No active context → no-op (legacy callers / tests stay green).
 * - Active context + loader returns runs → call `assertUserBudgetCap`.
 *   - Under cap → return normally.
 *   - Over cap → re-throw `BudgetCapError` (do **not** swallow).
 * - Active context + loader **throws** → swallow loader error, return
 *   normally. Owner Q5 fail-safe: DB 障害で学習体験を壊さない。
 *
 * @param phase Used to pick the right `estimateUsdPerCall` override.
 */
export async function enforceUserBudgetCapForPhase(
  phase: 'phase1' | 'phase3',
): Promise<void> {
  const ctx = storage.getStore()
  if (!ctx) return

  let runs: ReadonlyArray<AgentRunRecord>
  try {
    runs = await ctx.loadUserRuns()
  } catch {
    // DB 障害 / loader 例外時は best-effort で通常実行を続行する。
    // budget gate は本当の cost 観測が取れた時にだけ動かす方針。
    return
  }

  const estimateUsd =
    (phase === 'phase3' ? ctx.estimateUsdPerCallPhase3 : undefined) ??
    ctx.estimateUsdPerCall ??
    DEFAULT_PHASE_ESTIMATE_USD[phase]

  // throw on over-cap — caller catches BudgetCapError downstream.
  assertUserBudgetCap({
    userId: ctx.userId,
    runs: [...runs],
    estimateUsd,
    ...(ctx.capUsd !== undefined ? { capUsd: ctx.capUsd } : {}),
  })
}

/**
 * Phase 別の per-call estimate default。Phase 1 ZAI は安価、Phase 3 BYOK は
 * 上位 LLM 寄りなので少し大きめに見積もる。env での override は今後の TQ 候補。
 */
export const DEFAULT_PHASE_ESTIMATE_USD: Record<'phase1' | 'phase3', number> = {
  phase1: 0.05,
  phase3: 0.25,
}

export { BudgetCapError }
