'use client'

import { motion } from 'framer-motion'
import { Sparkles, Target, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ContextBridgeData {
  bridge: string
  focusPoints: string[]
  highlightKeywords: string[]
}

interface ContextualBridgeCardProps {
  lessonId: string
  taskId: string
  taskTitle: string
  taskDo?: string
  taskLearn?: string
  taskWhy?: string
  goal?: string
  milestoneId?: string
  milestoneTitle?: string
  onKeywordsLoaded?: (keywords: string[]) => void
}

export function ContextualBridgeCard({
  lessonId,
  taskId,
  taskTitle,
  taskDo,
  taskLearn,
  taskWhy,
  goal,
  milestoneId,
  milestoneTitle,
  onKeywordsLoaded,
}: ContextualBridgeCardProps) {
  const [data, setData] = useState<ContextBridgeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchBridge() {
      try {
        const res = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/context-bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            taskTitle,
            taskDo,
            taskLearn,
            taskWhy,
            goal,
            milestoneId,
            milestoneTitle,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          // Even on error, try to extract highlightKeywords
          const errBody = await res.json().catch(() => null) as { highlightKeywords?: string[] } | null
          if (errBody?.highlightKeywords?.length) {
            onKeywordsLoaded?.(errBody.highlightKeywords)
          }
          setError(true)
          return
        }

        const result = await res.json() as ContextBridgeData
        setData(result)
        if (result.highlightKeywords?.length) {
          onKeywordsLoaded?.(result.highlightKeywords)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError(true)
        }
      } finally {
        setLoading(false)
      }
    }

    void fetchBridge()
    return () => controller.abort()
  }, [lessonId, taskId, taskTitle, taskDo, taskLearn, taskWhy, goal, milestoneId, milestoneTitle, onKeywordsLoaded])

  if (error || (!loading && !data?.bridge)) {
    return null
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-[24px] border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-800 dark:bg-violet-950/30">
        <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>タスクとの関連性を分析中...</span>
        </div>
      </div>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-[24px] border border-violet-200 bg-[linear-gradient(135deg,rgba(237,233,254,0.8),rgba(243,232,255,0.6))] p-5 shadow-[0_12px_40px_rgba(139,92,246,0.08)] sm:rounded-[28px] sm:p-6 dark:border-violet-800 dark:bg-[linear-gradient(135deg,rgba(46,16,101,0.3),rgba(88,28,135,0.2))]"
      aria-label="タスク文脈ブリッジ"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        あなたのタスクとの接続
      </div>

      <p className="mt-3 text-[15px] leading-8 text-violet-950 dark:text-violet-100 sm:text-base">
        {data!.bridge}
      </p>

      {data!.focusPoints.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            注目ポイント
          </p>
          <ul className="space-y-1.5">
            {data!.focusPoints.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-[16px] border border-violet-200/60 bg-white/70 px-3 py-2 text-sm leading-6 text-violet-900 dark:border-violet-700/40 dark:bg-violet-950/40 dark:text-violet-200"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white dark:bg-violet-500">
                  {i + 1}
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  )
}
