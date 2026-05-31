import type { GoalProgressTimelineActor, GoalProgressTimelineEvent } from '@/types/goal-tree'

const ACTOR_LABELS: Record<GoalProgressTimelineActor, string> = {
  user: 'User',
  ai: 'AI',
  codex: 'Codex',
  claude: 'Claude',
}

const ACTOR_BADGE_STYLES: Record<GoalProgressTimelineActor, string> = {
  user: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  ai: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200',
  codex: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  claude: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200',
}

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) {
    return value
  }

  return parsed.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProgressTimeline(props: {
  events: GoalProgressTimelineEvent[]
}) {
  if (props.events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
        まだ前進イベントは記録されていません。
      </div>
    )
  }

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-5 before:top-2 before:w-px before:bg-border/80 before:content-['']">
      {props.events.map((event) => (
        <li key={event.id} className="relative flex items-start gap-4">
          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-lg shadow-sm">
            <span aria-hidden="true">{event.icon}</span>
          </div>

          <div className="min-w-0 flex-1 rounded-2xl border border-border bg-background/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ACTOR_BADGE_STYLES[event.actor]}`}
                >
                  {ACTOR_LABELS[event.actor]}
                </span>
                <p className="min-w-0 text-sm font-semibold text-foreground">
                  {event.label}
                </p>
              </div>

              <time
                dateTime={event.occurred_at}
                className="text-xs text-muted-foreground"
              >
                {formatDateTime(event.occurred_at)}
              </time>
            </div>

            {event.description ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {event.description}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
