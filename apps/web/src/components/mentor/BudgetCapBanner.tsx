/**
 * BudgetCapBanner — W69 (Audit B4 #2)
 *
 * `/api/mentor/session` SSE が `event: error` で `mentor_budget_cap_exceeded` を
 * 返した時に学習者に **構造化された** 上限到達情報を見せる UI。
 *
 * 表示するもの:
 *   - 当月の使用額 (used) / 上限 (cap) / 投影合計 (projected = used + estimate)
 *   - 次回リセット日 (= 来月 1 日 00:00 UTC)
 *   - `/settings/api-keys` への deep link button (BYOK 切替で枠を回避できる導線)
 *
 * design intent:
 *   - generic toast に倒すと「なぜ動かないのか」「いつ復旧するのか」が学習者に
 *     伝わらず、Owner Q5 の学習体験保護方針と矛盾する。本 banner は明示的に
 *     `429 相当 / 月初リセット日 / 自分の API key へのスイッチ導線` を出す。
 *   - server payload が古く `projectedUsd` が null の場合は `--` 表示で fallback。
 *     (parseMentorSseErrorEvent 側で payload 互換ロジックを吸収済み)
 */

'use client'

import { AlertTriangle, ExternalLink, X } from 'lucide-react'

export interface BudgetCapBannerProps {
  /** Month-to-date spend (USD). */
  usedUsd: number
  /** Cap (USD). */
  capUsd: number
  /** Projected total = usedUsd + estimateUsd. null = legacy payload, render `--`. */
  projectedUsd: number | null
  /** ISO 8601 datetime (UTC) at which the cap window resets. */
  resetAtIso: string
  /** Banner 上に追加表示する server message。 */
  message: string
  /** Optional dismiss handler。omit すると banner は dismiss button を出さない。 */
  onDismiss?: () => void
  /**
   * Override deep link target. Default は `/settings/api-keys` (BYOK 切替面)。
   * `/settings/usage` page が将来追加された際の差し替え点。
   */
  settingsHref?: string
  /** UI label override (test 用)。 */
  settingsLinkLabel?: string
}

const DEFAULT_SETTINGS_HREF = '/settings/api-keys'
const DEFAULT_SETTINGS_LABEL = '設定で API キーを切替える'

export function BudgetCapBanner({
  usedUsd,
  capUsd,
  projectedUsd,
  resetAtIso,
  message,
  onDismiss,
  settingsHref = DEFAULT_SETTINGS_HREF,
  settingsLinkLabel = DEFAULT_SETTINGS_LABEL,
}: BudgetCapBannerProps) {
  const usedLabel = formatUsd(usedUsd)
  const capLabel = formatUsd(capUsd)
  const projectedLabel = projectedUsd === null ? '--' : formatUsd(projectedUsd)
  const resetLabel = formatResetDate(resetAtIso)

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="mentor-budget-cap-banner"
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold leading-5">今月のメンター利用上限に達しました</p>
          <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">{message}</p>

          <dl
            className="grid grid-cols-3 gap-2 rounded-xl bg-white/60 px-3 py-2 text-[11px] leading-4 dark:bg-amber-950/40"
            aria-label="今月のメンター利用状況"
          >
            <div>
              <dt className="text-amber-700/80 dark:text-amber-200/80">使用額</dt>
              <dd className="mt-0.5 font-semibold tabular-nums" data-testid="cap-used">
                {usedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-amber-700/80 dark:text-amber-200/80">投影合計</dt>
              <dd className="mt-0.5 font-semibold tabular-nums" data-testid="cap-projected">
                {projectedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-amber-700/80 dark:text-amber-200/80">上限</dt>
              <dd className="mt-0.5 font-semibold tabular-nums" data-testid="cap-cap">
                {capLabel}
              </dd>
            </div>
          </dl>

          <p className="text-[11px] leading-4 text-amber-800/90 dark:text-amber-200/90">
            次回リセット:{' '}
            <span className="font-semibold tabular-nums" data-testid="cap-reset-at">
              {resetLabel}
            </span>
          </p>

          <a
            href={settingsHref}
            data-testid="cap-settings-link"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20"
          >
            {settingsLinkLabel}
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="バナーを閉じる"
            className="shrink-0 rounded p-1 text-amber-700 transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatResetDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // ja-JP の YYYY/M/D 表記。UTC reset 境界を学習者の locale で表示する。
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}
