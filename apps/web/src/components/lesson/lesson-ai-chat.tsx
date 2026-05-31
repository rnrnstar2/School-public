'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, ChevronDown, CornerDownLeft, MessageCircleQuestion, X } from 'lucide-react'
import { classifyError, getErrorMessage, type AiErrorKind } from '@school/ui/network-status'
import { AiErrorBanner } from '@school/ui/ai-error-banner'
import { AiResponseFeedback } from '@/components/chat/ai-response-feedback'
import { MentorActionCard } from '@/components/chat/mentor-action-card'
import {
  StructuredOutputSections,
  StreamingMessageBubble,
} from '@/components/chat/streaming-message-bubble'
import { Speak2ActionToast } from '@/components/chat/speak2action-toast'
import { useSpeak2ActionCompile } from '@/components/chat/use-speak2action-compile'
import { BudgetCapBanner } from '@/components/mentor/BudgetCapBanner'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import { coerceMentorChatStructuredOutput } from '@/lib/chat/structured-output'
import { PLANNER_GOAL_STORAGE_KEY } from '@/lib/planner/workspace-session'
import {
  parseMentorSseErrorEvent,
  type MentorBudgetCapEvent,
} from '@/lib/mentor/sse-events'
import type { MentorAction } from '@/lib/mentor/mentor-actions'
import {
  isActionOnlyStructuredOutput,
  resolveMentorChatFinalContent,
  type MentorChatStructuredOutput,
} from '@/types/mentor-chat'
import type { MentorSessionState } from '@/lib/planner/types'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  actions?: MentorAction[]
  structuredOutput?: MentorChatStructuredOutput
}

interface FailedSubmission {
  question: string
  payloadMessages: ChatMessage[]
}

interface LessonAiChatProps {
  lessonId: string
  lessonTitle: string
  lessonSummary?: string
  planId?: string
}

type TransportStatus = 'idle' | 'live' | 'unavailable'

