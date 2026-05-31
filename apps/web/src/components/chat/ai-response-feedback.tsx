'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import type { AiResponseFeedbackChatContext, AiResponseFeedbackReason } from '@/types'

interface AiResponseFeedbackProps {
  messageId: string
  messagePreview: string
  chatContext: AiResponseFeedbackChatContext
  contextId?: string | null
}

const NEGATIVE_REASONS: { value: AiResponseFeedbackReason; label: string }[] = [
  { value: 'off_topic', label: '的外れ' },
  { value: 'already_known', label: '既に知っている' },
  { value: 'unclear', label: '分かりにくい' },
  { value: 'too_simple', label: '簡単すぎる' },
  { value: 'too_complex', label: '難しすぎる' },
  { value: 'repetitive', label: '同じ説明の繰り返し' },
]

export function AiResponseFeedback({
  messageId,
  messagePreview,
  chatContext,
  contextId,
}: AiResponseFeedbackProps) {
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null)
  const [showReasons, setShowReasons] = useState(false)
  const [sending, setSending] = useState(false)

  const sendFeedback = async (
    rating: 'positive' | 'negative',
    reason?: AiResponseFeedbackReason,
  ) => {
    if (sending) return
    setSending(true)

    try {
      await fetch('/api/feedback/ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_context: chatContext,
          context_id: contextId ?? null,
          message_id: messageId,
          rating,
          reason: reason ?? null,
          assistant_message_preview: messagePreview.slice(0, 200),
        }),
      })
    } catch {
      // non-blocking
    } finally {
      setSending(false)
    }
  }

  const handlePositive = () => {
    setSubmitted('positive')
    void sendFeedback('positive')
  }

  const handleNegative = () => {
    setSubmitted('negative')
    setShowReasons(true)
  }

  const handleReasonSelect = (reason: AiResponseFeedbackReason) => {
    setShowReasons(false)
    void sendFeedback('negative', reason)
  }

  if (submitted === 'positive') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-1 text-[11px] text-slate-400 dark:text-slate-500"
      >
        ありがとうございます
      </motion.div>
    )
  }

  return (
    <div className="mt-1">
      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1"
          >
            <button
              type="button"
              onClick={handlePositive}
              disabled={sending}
              aria-label="良い回答"
              className="rounded-lg p-1 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNegative}
              disabled={sending}
              aria-label="改善が必要な回答"
              className="rounded-lg p-1 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ) : showReasons ? (
          <motion.div
            key="reasons"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-1.5"
          >
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              どのような問題がありましたか？
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NEGATIVE_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleReasonSelect(r.value)}
                  disabled={sending}
                  className="rounded-full border border-red-200 bg-red-50/80 px-2.5 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="thanks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] text-slate-400 dark:text-slate-500"
          >
            フィードバックを記録しました。次回の回答に反映します。
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
