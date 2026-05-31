'use client'

/**
 * TQ-204: TodaysTasksCard
 *
 * Renders the "今日のタスク" list (3-5 entries) above the fold on the
 * /plan page. Pure presentational — caller resolves tasks via
 * `resolveTodaysTasks` (see `lib/planner/goal-first/next-action-resolver`).
 */

import { ArrowRight, CalendarDays, Clock3, Lock } from 'lucide-react'
import { Button } from '@school/ui/button'
import { cn } from '@/lib/utils'
import type { TodaysTask } from '@/lib/planner/goal-first/next-action-resolver'

interface TodaysTasksCardProps {
  tasks: TodaysTask[]
  onStartTask: (lessonId: string, nodeId: string) => void
  className?: string
}

function TodaysTasksCard({ tasks, onStartTask, className }: TodaysTasksCardProps) {
  if (tasks.length === 0) {
    return null
  }

  return (
    <section
      aria-label="今日のタスク"
      data-testid="plan-todays-tasks"
      className={cn(
        'rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/85',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
        <CalendarDays className="size-4" />
        今日のタスク
        <span
          className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
          aria-label={`${tasks.length}件`}
        >
          {tasks.length}
        </span>
      </div>

      <ol className="space-y-2.5" role="list">
        {tasks.map((task, index) => (
          <li
            key={task.id}
            data-testid="plan-todays-task-row"
            data-task-ready={task.ready ? 'true' : 'false'}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-3 transition-colors sm:p-4',
              task.ready
                ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70'
                : 'border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40',
            )}
          >
            <div
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                task.ready
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
              aria-hidden="true"
            >
              {task.ready ? index + 1 : <Lock className="size-3.5" />}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm font-semibold',
                  task.ready
                    ? 'text-slate-900 dark:text-slate-50'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {task.title}
              </p>
              {task.description ? (
                <p className="line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {task.description}
                </p>
              ) : null}
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock3 className="size-3" aria-hidden="true" />
                <span>約{task.estimatedMinutes}分</span>
                {!task.ready ? (
                  <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    前提条件待ち
                  </span>
                ) : null}
              </div>
            </div>

            <Button
              size="xs"
              onClick={() => onStartTask(task.lessonId, task.id)}
              disabled={!task.ready}
              data-testid="plan-todays-task-start"
              aria-label={`「${task.title}」を開始する`}
              className="shrink-0"
            >
              開始
              <ArrowRight data-icon="inline-end" className="ml-1 size-3.5" />
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}

export { TodaysTasksCard }
export type { TodaysTasksCardProps }
