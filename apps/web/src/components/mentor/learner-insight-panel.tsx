'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Sparkles, Zap } from 'lucide-react'
import type { LearnerUnderstandingProfile } from '@/lib/planner/resume-personalization'

interface LearnerInsightPanelProps {
  understanding: LearnerUnderstandingProfile
  onFeedback: (type: 'remove_blocker' | 'add_strength' | 'remove_weakness', value: string) => Promise<void>
}

export function LearnerInsightPanel({ understanding, onFeedback }: LearnerInsightPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const hasContent =
    understanding.strengths.length > 0 ||
    understanding.weaknesses.length > 0 ||
    understanding.commonBlockers.length > 0

  if (!hasContent) return null

  const handleFeedback = async (type: 'remove_blocker' | 'add_strength' | 'remove_weakness', value: string) => {
    const key = `${type}:${value}`
    setSubmitting(key)
    try {
      await onFeedback(type, value)
      setDismissed((prev) => new Set(prev).add(key))
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-lg"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        )}
        <Eye className="h-3.5 w-3.5 text-sky-500" />
        <span className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
          理解度サマリー
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              AIが把握しているあなたの理解度です。状況が変わった場合はフィードバックできます。
            </p>
            <div className="mt-3 space-y-3">
              {/* Strengths */}
              {understanding.strengths.length > 0 && (
                <div className="rounded-[14px] border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                      得意分野
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {understanding.strengths.map((item) => {
                      const key = `add_strength:${item}`
                      if (dismissed.has(key)) return null
                      return (
                        <li key={item} className="flex items-center justify-between gap-2">
                          <span className="text-xs leading-5 text-emerald-800 dark:text-emerald-100">{item}</span>
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            把握済み
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {understanding.weaknesses.length > 0 && (
                <div className="rounded-[14px] border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-amber-700 dark:text-amber-200">
                      苦手・課題
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {understanding.weaknesses.map((item) => {
                      const key = `remove_weakness:${item}`
                      if (dismissed.has(key)) return null
                      return (
                        <li key={item} className="flex items-center justify-between gap-2">
                          <span className="text-xs leading-5 text-amber-800 dark:text-amber-100">{item}</span>
                          <button
                            type="button"
                            onClick={() => handleFeedback('remove_weakness', item)}
                            disabled={submitting === key}
                            className="shrink-0 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                          >
                            克服済み
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Blockers */}
              {understanding.commonBlockers.length > 0 && (
                <div className="rounded-[14px] border border-red-200 bg-red-50/60 p-3 dark:border-red-900/40 dark:bg-red-950/30">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-red-700 dark:text-red-200">
                      ブロッカー
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {understanding.commonBlockers.map((item) => {
                      const key = `remove_blocker:${item}`
                      if (dismissed.has(key)) return null
                      return (
                        <li key={item} className="flex items-center justify-between gap-2">
                          <span className="text-xs leading-5 text-red-800 dark:text-red-100">{item}</span>
                          <button
                            type="button"
                            onClick={() => handleFeedback('remove_blocker', item)}
                            disabled={submitting === key}
                            className="shrink-0 rounded-full border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
                          >
                            解決済み
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
