'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  TrendingUp,
} from 'lucide-react'

interface WeeklyCompletion {
  week: string
  count: number
}

interface TaskPace {
  totalCompleted: number
  totalInProgress: number
  recentSevenDays: number
  avgCompletionHours: number | null
}

interface MilestoneEntry {
  title: string
  status: string
  date: string
}

interface TrackProgress {
  title: string
  total: number
  completed: number
}

interface LearnerAnalyticsData {
  weeklyCompletions: WeeklyCompletion[]
  taskPace: TaskPace
  milestones: MilestoneEntry[]
  streak: number
  trackProgress: TrackProgress[]
  generated_at: string
}

export function LearnerAnalyticsPanel() {
  const [data, setData] = useState<LearnerAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics/learner')
      .then((res) => {
        if (!res.ok) throw new Error('データの取得に失敗しました')
        return res.json()
      })
      .then((d: LearnerAnalyticsData) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[14px] border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        {error}
      </div>
    )
  }

  if (!data) return null

  const maxWeekly = Math.max(...data.weeklyCompletions.map((w) => w.count), 1)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
        <BarChart3 className="h-3.5 w-3.5 text-violet-500" />
        学習アナリティクス
      </div>

      {/* ── Row 1: Streak + Task Pace KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Flame className="h-4 w-4" />}
          label="連続学習"
          value={`${data.streak}日`}
          color="orange"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="タスク完了"
          value={String(data.taskPace.totalCompleted)}
          color="emerald"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="直近7日"
          value={`${data.taskPace.recentSevenDays}件`}
          color="sky"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="平均完了"
          value={
            data.taskPace.avgCompletionHours != null
              ? data.taskPace.avgCompletionHours < 1
                ? `${Math.round(data.taskPace.avgCompletionHours * 60)}分`
                : data.taskPace.avgCompletionHours < 24
                  ? `${data.taskPace.avgCompletionHours}h`
                  : `${Math.round(data.taskPace.avgCompletionHours / 24)}日`
              : '—'
          }
          color="amber"
        />
      </div>

      {/* ── Row 2: Weekly completion bar chart ── */}
      <div className="rounded-[14px] border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/80">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
          レッスン完了 週次推移
        </p>
        <div className="mt-3 flex items-end gap-1.5" style={{ height: 80 }}>
          {data.weeklyCompletions.map((w, i) => {
            const heightPercent = maxWeekly > 0 ? Math.max((w.count / maxWeekly) * 100, 4) : 4
            return (
              <div
                key={w.week}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                  {w.count > 0 ? w.count : ''}
                </span>
                <motion.div
                  className="w-full rounded-t-[4px] bg-[linear-gradient(180deg,#8b5cf6_0%,#a78bfa_100%)] dark:bg-[linear-gradient(180deg,#7c3aed_0%,#6d28d9_100%)]"
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPercent}%` }}
                  transition={{ duration: 0.4, delay: i * 0.05, ease: 'easeOut' }}
                  style={{ minHeight: w.count > 0 ? 4 : 2 }}
                />
                <span className="text-[9px] text-slate-400 dark:text-slate-500">
                  {w.week}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Row 3: Track progress ── */}
      {data.trackProgress.length > 0 && (
        <div className="rounded-[14px] border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/80">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
            トラック別進捗
          </p>
          <div className="mt-2.5 space-y-2">
            {data.trackProgress.map((track) => {
              const percent = Math.round((track.completed / track.total) * 100)
              return (
                <div key={track.title}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200 line-clamp-1">
                      {track.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {track.completed}/{track.total}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      className="h-full rounded-full bg-violet-500 dark:bg-violet-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Row 4: Milestone timeline ── */}
      {data.milestones.length > 0 && (
        <div className="rounded-[14px] border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/80">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
            マイルストーン
          </p>
          <div className="mt-2.5 space-y-2">
            {data.milestones.map((m, i) => {
              const dateStr = new Date(m.date).toLocaleDateString('ja-JP', {
                month: 'short',
                day: 'numeric',
              })
              const isCompleted = m.status === 'completed'
              return (
                <div key={`${m.title}-${i}`} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex flex-col items-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full border-2 ${
                        isCompleted
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                      }`}
                    />
                    {i < data.milestones.length - 1 && (
                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-1">
                      {m.title}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      <Calendar className="mr-0.5 inline h-3 w-3" />
                      {dateStr}
                      {isCompleted && (
                        <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">完了</span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── KpiCard ── */

const KPI_COLORS = {
  orange: {
    border: 'border-orange-200 dark:border-orange-900/40',
    bg: 'bg-orange-50/80 dark:bg-orange-950/30',
    icon: 'text-orange-500',
    value: 'text-orange-700 dark:text-orange-200',
  },
  emerald: {
    border: 'border-emerald-200 dark:border-emerald-900/40',
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    icon: 'text-emerald-500',
    value: 'text-emerald-700 dark:text-emerald-200',
  },
  sky: {
    border: 'border-sky-200 dark:border-sky-900/40',
    bg: 'bg-sky-50/80 dark:bg-sky-950/30',
    icon: 'text-sky-500',
    value: 'text-sky-700 dark:text-sky-200',
  },
  amber: {
    border: 'border-amber-200 dark:border-amber-900/40',
    bg: 'bg-amber-50/80 dark:bg-amber-950/30',
    icon: 'text-amber-500',
    value: 'text-amber-700 dark:text-amber-200',
  },
} as const

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: keyof typeof KPI_COLORS
}) {
  const c = KPI_COLORS[color]
  return (
    <div className={`rounded-[14px] border p-2.5 ${c.border} ${c.bg}`}>
      <div className={`${c.icon}`}>{icon}</div>
      <p className={`mt-1 text-lg font-bold tabular-nums ${c.value}`}>{value}</p>
      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
