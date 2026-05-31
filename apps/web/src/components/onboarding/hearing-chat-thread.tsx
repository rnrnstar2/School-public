'use client'

import { useEffect, useRef } from 'react'
import { Bot, LoaderCircle, Send, Sparkles, User2 } from 'lucide-react'
import { Button } from '@school/ui/button'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import { cn } from '@/lib/utils'
import type { PlannerConversationMessage, PlannerHearingQuestion, PlannerHearingTransport } from '@/lib/planner/types'

interface HearingChatThreadProps {
  currentQuestion: PlannerHearingQuestion | null
  draft: string
  messages: PlannerConversationMessage[]
  pending: boolean
  streamingText: string
  transport: PlannerHearingTransport | null
  onDraftChange: (value: string) => void
  onSubmit: () => void
  onChoiceSelect: (value: string) => void
}

export function HearingChatThread({
  currentQuestion,
  draft,
  messages,
  pending,
  streamingText,
  transport,
  onDraftChange,
  onSubmit,
  onChoiceSelect,
}: HearingChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, streamingText])

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
            AI Mentor Hearing
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            会話で前提を揃えてからプランを作ります
          </h2>
        </div>
        {transport ? (
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
              transport.status === 'live'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {transport.label}
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[28rem] space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
        aria-live="polite"
        data-testid="hearing-messages"
      >
        {messages.map((message) => {
          const isAssistant = message.role === 'assistant'

          return (
            <div
              key={message.id}
              className={cn('flex gap-3', isAssistant ? 'items-start' : 'justify-end')}
              data-testid="hearing-message"
              data-message-role={message.role}
            >
              {isAssistant ? (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  <Bot className="h-4 w-4" />
                </div>
              ) : null}

              <div
                className={cn(
                  'max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm',
                  isAssistant
                    ? 'border border-slate-200/70 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100'
                    : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
                )}
              >
                {isAssistant ? <MarkdownRenderer content={message.content} /> : message.content}
              </div>

              {!isAssistant ? (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <User2 className="h-4 w-4" />
                </div>
              ) : null}
            </div>
          )
        })}

        {pending ? (
          <div
            className="flex items-start gap-3"
            data-streaming-indicator="true"
            data-streaming-phase={streamingText ? 'receiving' : 'connecting'}
          >
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
              <LoaderCircle className="h-4 w-4 animate-spin" />
            </div>
            <div className="max-w-[85%] rounded-[22px] border border-dashed border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm leading-7 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              {streamingText || 'メンターが次の質問を整理しています...'}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
        {currentQuestion?.choices?.length ? (
          <div className="mb-3 flex flex-wrap gap-2" data-testid="hearing-choices">
            {currentQuestion.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onChoiceSelect(choice)}
                disabled={pending}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
              >
                {choice}
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <label htmlFor="hearing-answer" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            ヒアリング回答
          </label>
          <textarea
            id="hearing-answer"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              }
            }}
            placeholder="自由記述で答えられます。短くても大丈夫です。"
            className="min-h-[104px] w-full resize-none rounded-[18px] border border-transparent bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-emerald-500/50 dark:focus:ring-emerald-500/20"
            disabled={pending}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              `Cmd/Ctrl + Enter` でも送信できます。
            </p>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pending || draft.trim().length === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              回答を送信
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
