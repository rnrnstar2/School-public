'use client'

import { cn } from '@/lib/utils'

interface PlanProgressBarProps {
  completed: number
  total: number
  className?: string
}

function PlanProgressBar({ completed, total, className }: PlanProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`進捗: ${completed}/${total} 完了`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            pct === 100
              ? 'bg-emerald-500 dark:bg-emerald-400'
              : 'bg-primary dark:bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {completed}/{total}
      </span>
    </div>
  )
}

export { PlanProgressBar }
export type { PlanProgressBarProps }
