'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Clock, Flame, Sparkles, X, Zap } from 'lucide-react'
import { useState } from 'react'
import type { LearnerUnderstandingProfile } from '@/lib/planner/resume-personalization'
import {
  WELCOME_BACK_INTENTS,
  type WelcomeBackIntentId,
} from '@/lib/mentor/welcome-back-intents'
import type { LearnerState } from '@/types'
import type { StreakState } from '@/hooks/use-streak-status'

export interface WelcomeBackCardProps {
  understanding: LearnerUnderstandingProfile
  learnerState: LearnerState | null
  lastTaskTitle: string | null
  onResume: () => void
  onDismiss: () => void
  streakDays?: number
  streakState?: StreakState
  todayIntent?: WelcomeBackIntentId
  onSelectIntent?: (intent: WelcomeBackIntentId) => void
}

const LEVEL_LABELS: Record<LearnerUnderstandingProfile['overallLevel'], string> = {
  'first-visit': '',
  early: '学習初期',
  progressing: '順調に進行中',
  experienced: '経験者',
}

const STREAK_BADGES: Record<StreakState, { label: string; className: string } | null> = {
  maintaining: {
    label: 'ストリーク維持中',
    className:
      'border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
  'at-risk': {
    label: 'ストリークが途切れそうです',
    className:
      'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
  },
  broken: {
    label: 'ストリークが途切れました',
    className:
      'border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
  },
  none: null,
}

export function WelcomeBackCard({
  understanding,
  learnerState: _learnerState,
  lastTaskTitle,
  onResume,
  onDismiss,
  streakDays = 0,
  streakState = 'none',
  todayIntent,
  onSelectIntent,
}: WelcomeBackCardProps) {
  const [isEditingIntent, setIsEditingIntent] = useState(false)

  if (understanding.overallLevel === 'first-visit') {
    return null
  }

  const selectedIntent = WELCOME_BACK_INTENTS.find((intent) => intent.id === todayIntent)
  const showIntentButtons = Boolean(onSelectIntent) && (!selectedIntent || isEditingIntent)

  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      aria-label="おかえりなさい"
      className="relative rounded-[20px] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#f0fdf4_100%)] p-4 sm:rounded-[26px] sm:p-6 dark:border-sky-900/40 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.10)_0%,rgba(15,23,42,0.92)_100%)]"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 rounded-full p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        aria-label="閉じる"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-700 dark:text-sky-200">
        <Sparkles className="h-4 w-4" />
        {streakState === 'broken' ? 'また始めましょう' : 'おかえりなさい'}
      </div>

      {/* Streak badge */}
      {STREAK_BADGES[streakState] && (
        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STREAK_BADGES[streakState]!.className}`}>
          <Flame className="h-3 w-3" />
          {STREAK_BADGES[streakState]!.label}
          {streakDays > 0 && ` (${streakDays}日)`}
        </div>
      )}

      {/* Resume / recovery message */}
      <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
        {streakState === 'broken'
          ? 'ストリークが途切れてしまいましたが、大丈夫です。ここから再スタートしましょう！'
          : streakState === 'at-risk'
            ? '前回のアクセスから時間が経っています。今日学習すればストリークを維持できます！'
            : understanding.resumeMessage}
      </p>

      {/* Context summary */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {/* Completed tasks */}
        {understanding.completedTaskCount > 0 && (
          <div className="flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <Zap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-200">
              完了タスク: {understanding.completedTaskCount}件
            </span>
          </div>
        )}

        {/* Level badge */}
        {LEVEL_LABELS[understanding.overallLevel] && (
          <div className="flex items-center gap-2 rounded-[14px] border border-sky-200 bg-sky-50/80 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/30">
            <Clock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
            <span className="text-xs font-medium text-sky-700 dark:text-sky-200">
              {LEVEL_LABELS[understanding.overallLevel]}
            </span>
          </div>
        )}
      </div>

      {/* Blockers */}
      {understanding.commonBlockers.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          前回の詰まり: {understanding.commonBlockers.slice(0, 2).join('、')}
        </p>
      )}

      {/* Adjustment hints */}
      {understanding.adjustmentHints.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {understanding.adjustmentHints.slice(0, 2).map((hint, index) => (
            <span
              key={`wb-hint-${index}`}
              className={
                hint.type === 'blocker'
                  ? 'rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200'
                  : hint.type === 'encouragement'
                    ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200'
              }
            >
              {hint.message}
            </span>
          ))}
        </div>
      )}

      {showIntentButtons && (
        <div className="mt-4 rounded-[18px] border border-sky-200/80 bg-white/75 p-3 dark:border-sky-900/40 dark:bg-slate-900/60">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-sky-700 dark:text-sky-200">
            今日の学習意図
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            今日はどんなペースで進めますか？
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WELCOME_BACK_INTENTS.map((intent) => (
              <button
                key={intent.id}
                type="button"
                onClick={() => {
                  setIsEditingIntent(false)
                  onSelectIntent?.(intent.id)
                }}
                className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm font-medium text-sky-800 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:border-sky-700 dark:hover:bg-sky-900/70"
              >
                <span aria-hidden="true">{intent.emoji}</span>
                <span>{intent.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedIntent && !showIntentButtons && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span aria-hidden="true">{selectedIntent.emoji}</span>
            <span>今日の学習意図: {selectedIntent.label}</span>
          </span>
          {onSelectIntent && (
            <button
              type="button"
              onClick={() => setIsEditingIntent(true)}
              className="text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-800 dark:text-sky-200 dark:hover:text-sky-100"
            >
              変更する
            </button>
          )}
        </div>
      )}

      {/* Resume CTA */}
      {lastTaskTitle && (
        <button
          type="button"
          onClick={onResume}
          className="mt-4 flex w-full items-center justify-between rounded-[16px] border border-sky-300 bg-white/90 p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-400 dark:border-sky-800 dark:bg-slate-900/80 dark:hover:border-sky-600 touch-target"
        >
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-sky-700 dark:text-sky-200">
              {streakState === 'broken' ? 'ここから再スタート' : '前回のタスクを再開'}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {lastTaskTitle}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-sky-500" />
        </button>
      )}
    </motion.section>
  )
}
