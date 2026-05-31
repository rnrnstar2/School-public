import { Skeleton } from '@school/ui/skeleton'

/**
 * Skeleton for the MentorWorkspaceView — shown while workspace data loads.
 * Mirrors: progress bar, current-task card, Do/Learn/Why panel, lesson CTA,
 * and mentor chat area.
 */
export function MentorWorkspaceSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 sm:space-y-5 sm:px-0">
      {/* Progress bar area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 rounded-lg" />
          <Skeleton className="h-4 w-16 rounded-lg" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      {/* Current task card */}
      <div className="rounded-[20px] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-[26px] sm:p-6 dark:border-slate-700 dark:bg-slate-900/80">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="mt-3 h-6 w-3/4 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-full rounded-lg" />
        <Skeleton className="mt-1 h-4 w-2/3 rounded-lg" />

        {/* Status buttons row */}
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* Do / Learn / Why panel */}
      <div className="rounded-[20px] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-[26px] sm:p-6 dark:border-slate-700 dark:bg-slate-900/80">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36 rounded-lg" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>
        <div className="mt-4 space-y-3">
          {['w-full', 'w-5/6', 'w-4/5'].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className={`h-4 ${w} rounded-lg`} />
            </div>
          ))}
        </div>
      </div>

      {/* Lesson CTA card */}
      <div className="rounded-[20px] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-[26px] sm:p-6 dark:border-slate-700 dark:bg-slate-900/80">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="mt-3 h-5 w-2/3 rounded-lg" />
        <Skeleton className="mt-4 h-10 w-full rounded-2xl" />
      </div>

      {/* Mentor chat area */}
      <div className="rounded-[20px] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-[26px] sm:p-6 dark:border-slate-700 dark:bg-slate-900/80">
        <Skeleton className="h-5 w-32 rounded-lg" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5 rounded-lg" />
        </div>
        <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
      </div>
    </div>
  )
}
