/**
 * Mentor session SSE error event helpers — W69 (Audit B4 #2).
 *
 * `/api/mentor/session` の SSE writer は `event: error` を 2 種類流す:
 *
 *   - `error: 'mentor_budget_cap_exceeded'`  — 当月の per-user budget cap 超過。
 *     `cap` field に `{ userId, currentUsd, capUsd, estimateUsd? }` を含む。
 *   - `error: 'mentor_session_failed'`       — 通常の AI 失敗。`message` のみ。
 *
 * 旧実装は両者を `throw new Error(payload.message)` で同一の generic toast に倒し、
 * 構造化 cap 情報 / 月初リセット日 / `/settings/api-keys` への deep link を捨てて
 * いた。本 helper は client SSE handler が型安全に分岐するための純関数 API を
 * 提供する。
 *
 * ## API
 *
 *   parseMentorSseErrorEvent(rawData)
 *     - `mentor_budget_cap_exceeded` → `{ kind: 'budget_cap', cap }` を返す。
 *       cap には `usedUsd / capUsd / projectedUsd / resetAtIso` を必ず含む
 *       (server payload に projected/reset_at が無くても client 側で算出する)。
 *     - `mentor_session_failed`      → `{ kind: 'generic', message }` を返す。
 *     - parse 不能 / 想定外 shape    → `{ kind: 'generic', message }` で fallback。
 *
 * ## reset_at の算出について
 *
 * server 側 `BudgetCapError` は currentUsd/capUsd しか持たないが、月次 cap は
 * `getUserMonthlyBudgetUsd` (admin/mentor-metrics) が **当月分のみ** を集計する
 * 設計のため、リセット境界は **次月 1 日 00:00:00 UTC** で確定。`now` を inject
 * 可能にして、test では deterministic に検証できる。
 */

const BUDGET_CAP_ERROR_CODE = 'mentor_budget_cap_exceeded' as const
const SESSION_FAILED_ERROR_CODE = 'mentor_session_failed' as const

export interface MentorBudgetCapEvent {
  readonly kind: 'budget_cap'
  readonly userId: string | null
  /** Month-to-date spend in USD before this denied call. */
  readonly usedUsd: number
  /** Cap in effect (USD). */
  readonly capUsd: number
  /**
   * Projected total = usedUsd + estimateUsd. server payload に estimateUsd が
   * 含まれない旧バージョン互換時は `null` を返す (client 表示は `--`)。
   */
  readonly projectedUsd: number | null
  /**
   * Reset boundary as ISO 8601 string (UTC). 当月分のみ集計する metrics 設計
   * から、来月 1 日 00:00:00 UTC を必ず指す。
   */
  readonly resetAtIso: string
  /** Server message (Japanese). banner の supplemental text として使う。 */
  readonly message: string
}

export interface MentorGenericErrorEvent {
  readonly kind: 'generic'
  readonly message: string
}

export type MentorSseErrorEvent =
  | MentorBudgetCapEvent
  | MentorGenericErrorEvent

const FALLBACK_MESSAGE = 'メンター応答の取得に失敗しました。'
const FALLBACK_CAP_MESSAGE =
  '今月のメンター利用上限に達しました。来月またご利用ください。'

/**
 * Parse a client-received `event: error` payload into a discriminated union.
 *
 * `now` は test のため inject 可能。production では `new Date()` を使う。
 */
export function parseMentorSseErrorEvent(
  rawData: unknown,
  options: { now?: Date } = {},
): MentorSseErrorEvent {
  if (!isPlainObject(rawData)) {
    return { kind: 'generic', message: FALLBACK_MESSAGE }
  }

  const code = rawData.error
  if (code === BUDGET_CAP_ERROR_CODE) {
    return parseBudgetCapEvent(rawData, options.now ?? new Date())
  }

  const message =
    typeof rawData.message === 'string' && rawData.message.length > 0
      ? rawData.message
      : code === SESSION_FAILED_ERROR_CODE
        ? FALLBACK_MESSAGE
        : FALLBACK_MESSAGE

  return { kind: 'generic', message }
}

function parseBudgetCapEvent(
  raw: Record<string, unknown>,
  now: Date,
): MentorBudgetCapEvent {
  const message =
    typeof raw.message === 'string' && raw.message.length > 0
      ? raw.message
      : FALLBACK_CAP_MESSAGE

  const cap = isPlainObject(raw.cap) ? raw.cap : null

  const usedUsd = readNonNegativeNumber(cap?.currentUsd) ?? 0
  const capUsd = readPositiveNumber(cap?.capUsd) ?? 0
  const userId =
    cap && typeof cap.userId === 'string' && cap.userId.length > 0
      ? cap.userId
      : null

  // estimateUsd は server payload 拡張済み (W69) であれば含まれる。
  // 旧 payload 互換時は null に落として UI で `--` 表示にする。
  const estimateUsd = readNonNegativeNumber(cap?.estimateUsd)
  const projectedUsd = estimateUsd === null ? null : round2(usedUsd + estimateUsd)

  return {
    kind: 'budget_cap',
    userId,
    usedUsd: round2(usedUsd),
    capUsd: round2(capUsd),
    projectedUsd,
    resetAtIso: computeNextMonthResetIso(now),
    message,
  }
}

/**
 * 当月分のみ集計する metrics 設計に対応した「次回リセット」境界。
 * 来月 1 日 00:00:00.000 UTC を ISO で返す。
 *
 * exported for white-box testing of the date math.
 */
export function computeNextMonthResetIso(now: Date): string {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() // 0-based, Jan = 0
  // Date.UTC は month overflow を翌年へ繰り上げる (e.g. (2026, 12) -> 2027-01)。
  const reset = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0))
  return reset.toISOString()
}

function readNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const MENTOR_BUDGET_CAP_ERROR_CODE = BUDGET_CAP_ERROR_CODE
export const MENTOR_SESSION_FAILED_ERROR_CODE = SESSION_FAILED_ERROR_CODE
