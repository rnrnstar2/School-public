'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
} from 'lucide-react'
import type { TrackProgressSummary, TrackRecommendation } from '@/lib/curriculum/multi-track'

export interface TrackProgressCardsProps {
  tracks: TrackProgressSummary[]
  recommendations: TrackRecommendation[]
}

const STATUS_CONFIG = {
  learning: {
    label: '学習中',
    badgeClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200',
    Icon: Target,
  },
  graduated: {
    label: '卒業済み',
    badgeClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300',
    Icon: GraduationCap,
  },
  'not-started': {
    label: '未着手',
    badgeClass:
      'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
    Icon: BookOpen,
  },
} as const

export function TrackProgressCards({ tracks, recommendations }: TrackProgressCardsProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (tracks.length === 0) return null

  const learning = tracks.filter((t) => t.status === 'learning')
  const graduated = tracks.filter((t) => t.status === 'graduated')
  const notStarted = tracks.filter((t) => t.status === 'not-started')

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/90 sm:rounded-[24px] dark:border-slate-700 dark:bg-slate-950/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-[20px] sm:rounded-[24px]"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            トラック別進捗
          </span>
          <div className="flex gap-1.5">
            {learning.length > 0 && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                {learning.length}学習中
              </span>
            )}
            {graduated.length > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                {graduated.length}卒業
              </span>
            )}
          </div>
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
            <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-700">
              {tracks.map((track) => {
                const config = STATUS_CONFIG[track.status]
                const StatusIcon = config.Icon
                return (
                  <div
                    key={track.trackId}
                    className="rounded-[16px] border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {track.label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {track.headline}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${config.badgeClass}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>

                    {/* Progress bar (only for learning/graduated) */}
                    {track.status !== 'not-started' && (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            {track.completedLessons}/{track.totalLessons} レッスン
                          </span>
                          <span>{track.progressPercent}%</span>
                        </div>
                        <div
                          className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"
                          role="progressbar"
                          aria-valuenow={track.completedLessons}
                          aria-valuemin={0}
                          aria-valuemax={track.totalLessons}
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              track.status === 'graduated'
                                ? 'bg-amber-400 dark:bg-amber-500'
                                : 'bg-emerald-400 dark:bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(track.progressPercent, 4)}%` }}
                          />
                        </div>
                        {track.completedModules.length > 0 && (
                          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                            完了モジュール: {track.completedModules.join('、')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="mt-1 rounded-[16px] border border-orange-200 bg-orange-50/50 p-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI推薦トラック
                  </div>
                  {recommendations.map((rec) => (
                    <div key={rec.trackId} className="mt-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {rec.label}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {rec.reasons.map((reason, i) => (
                          <li
                            key={i}
                            className="text-xs text-slate-500 dark:text-slate-400"
                          >
                            • {reason}
                          </li>
                        ))}
                      </ul>
                      {rec.transferableSkills > 0 && (
                        <p className="mt-1 text-[11px] text-orange-600 dark:text-orange-300">
                          {rec.transferableSkills}個のスキルが活かせます
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
