'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import {
  resolveMentorChatFinalContent,
  type MentorChatStructuredOutput,
} from '@/types/mentor-chat'

export type StreamingPhase = 'connecting' | 'receiving' | 'finalizing'

interface StreamingMessageBubbleProps {
  /** Accumulated text to display */
  text: string | null
  /** Whether the stream is active */
  active: boolean
  /** Current phase of streaming */
  phase?: StreamingPhase | null
  /** Color theme variant */
  variant?: 'orange' | 'indigo'
  /** Structured output shown after the reply body */
  structuredOutput?: MentorChatStructuredOutput | null
  /** Whether action metadata has already been received */
  actionsReceived?: boolean
  /** CTA label for next_action */
  nextActionButtonLabel?: string
}

const phaseLabels: Record<StreamingPhase, string> = {
  connecting: '接続中...',
  receiving: '応答を受信中...',
  finalizing: '整理中...',
}

const variantStyles = {
  orange: {
    icon: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200',
    bubble: 'border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,247,237,0.98)_100%)] shadow-[0_18px_60px_-36px_rgba(249,115,22,0.7)] dark:border-orange-400/20 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.96)_0%,rgba(15,23,42,0.98)_100%)]',
    cursor: 'bg-orange-500 dark:bg-orange-300',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500/85 dark:bg-orange-300/85',
    phaseText: 'text-orange-700 dark:text-orange-200',
    thinkingText: 'text-slate-600 dark:text-slate-300',
  },
  indigo: {
    icon: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300',
    bubble: 'border-indigo-100 bg-indigo-50/50 dark:border-indigo-800/50 dark:bg-indigo-950/30',
    cursor: 'bg-indigo-500',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500/85 dark:bg-indigo-300/85',
    phaseText: 'text-indigo-600 dark:text-indigo-300',
    thinkingText: 'text-slate-600 dark:text-slate-300',
  },
}

const pulseBars = [0, 1, 2, 3, 4]

interface StructuredOutputSectionsProps {
  structuredOutput?: MentorChatStructuredOutput | null
  nextActionButtonLabel?: string
}

const sectionLabelClass = 'inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase'

export function StructuredOutputSections({
  structuredOutput,
  nextActionButtonLabel = 'plan に追加 (TQ-171)',
}: StructuredOutputSectionsProps) {
  if (!structuredOutput) {
    return null
  }

  const decisions = structuredOutput.decisions.filter(Boolean)
  const openQuestions = structuredOutput.open_questions.filter(Boolean)
  const nextQuestion = structuredOutput.next_question?.trim() || null
  const nextAction = structuredOutput.next_action?.trim() || null

  if (!decisions.length && !openQuestions.length && !nextQuestion && !nextAction) {
    return null
  }

  return (
    <div className="mt-4 space-y-3" data-structured-output="true">
      {decisions.length > 0 && (
        <section
          data-structured-output-section="decisions"
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-slate-800 shadow-sm dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-50"
        >
          <p className={`${sectionLabelClass} text-emerald-700 dark:text-emerald-200`}>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            決まったこと
          </p>
          <ul className="mt-2 space-y-1.5 pl-5 text-sm leading-6">
            {decisions.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {openQuestions.length > 0 && (
        <section
          data-structured-output-section="open_questions"
          className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-slate-800 shadow-sm dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50"
        >
          <p className={`${sectionLabelClass} text-amber-700 dark:text-amber-200`}>
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            未決事項
          </p>
          <ul className="mt-2 space-y-1.5 pl-5 text-sm leading-6">
            {openQuestions.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nextQuestion && (
        <section
          data-structured-output-section="next_question"
          className="rounded-2xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-slate-800 shadow-sm dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-50"
        >
          <p className={`${sectionLabelClass} text-sky-700 dark:text-sky-200`}>
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden="true" />
            次の問い
          </p>
          <blockquote className="mt-2 border-l-2 border-sky-400/80 pl-3 text-sm leading-6 text-slate-700 dark:text-sky-100">
            {nextQuestion}
          </blockquote>
        </section>
      )}

      {nextAction && (
        <section
          data-structured-output-section="next_action"
          className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-slate-800 shadow-sm dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-50"
        >
          <p className={`${sectionLabelClass} text-rose-700 dark:text-rose-200`}>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden="true" />
            次の 1 アクション
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-rose-100">{nextAction}</p>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white opacity-60 transition focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none disabled:cursor-not-allowed dark:bg-rose-500"
          >
            {nextActionButtonLabel}
          </button>
        </section>
      )}
    </div>
  )
}

export function StreamingMessageBubble({
  text,
  active,
  phase,
  variant = 'orange',
  structuredOutput,
  actionsReceived = false,
  nextActionButtonLabel,
}: StreamingMessageBubbleProps) {
  const styles = variantStyles[variant]
  const activePhaseLabel = phase ? phaseLabels[phase] : '考え中...'
  const shouldResolveFinalContent = Boolean(text) || Boolean(structuredOutput)
  const finalContent = shouldResolveFinalContent
    ? resolveMentorChatFinalContent({
        streamedText: text,
        structuredOutput,
        actionsReceived,
      })
    : null

  return (
    <AnimatePresence>
      {active && finalContent ? (
        <motion.div
          key="streaming"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          role="status"
          aria-label="AI が応答中"
          data-streaming-indicator="true"
          data-streaming-phase={phase ?? 'receiving'}
          className="flex items-start gap-3"
        >
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10 ${styles.icon}`}
          >
            <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
          </motion.div>
          <motion.div
            layout
            className={`min-w-0 flex-1 overflow-hidden rounded-[20px] border px-4 py-3 text-sm text-foreground sm:rounded-[24px] ${styles.bubble}`}
          >
            <div className="leading-7">
              <MarkdownRenderer content={finalContent} />
              {phase === 'receiving' && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                  className={`ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] ${styles.cursor}`}
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
              <motion.span
                key={activePhaseLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`font-semibold tracking-[0.14em] ${styles.phaseText}`}
              >
                {activePhaseLabel}
              </motion.span>
              <div className="ml-auto flex items-end gap-1.5">
                {pulseBars.map((bar) => (
                  <motion.span
                    key={bar}
                    className={`w-1.5 rounded-full ${styles.bar}`}
                    initial={{ height: 4 }}
                    animate={{ height: [4, 16, 8, 2, 10, 4] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: bar * 0.14 }}
                  />
                ))}
              </div>
            </div>
            <StructuredOutputSections
              structuredOutput={structuredOutput}
              nextActionButtonLabel={nextActionButtonLabel}
            />
          </motion.div>
        </motion.div>
      ) : active && !text ? (
        <motion.div
          key="thinking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-label="AI が考え中"
          data-streaming-indicator="true"
          data-streaming-phase={phase ?? 'connecting'}
          className="flex items-center gap-3"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10 ${styles.icon}`}>
            <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${styles.thinkingText}`}>
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              考え中...
            </motion.span>
            {/*
              TQ-124-03: Dot loader renders immediately (before any token
              arrives) so SP users see motion instead of a frozen screen.
            */}
            <span
              aria-hidden="true"
              className={`inline-flex items-end gap-1 ${styles.phaseText}`}
            >
              {pulseBars.slice(0, 3).map((bar) => (
                <motion.span
                  key={`thinking-dot-${bar}`}
                  className={`h-1.5 w-1.5 rounded-full ${styles.dot}`}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.0, repeat: Infinity, delay: bar * 0.18 }}
                />
              ))}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
