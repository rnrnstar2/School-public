'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { History, Loader2, X } from 'lucide-react'

/**
 * Slide-in drawer that shows the compiled-plan revision chain via
 * GET /api/planner/plan-history?planId=xxx.
 *
 * TQ-211: Wires up the previously-dead /api/planner/plan-history endpoint
 * so learners can audit how their plan evolved over recompiles.
 */

interface PlanHistoryEntry {
  id: string
  title: string
  goal: string
  summary: string | null
  version: number
  parent_plan_id: string | null
  is_active: boolean
  created_at: string
  milestones: Array<{
    id: string
    title: string
    description: string | null
    order_index: number
  }>
}

interface PlanHistoryDrawerProps {
  open: boolean
  planId: string | null
  onClose: () => void
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PlanHistoryDrawer({ open, planId, onClose }: PlanHistoryDrawerProps) {
  const [entries, setEntries] = useState<PlanHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (id: string, signal: AbortSignal) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/planner/plan-history?planId=${encodeURIComponent(id)}`, {
        signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(data?.message ?? `履歴の取得に失敗しました (${response.status})`)
      }

      const json = await response.json() as { data?: PlanHistoryEntry[] }
      const list = Array.isArray(json.data) ? json.data : []
      // Display newest first.
      list.sort((a, b) => b.version - a.version)
      setEntries(list)
    } catch (err) {
      if (signal.aborted) return
      setError(err instanceof Error ? err.message : '通信エラー')
      setEntries([])
    } finally {
      if (!signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open || !planId) return
    const controller = new AbortController()
    void fetchHistory(planId, controller.signal)
    return () => controller.abort()
  }, [open, planId, fetchHistory])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            role="dialog"
            aria-label="プラン改訂履歴"
            data-testid="plan-history-drawer"
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl sm:w-[420px]"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">プラン改訂履歴</h2>
                  <p className="text-xs text-muted-foreground">
                    {planId ? '直近のバージョンから順に表示' : 'プランIDが取得できません'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中...
                </p>
              ) : null}
              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                  {error}
                </p>
              ) : null}
              {!loading && !error && entries.length === 0 && planId ? (
                <p className="text-sm text-muted-foreground">
                  まだ改訂履歴はありません。プランを更新すると、ここにバージョンが並びます。
                </p>
              ) : null}

              {entries.length > 0 ? (
                <ol className="space-y-3">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-2xl border p-3 ${
                        entry.is_active
                          ? 'border-orange-300 bg-orange-50/70 dark:border-orange-700 dark:bg-orange-950/30'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/50'
                      }`}
                      data-testid="plan-history-entry"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          v{entry.version}
                          {entry.is_active ? (
                            <span className="ml-2 inline-flex items-center rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-800 dark:text-orange-100">
                              アクティブ
                            </span>
                          ) : null}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {formatTimestamp(entry.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-50">
                        {entry.title}
                      </p>
                      {entry.summary ? (
                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {entry.summary}
                        </p>
                      ) : null}
                      {entry.milestones.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {entry.milestones.slice(0, 4).map((milestone) => (
                            <li
                              key={milestone.id}
                              className="text-[11px] text-slate-500 dark:text-slate-400"
                            >
                              ・{milestone.title}
                            </li>
                          ))}
                          {entry.milestones.length > 4 ? (
                            <li className="text-[11px] text-slate-400">
                              他 {entry.milestones.length - 4} 件
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
