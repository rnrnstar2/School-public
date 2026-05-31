'use client'

import { cn } from '@/lib/utils'

export interface GoalSuggestion {
  label: string
  goal: string
  icon: string
  comingSoon?: boolean
}

export const GOAL_SUGGESTIONS: GoalSuggestion[] = [
  { label: 'Web制作', goal: 'AIでポートフォリオやホームページを作りたい', icon: '\u{1F310}' },
  // W49 (2026-05-09) salvaged from TQ-207: マーケター / 個人事業主 beta 向け
  // CRM / LP / SNS chip を Web制作 直後に追加し、初回ユーザーが 1-click で
  // 該当 goal を投入できる状態にする。
  { label: '顧客管理', goal: '顧客管理・フォローアップ web app を作りたい', icon: '\u{1F4C7}' },
  { label: 'LPコピー', goal: 'LP コピーを AI で量産して A/B テストに使いたい', icon: '\u{1F4DD}' },
  { label: 'SNS運用', goal: 'Instagram 投稿バッチを週次で AI 生成したい', icon: '\u{1F4F8}' },
  { label: '業務自動化', goal: 'AIで繰り返し業務を自動化したい', icon: '\u26A1', comingSoon: true },
  { label: 'コンテンツ制作', goal: 'AIで記事・SNS・資料を作りたい', icon: '\u270D\uFE0F', comingSoon: true },
  // TQ-213: P-ENG-PROTOTYPE 一次ペルソナの初手 disabled 解除。
  // 暫定で web-builder anchor を流用 (DEFAULT_PERSONAS_BY_DOMAIN) — 本格対応は TQ-217 (anchor 解体) / TQ-218 (no-code-first atoms)。
  { label: 'アプリ制作', goal: 'AIでアプリのプロトタイプを作りたい', icon: '\u{1F4F1}' },
]

interface GoalSuggestionsProps {
  onSelect: (goal: string) => void
  className?: string
  /**
   * When true the chip group fades out smoothly (CSS transition) instead of
   * unmounting. Used on SP (mobile) planner/chat flows so the "example
   * badges" stop being noisy after the conversation has begun, without a
   * jarring pop-out (TQ-124-01 / Owner directive #17).
   */
  fadedOut?: boolean
}

export function GoalSuggestions({ onSelect, className, fadedOut = false }: GoalSuggestionsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-2 transition-opacity duration-300 ease-out',
        fadedOut ? 'pointer-events-none opacity-0' : 'opacity-100',
        className,
      )}
      role="group"
      aria-label="ゴールの候補"
      aria-hidden={fadedOut || undefined}
      data-state={fadedOut ? 'faded' : 'visible'}
    >
      {GOAL_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => {
            if (!suggestion.comingSoon) {
              onSelect(suggestion.goal)
            }
          }}
          disabled={suggestion.comingSoon || fadedOut}
          aria-disabled={suggestion.comingSoon || fadedOut}
          tabIndex={fadedOut ? -1 : undefined}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2',
            'text-sm font-medium text-foreground transition-all',
            'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'active:scale-[0.97]',
            'dark:hover:bg-primary/10',
            suggestion.comingSoon &&
              'cursor-not-allowed border-dashed text-muted-foreground opacity-70 hover:border-border hover:bg-background hover:shadow-none active:scale-100',
          )}
        >
          <span aria-hidden="true">{suggestion.icon}</span>
          <span>{suggestion.label}</span>
          {suggestion.comingSoon ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              準備中
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
