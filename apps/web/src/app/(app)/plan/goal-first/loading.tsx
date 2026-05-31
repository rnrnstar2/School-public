import { Skeleton } from '@school/ui/skeleton'

/**
 * Loading skeleton for the goal-first plan page.
 * Mirrors the CompiledPlanPage layout: header + progress bar + next action + milestones.
 */
export default function GoalFirstPlanLoading() {
  return (
    <div className="theme-page-shell min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4 rounded-lg" />
          <Skeleton className="h-5 w-full max-w-md rounded-lg" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>

        {/* Next Action Card */}
        <Skeleton className="h-24 w-full rounded-xl" />

        {/* Milestones */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>

        {/* Metadata Footer */}
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  )
}
