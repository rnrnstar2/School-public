'use client'

import { cn } from '@/lib/utils'
import type { Speak2ActionToastState } from './use-speak2action-compile'

export function Speak2ActionToast({
  toast,
}: {
  toast: Speak2ActionToastState | null
}) {
  if (!toast) {
    return null
  }

  return (
    <div
      role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'fixed right-4 bottom-4 z-[90] max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-lg',
        toast.tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
          : toast.tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
          : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
      )}
    >
      {toast.message}
    </div>
  )
}
