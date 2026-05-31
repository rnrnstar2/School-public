'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Compass,
  Loader2,
  Rocket,
  Sparkles,
} from 'lucide-react'
import type { NextGoalSuggestion } from '@/lib/planner/next-goals'

export interface NextStepsSectionProps {
  trackId?: string | null
  goalSummary: string
  onSelectGoal: (goal: string) => void
}

export function NextStepsSection({
  trackId,
  goalSummary,
  onSelectGoal,
}: NextStepsSectionProps) {
  const [suggestions, setSuggestions] = useState<NextGoalSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchSuggestions() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/planner/next-goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(trackId ? { track_id: trackId } : {}),
            goal_summary: goalSummary,
          }),
        })
        if (!res.ok) throw new Error('fetch failed')
        const data = (await res.json()) as { suggestions: NextGoalSuggestion[] }
        if (!cancelled) setSuggestions(data.suggestions)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchSuggestions()
    return () => { cancelled = true }
  }, [trackId, goalSummary])

  const handleSelect = useCallback(
    (goal: string) => {
      onSelectGoal(goal)
    },
    [onSelectGoal],
  )

  if (error) return null

  return (
    <section className="rounded-[26px] border border-indigo-200 bg-[linear-gradient(135deg,#eef2ff_0%,#e0e7ff_50%,#c7d2fe_100%)] p-6 dark:border-indigo-500/30 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.12)_0%,rgba(79,70,229,0.08)_100%)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-400/20 dark:bg-indigo-500/15">
          <Rocket className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-indigo-500 dark:text-indigo-400">
            NEXT STEPS
          </p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            次のステップ
          </h3>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        卒業おめでとうございます！次は、未習得の能力から順に伸ばしていきましょう。
      </p>

      {loading ? (
        <div className="mt-5 flex items-center justify-center gap-2 py-8 text-sm text-indigo-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          提案を準備中...
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {suggestions.map((s, i) => (
            <motion.button
              key={s.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              onClick={() => handleSelect(s.goal)}
              className="group flex w-full items-start gap-3 rounded-[18px] border border-white/60 bg-white/70 p-4 text-left transition hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-indigo-500/40"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/10">
                {s.type === 'cross-track' ? (
                  <Compass className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {s.goal}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {s.description}
                </p>
                {s.capabilityLabels?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.capabilityLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex rounded-full border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    s.type === 'cross-track'
                      ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300'
                  }`}>
                    {s.type === 'cross-track' ? '別ドメイン' : '同一ドメイン'}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {s.trackLabel}
                  </span>
                </div>
              </div>
              <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-indigo-500 dark:text-slate-600 dark:group-hover:text-indigo-400" />
            </motion.button>
          ))}
        </div>
      )}
    </section>
  )
}
