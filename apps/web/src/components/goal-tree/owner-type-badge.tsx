import { cn } from '@/lib/utils'
import type { GoalTreeOwnerType } from '@/types/goal-tree'

export interface OwnerTypeBadgeProps {
  ownerType: GoalTreeOwnerType
  size?: 'sm' | 'md'
  showAiDelegatable?: boolean
}

const BADGE_COPY: Record<
  GoalTreeOwnerType,
  { label: string; className: string }
> = {
  user: {
    label: '🧑 あなた',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  ai: {
    label: '🤖 AI',
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  },
  both: {
    label: '🧑🤖 協働',
    className:
      'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200',
  },
  external: {
    label: '🏢 外部',
    className:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  },
  blocked: {
    label: '⛔ ブロック',
    className:
      'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200',
  },
}

const SIZE_STYLES: Record<NonNullable<OwnerTypeBadgeProps['size']>, string> = {
  sm: 'gap-1 px-2 py-0.5 text-[11px] leading-5',
  md: 'gap-1.5 px-2.5 py-1 text-xs leading-5',
}

export function OwnerTypeBadge({
  ownerType,
  size = 'md',
  showAiDelegatable = false,
}: OwnerTypeBadgeProps) {
  const badge = BADGE_COPY[ownerType]
  const aiDelegatable = showAiDelegatable && (ownerType === 'ai' || ownerType === 'both')

  return (
    <span
      data-testid={`owner-type-badge-${ownerType}`}
      className={cn(
        'inline-flex items-center rounded-full border font-semibold whitespace-nowrap',
        SIZE_STYLES[size],
        badge.className,
      )}
    >
      <span>{badge.label}</span>
      {aiDelegatable ? (
        <span
          aria-label="AI 委譲可"
          role="img"
          className="leading-none"
        >
          💫
        </span>
      ) : null}
    </span>
  )
}
