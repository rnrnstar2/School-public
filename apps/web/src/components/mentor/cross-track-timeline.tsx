'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GraduationCap,
  Map,
  Target,
} from 'lucide-react'
import type { CrossTrackTimelineEntry } from '@/lib/curriculum/multi-track'

export interface CrossTrackTimelineProps {
  entries: CrossTrackTimelineEntry[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const TRACK_COLORS: Record<string, string> = {
  'web-builder-ai': 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200',
  'ai-automation': 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-200',
}

function getTrackBadgeClass(trackId: string | null): string {
  if (!trackId) return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
  return TRACK_COLORS[trackId] ?? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
}

export function CrossTrackTimeline({ entries }: CrossTrackTimelineProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (entries.length === 0) return null

  const trackCount = new Set(entries.map((e) => e.trackId).filter(Boolean)).size

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/90 sm:rounded-[24px] dark:border-slate-700 dark:bg-slate-950/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-[20px] sm:rounded-[24px]"
      >
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            全トラック横断タイムライン
          </span>
          {trackCount > 1 && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/40 dark:text-orange-200">
              {trackCount}トラック
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />

                <div className="space-y-3">
                  {entries.map((entry) => {
                    const isCompleted = entry.status === 'completed'
                    const isActive = entry.status === 'active'
                    return (
                      <div key={entry.goalId} className="relative flex items-start gap-3 pl-0">
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
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
                            {entry.goal}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {entry.trackLabel && (
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTrackBadgeClass(entry.trackId)}`}
                              >
                                {entry.trackLabel}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                isCompleted
                                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300'
                                  : isActive
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                                    : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                              }`}
                            >
                              {isCompleted && <CheckCircle2 className="h-2.5 w-2.5" />}
                              {isCompleted ? '卒業' : isActive ? '進行中' : '中断'}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatDate(entry.startedAt)}
                              {isCompleted && entry.endedAt && ` → ${formatDate(entry.endedAt)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