export function LessonAiChat({ lessonId, lessonTitle, lessonSummary, planId }: LessonAiChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingStructuredOutput, setStreamingStructuredOutput] = useState<MentorChatStructuredOutput | null>(null)
  const [streamingActionsReceived, setStreamingActionsReceived] = useState(false)
  const [transport, setTransport] = useState<TransportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<AiErrorKind | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [lastSubmittedDraft, setLastSubmittedDraft] = useState<string | null>(null)
  const [lastFailedSubmission, setLastFailedSubmission] = useState<FailedSubmission | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  // W16-C: budget cap event を受けたとき構造化情報を banner で出すための state。
  // generic な error toast に倒さず、cap/used/projected/reset_at を表示する。
  const [budgetCapEvent, setBudgetCapEvent] = useState<MentorBudgetCapEvent | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageCountRef = useRef(0)
  const {
    toast: speak2ActionToast,
    resetRound: resetSpeak2ActionRound,
    compileStructuredOutput,
  } = useSpeak2ActionCompile({
    sourceKind: 'lesson_chat',
    lessonId,
  })

  // Load persisted chat history on first open
  useEffect(() => {
    if (!open || historyLoaded) return
    setHistoryLoaded(true)

    const storedGoal = (typeof window !== 'undefined'
      ? window.localStorage.getItem(PLANNER_GOAL_STORAGE_KEY)
      : '')?.trim() || lessonTitle

    fetch(`/api/mentor/session?goal=${encodeURIComponent(storedGoal)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { session?: MentorSessionState | null } | null) => {
        if (!data?.session) {
          return
        }

        setSessionId(data.session.id ?? null)
        const restored = data.session.messages
          .filter((message) => message.role === 'assistant' || message.role === 'user')
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          }))
        setMessages((prev) => (prev.length === 0 ? restored : [...restored, ...prev]))
        messageCountRef.current = restored.length
      })
      .catch(() => {/* non-blocking */})
  }, [open, historyLoaded, lessonTitle])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, streamingText])

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [open])

  const submitMessage = useCallback(async ({
    question,
    payloadMessages,
    retry = false,
  }: FailedSubmission & {
    retry?: boolean
  }) => {
    if (!retry) {
      setError(null)
      setErrorKind(null)
    }
    resetSpeak2ActionRound()
    setTransport('idle')
    setStreaming(true)
    setStreamingText('')
    setStreamingStructuredOutput(null)
    setStreamingActionsReceived(false)
    setLastSubmittedDraft(question)

    if (retry) {
      setRetrying(true)
    }

    try {
      const storedGoal = (typeof window !== 'undefined'
        ? window.localStorage.getItem(PLANNER_GOAL_STORAGE_KEY)
        : '')?.trim() || lessonTitle

      const response = await fetch('/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: storedGoal,
          message: question,
          sessionId,
          lesson: {
            id: lessonId,
            title: lessonTitle,
            ...(lessonSummary ? { summary: lessonSummary } : {}),
          },
          uiContext: {
            surface: 'lesson-chat',
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(errorData?.message ?? `エラーが発生しました (${response.status})`)
      }

      if (!response.body) {
        throw new Error('レスポンスが空です')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let accumulated = ''
      let pendingActions: MentorAction[] = []
      let pendingStructuredOutput: MentorChatStructuredOutput | null = null
      let pendingSession: MentorSessionState | null = null

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        sseBuffer += decoder.decode(value, { stream: true })

        while (true) {
          const boundaryIndex = sseBuffer.indexOf('\n\n')

          if (boundaryIndex < 0) {
            break
          }

          const eventText = sseBuffer.slice(0, boundaryIndex).trim()
          sseBuffer = sseBuffer.slice(boundaryIndex + 2)

          if (!eventText) {
            continue
          }

          const eventMatch = eventText.match(/^event:\s*(.+)$/m)
          const dataMatch = eventText.match(/^data:\s*(.+)$/m)

          if (!eventMatch || !dataMatch) {
            continue
          }

          const eventName = eventMatch[1].trim()
          let payload: Record<string, unknown>

          try {
            payload = JSON.parse(dataMatch[1].trim()) as Record<string, unknown>
          } catch {
            continue
          }

          if (eventName === 'transport') {
            const t = payload.transport as { status?: string } | undefined
            if (t?.status === 'live') {
              setTransport('live')
            }
          } else if (eventName === 'token' || eventName === 'text-delta') {
            const text = (payload.text as string) ?? ''
            accumulated += text
            setStreamingText(accumulated)
          } else if (eventName === 'actions') {
            // Server-detected mentor actions (already stripped from text)
            const acts = (payload.actions as MentorAction[]) ?? []
            if (acts.length > 0) {
              pendingActions = acts
              setStreamingActionsReceived(true)
            }
          } else if (eventName === 'done') {
            pendingStructuredOutput = coerceMentorChatStructuredOutput(payload.structuredOutput)
            setStreamingStructuredOutput(pendingStructuredOutput)
          } else if (eventName === 'result') {
            pendingSession = (payload.session as MentorSessionState | null) ?? null
          } else if (eventName === 'error') {
            // W16-C: `mentor_budget_cap_exceeded` は専用 banner で扱い、generic
            // error toast に倒さない。それ以外の error 系は従来どおり throw。
            const parsedError = parseMentorSseErrorEvent(payload)
            if (parsedError.kind === 'budget_cap') {
              setBudgetCapEvent(parsedError)
              setError(null)
              setErrorKind(null)
              setRetryCount(0)
              setLastFailedSubmission(null)
              return
            }
            throw new Error(parsedError.message)
          }
        }
      }

      const actionsReceived = pendingActions.length > 0
      const finalContent = resolveMentorChatFinalContent({
        streamedText: accumulated,
        structuredOutput: pendingStructuredOutput,
        actionsReceived,
      })

      if (pendingSession) {
        setSessionId(pendingSession.id ?? null)
        setMessages(
          pendingSession.messages
            .filter((message) => message.role === 'assistant' || message.role === 'user')
            .map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
            })),
        )
      } else if (finalContent !== null || actionsReceived) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: finalContent ?? '',
          actions: actionsReceived ? pendingActions : undefined,
          structuredOutput: pendingStructuredOutput ?? undefined,
        }

        setMessages((prev) => {
          const updated = [
            ...prev,
            assistantMessage,
          ]
          return updated
        })
      }
      if (pendingStructuredOutput) {
        void compileStructuredOutput(pendingStructuredOutput)
      }
      setError(null)
      setErrorKind(null)
      setRetryCount(0)
      setLastFailedSubmission(null)
    } catch (err) {
      const kind = classifyError(err)
      setErrorKind(kind)
      setRetryCount((c) => c + 1)
      setError(err instanceof Error ? err.message : getErrorMessage(kind))
      setLastFailedSubmission({
        question,
        payloadMessages,
      })
    } finally {
      setStreaming(false)
      setStreamingText('')
      setStreamingStructuredOutput(null)
      setStreamingActionsReceived(false)
      setRetrying(false)
    }
  }, [lessonId, lessonSummary, lessonTitle, sessionId])

  const sendMessage = useCallback(async () => {
    const question = draft.trim()

    if (!question || streaming || retrying) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setDraft('')

    await submitMessage({
      question,
      payloadMessages: nextMessages,
    })
  }, [draft, messages, retrying, streaming, submitMessage])

  const retryLastMessage = useCallback(async () => {
    if (!lastFailedSubmission || streaming || retrying) {
      return
    }

    await submitMessage({
      ...lastFailedSubmission,
      retry: true,
    })
  }, [lastFailedSubmission, retrying, streaming, submitMessage])

  if (!open) {
    return (
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        aria-expanded={false}
        className="flex w-full items-center gap-3 rounded-[28px] border border-indigo-200 bg-[linear-gradient(180deg,rgba(238,242,255,0.9),rgba(255,255,255,0.95))] px-5 py-4 text-left shadow-[0_18px_50px_rgba(99,102,241,0.08)] transition hover:border-indigo-300 hover:shadow-[0_24px_60px_rgba(99,102,241,0.12)] dark:border-indigo-800 dark:bg-[linear-gradient(180deg,rgba(49,46,129,0.3),rgba(15,23,42,0.95))] dark:hover:border-indigo-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
          <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">レッスン内容について質問する</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">AIがこのレッスンの内容に沿って回答します</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="region"
      aria-label="レッスン AI チャット"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false)
        }
      }}
      className="rounded-[28px] border border-indigo-200 bg-white shadow-[0_24px_60px_rgba(99,102,241,0.10)] dark:border-indigo-800 dark:bg-slate-950/90"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
            <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">AI に質問</p>
            {transport === 'live' && (
              <p className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-300" role="status">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                接続中
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="チャットを閉じる"
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-target"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* W16-C: Budget cap exceeded banner — 構造化された 429 相当通知 */}
      {budgetCapEvent ? (
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <BudgetCapBanner
            usedUsd={budgetCapEvent.usedUsd}
            capUsd={budgetCapEvent.capUsd}
            projectedUsd={budgetCapEvent.projectedUsd}
            resetAtIso={budgetCapEvent.resetAtIso}
            message={budgetCapEvent.message}
            onDismiss={() => setBudgetCapEvent(null)}
          />
        </div>
      ) : null}

      <div className="max-h-[24rem] overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="チャット履歴">
        {historyLoaded && messageCountRef.current > 0 && messages.length > 0 && messages[0].id.includes('restored') && (
          <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-center text-xs text-indigo-600 dark:border-indigo-800/40 dark:bg-indigo-950/30 dark:text-indigo-300">
            前回の会話を復元しました（{messageCountRef.current}件）
          </div>
        )}

        {/*
          TQ-124-01: Fade the example prompt badges out once the conversation
          starts (first user message or streaming). Keep them mounted so the
          CSS transition is smooth on SP.
        */}
        {(() => {
          const hasStarted = messages.length > 0 || streaming
          return (
            <div
              className={`py-6 text-center transition-opacity duration-300 ease-out ${
                hasStarted ? 'pointer-events-none h-0 overflow-hidden py-0 opacity-0' : 'opacity-100'
              }`}
              aria-hidden={hasStarted || undefined}
              data-state={hasStarted ? 'faded' : 'visible'}
            >
              <Bot className="mx-auto h-8 w-8 text-indigo-300 dark:text-indigo-500" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                このレッスンについて分からないことを聞いてください
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {[
                  'この内容をもっと詳しく教えて',
                  '具体的な例を見せて',
                  'つまずきやすいポイントは？',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    disabled={hasStarted}
                    tabIndex={hasStarted ? -1 : undefined}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300 touch-target sm:py-1.5"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        <div className="space-y-3">
          {messages.map((message) => {
            const actions = message.actions ?? []
            const finalContent = resolveMentorChatFinalContent({
              streamedText: message.content,
              structuredOutput: message.structuredOutput,
              actionsReceived: actions.length > 0,
            })
            const isActionOnlyMessage = actions.length > 0 && isActionOnlyStructuredOutput(message.structuredOutput)

            return (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'items-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div className={message.role === 'assistant' ? 'max-w-[85%]' : ''}>
                  {(message.role !== 'assistant' || !isActionOnlyMessage) && (
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm leading-7 ${
                        message.role === 'assistant'
                          ? 'border border-slate-100 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <>
                          <MarkdownRenderer content={finalContent ?? message.content} />
                          <StructuredOutputSections
                            structuredOutput={message.structuredOutput}
                            nextActionButtonLabel="練習タスクに追加 (TQ-171)"
                          />
                        </>
                      ) : (
                        message.content
                      )}
                    </div>
                  )}
                  {actions.map((action, idx) => (
                    <MentorActionCard
                      key={`${message.id}-action-${idx}`}
                      action={action}
                      lessonId={lessonId}
                      planId={planId}
                    />
                  ))}
                  {message.role === 'assistant' && !streaming && !isActionOnlyMessage && (
                    <AiResponseFeedback
                      messageId={message.id}
                      messagePreview={message.content}
                      chatContext="lesson"
                      contextId={lessonId}
                    />
                  )}
                </div>
              </div>
            )
          })}

          <StreamingMessageBubble
            text={streamingText || null}
            active={streaming}
            phase={streaming
              ? streamingStructuredOutput
                ? 'finalizing'
                : streamingText
                  ? 'receiving'
                  : 'connecting'
              : null}
            variant="indigo"
            structuredOutput={streamingStructuredOutput}
            actionsReceived={streamingActionsReceived}
            nextActionButtonLabel="練習タスクに追加 (TQ-171)"
          />
        </div>

        {error && errorKind && (
          <>
            <AiErrorBanner
              kind={errorKind}
              message={error}
              retryCount={retryCount}
              isRetrying={retrying}
              retriesExhausted={retryCount >= 3}
              retryLabel="もう一度送信"
              onRetry={lastFailedSubmission
                ? () => {
                    void retryLastMessage()
                  }
                : undefined}
              onDismiss={() => {
                setError(null)
                setErrorKind(null)
              }}
              className="mt-3"
            />

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {lastSubmittedDraft
                ? `直前の質問を同じ内容で再送します: 「${lastSubmittedDraft}」`
                : '直前の質問を同じ内容で再送します。'}
            </p>

            {retryCount >= 3 && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                時間をおいてお試しください。
              </p>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        // TQ-124-02: On SP viewports (<640px / sm) keep the composer docked
        // directly below the latest message using sticky positioning and a
        // safe-area inset so keyboards / home-bars do not cover it.
        data-sp-sticky="true"
        className="sticky bottom-0 z-10 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm supports-[padding:env(safe-area-inset-bottom)]:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:static sm:bg-transparent sm:backdrop-blur-none sm:supports-[padding:env(safe-area-inset-bottom)]:pb-3 dark:border-slate-800 dark:bg-slate-950/90 sm:dark:bg-transparent"
        onSubmit={(e) => {
          e.preventDefault()
          void sendMessage()
        }}
      >
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="lesson-chat-input">質問を入力</label>
          <textarea
            id="lesson-chat-input"
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="質問を入力..."
            rows={1}
            disabled={streaming || retrying}
            aria-describedby="lesson-chat-hint"
            className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base leading-6 text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:opacity-60 sm:min-h-[2.5rem] sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-600 dark:focus:ring-indigo-800"
          />
          <span id="lesson-chat-hint" className="sr-only">Enter で送信、Shift+Enter で改行</span>
          <button
            type="submit"
            disabled={streaming || retrying || !draft.trim()}
            aria-label="質問を送信"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-target"
          >
            <CornerDownLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      <Speak2ActionToast toast={speak2ActionToast} />
    </motion.div>
  )
}
