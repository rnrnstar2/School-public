import { Skeleton } from '@school/ui/skeleton'

export function LessonsGridSkeleton() {
  return (
    <div
      aria-label="レッスン一覧を読み込み中"
      className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[20px] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-[26px] sm:p-5 dark:border-slate-700 dark:bg-slate-900/80"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="h-5 w-4/5 rounded-lg" />
            </div>
            <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-full rounded-lg" />
          <Skeleton className="mt-1 h-4 w-3/4 rounded-lg" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
