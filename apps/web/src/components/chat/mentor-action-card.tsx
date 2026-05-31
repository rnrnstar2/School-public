'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  SkipForward,
  Plus,
  ListOrdered,
  X,
  Loader2,
  RefreshCw,
  Focus,
  Gauge,
  Sparkles,
  Send,
  Replace,
} from 'lucide-react'
import type { MentorAction, MentorActionType } from '@/lib/mentor/mentor-actions'
import { mentorActionLabels } from '@/lib/mentor/mentor-actions'
import { getAiToolById } from '@/lib/atoms/ai-tools-catalog'

interface MentorActionCardProps {
  action: MentorAction
  lessonId?: string
  planId?: string
  onExecuted?: (action: MentorAction, success: boolean) => void
}

const actionIcons: Record<MentorActionType, typeof ArrowRight> = {
  change_next_lesson: ArrowRight,
  skip_lesson: SkipForward,
  add_lesson: Plus,
  reorder_schedule: ListOrdered,
  recompile_plan: RefreshCw,
  focus_lesson: Focus,
  adjust_difficulty: Gauge,
  recommend_tool: Sparkles,
  delegate_to_tool: Send,
  switch_tool: Replace,
}

const actionColors: Record<MentorActionType, { bg: string; border: string; icon: string; button: string }> = {
  change_next_lesson: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800/50',
    icon: 'text-amber-600 dark:text-amber-400',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  skip_lesson: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800/50',
    icon: 'text-orange-600 dark:text-orange-400',
    button: 'bg-orange-600 hover:bg-orange-700',
  },
  add_lesson: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800/50',
    icon: 'text-emerald-600 dark:text-emerald-400',
    button: 'bg-emerald-600 hover:bg-emerald-700',
  },
  reorder_schedule: {
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-800/50',
    icon: 'text-violet-600 dark:text-violet-400',
    button: 'bg-violet-600 hover:bg-violet-700',
  },
  recompile_plan: {
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-800/50',
    icon: 'text-sky-600 dark:text-sky-400',
    button: 'bg-sky-600 hover:bg-sky-700',
  },
  focus_lesson: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    border: 'border-indigo-200 dark:border-indigo-800/50',
    icon: 'text-indigo-600 dark:text-indigo-400',
    button: 'bg-indigo-600 hover:bg-indigo-700',
  },
  adjust_difficulty: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800/50',
    icon: 'text-rose-600 dark:text-rose-400',
    button: 'bg-rose-600 hover:bg-rose-700',
  },
  recommend_tool: {
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/30',
    border: 'border-fuchsia-200 dark:border-fuchsia-800/50',
    icon: 'text-fuchsia-600 dark:text-fuchsia-400',
    button: 'bg-fuchsia-600 hover:bg-fuchsia-700',
  },
  delegate_to_tool: {
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800/50',
    icon: 'text-teal-600 dark:text-teal-400',
    button: 'bg-teal-600 hover:bg-teal-700',
  },
  switch_tool: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    border: 'border-cyan-200 dark:border-cyan-800/50',
    icon: 'text-cyan-600 dark:text-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-700',
  },
}

function resolveToolLabel(toolId: string, fallbackLabel?: string): string {
  if (fallbackLabel && fallbackLabel.trim().length > 0) return fallbackLabel
  return getAiToolById(toolId)?.label ?? toolId
}

function getActionDescription(action: MentorAction): string {
  switch (action.type) {
    case 'change_next_lesson':
      return `次のレッスンを「${action.targetLessonTitle}」に変更します`
    case 'skip_lesson':
      return `「${action.targetLessonTitle}」をスキップします`
    case 'add_lesson':
      return `「${action.targetLessonTitle}」をスケジュールに追加します`
    case 'reorder_schedule':
      return `レッスンの順序を変更します: ${action.newOrder.map((o) => o.lessonTitle).join(' → ')}`
    case 'recompile_plan':
      return 'プランを再生成して、進捗に合わせた新しいプランを作成します'
    case 'focus_lesson':
      return `「${action.targetLessonTitle}」に集中して取り組みます`
    case 'adjust_difficulty':
      return action.direction === 'easier'
        ? '難易度を下げて、より基礎的な内容でプランを再構成します'
        : '難易度を上げて、より発展的な内容でプランを再構成します'
    case 'recommend_tool':
      return `このステップに「${resolveToolLabel(action.toolId, action.toolLabel)}」を使ってみることを推薦します`
    case 'delegate_to_tool':
      return `「${resolveToolLabel(action.toolId, action.toolLabel)}」に依頼文を渡してこのステップを任せます`
    case 'switch_tool': {
      const toLabel = resolveToolLabel(action.toToolId, action.toToolLabel)
      const fromLabel = action.fromToolId
        ? resolveToolLabel(action.fromToolId)
        : '(未指定)'
      return `このステップで使うAIツールを「${fromLabel}」から「${toLabel}」へ切り替えます`
    }
  }
}

export function MentorActionCard({ action, lessonId, planId, onExecuted }: MentorActionCardProps) {
  const [status, setStatus] = useState<'pending' | 'executing' | 'done' | 'dismissed'>('pending')
  const [error, setError] = useState<string | null>(null)

  const Icon = actionIcons[action.type]
  const colors = actionColors[action.type]

  const handleExecute = async () => {
    setStatus('executing')
    setError(null)

    try {
      const response = await fetch('/api/mentor/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...action,
          planId,
          lessonId,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(data?.message ?? `エラーが発生しました (${response.status})`)
      }

      setStatus('done')
      onExecuted?.(action, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '実行に失敗しました')
      setStatus('pending')
      onExecuted?.(action, false)
    }
  }

  if (status === 'dismissed') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-2 rounded-xl border ${colors.border} ${colors.bg} p-3`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colors.bg} ${colors.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {mentorActionLabels[action.type]}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {getActionDescription(action)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
            理由: {action.reason}
          </p>

          {error && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          {status === 'pending' && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExecute()}
                className={`inline-flex items-center gap-1 rounded-lg ${colors.button} px-3 py-1.5 text-xs font-medium text-white transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-target`}
              >
                <Check className="h-3 w-3" />
                適用する
              </button>
              <button
                type="button"
                onClick={() => setStatus('dismissed')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-target"
              >
                <X className="h-3 w-3" />
                スキップ
              </button>
            </div>
          )}

          {status === 'executing' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              実行中...
            </div>
          )}

          {status === 'done' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              適用しました
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
