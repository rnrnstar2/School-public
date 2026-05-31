'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  History,
  Plus,
  RotateCcw,
  Target,
} from 'lucide-react'
import type { GoalHistory } from '@/types'

export interface GoalHistoryPanelProps {
  goals: GoalHistory[]
  currentGoal: string
  loading: boolean
  onSwitchGoal: (goalHistory: GoalHistory) => void
  onNewGoal: () => void
}

function formatDate(iso: string) {
  const date = new Date(iso)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getStatusBadge(status: GoalHistory['status']) {
  switch (status) {
    case 'active':
      return {
        label: '進行中',
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200',
      }
    case 'completed':
      return {
        label: '完了',
        className:
          'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200',
      }
    case 'archived':
      return {
        label: '中断',
        className:
          'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
      }
  }
}

export function GoalHistoryPanel({
  goals,
  currentGoal,
  loading,
  onSwitchGoal,
  onNewGoal,
}: GoalHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pastGoals = goals.filter((g) => g.status !== 'active')

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-950/70">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-orange-500" />
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            ゴール履歴
          </p>
          {pastGoals.length > 0 && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {pastGoals.length}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              {/* Current goal indicator */}
              {currentGoal && (
                <div className="rounded-[16px] border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900/40 dark:bg-orange-950/30">
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-orange-500" />
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-300">
                      現在のゴール
                    </p>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                    {currentGoal}
                  </p>
                </div>
              )}

              {/* Past goals list */}
              {pastGoals.length > 0 ? (
                <div className="space-y-2">
                  {pastGoals.map((goalEntry) => {
                    const badge = getStatusBadge(goalEntry.status)
                    return (
                      <div
                        key={goalEntry.id}
                        className="group rounded-[16px] border border-slate-200 bg-slate-50/50 p-3 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-600"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                              {goalEntry.goal}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                                <Clock className="h-3 w-3" />
                                {formatDate(goalEntry.started_at)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSwitchGoal(goalEntry)}
                            disabled={loading}
                            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 opacity-0 transition hover:border-orange-300 hover:text-orange-700 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
                          >
                            <RotateCcw className="h-3 w-3" />
                            再開
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                  過去のゴールはまだありません
                </p>
              )}

              {/* New goal button */}
              <button
                type="button"
                onClick={onNewGoal}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-slate-300 bg-white/50 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
              >
                <Plus className="h-4 w-4" />
                新しいゴールを始める
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
