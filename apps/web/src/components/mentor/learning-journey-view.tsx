'use client'

import {
  CheckCircle2,
  Circle,
  GraduationCap,
  Map,
  Target,
} from 'lucide-react'
import type { GoalHistory } from '@/types'

export interface LearningJourneyViewProps {
  goals: GoalHistory[]
  currentGoal: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function LearningJourneyView({
  goals,
  currentGoal,
}: LearningJourneyViewProps) {
  const sorted = [...goals].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  )

  if (sorted.length === 0 && !currentGoal) return null

  return (
    <section className="rounded-[26px] border border-slate-200 bg-white/80 p-6 dark:border-slate-700 dark:bg-slate-950/80">
      <div className="flex items-center gap-2">
        <Map className="h-4 w-4 text-orange-500" />
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
          学習ジャーニー
        </p>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
        これまでの歩み
      </h3>

      <div className="relative mt-5">
        {/* Timeline line */}
        <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />

        <div className="space-y-4">
          {sorted.map((entry) => {
            const isCompleted = entry.status === 'completed'
            const isActive = entry.status === 'active'
            return (
              <div key={entry.id} className="relative flex items-start gap-4 pl-0">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white dark:border-slate-950 dark:bg-slate-950">
                  {isCompleted ? (
                    <GraduationCap className="h-4 w-4 text-amber-500" />
                  ) : isActive ? (
                    <Target className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-500 dark:text-slate-600" />
                  )}
                </div>

                {/* Content */}
                <div className={`min-w-0 flex-1 rounded-[16px] border p-3 ${
                  isCompleted
                    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5'
                    : isActive
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                      : 'border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50'
                }`}>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {entry.goal}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      isCompleted
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300'
                        : isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    }`}>
                      {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                      {isCompleted ? '卒業' : isActive ? '進行中' : '中断'}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDate(entry.started_at)}
                      {isCompleted && entry.ended_at && ` → ${formatDate(entry.ended_at)}`}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
