'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Bot, CircleHelp, CornerDownLeft, User2, X } from 'lucide-react'
import { AiResponseFeedback } from '@/components/chat/ai-response-feedback'
import { MentorActionCard } from '@/components/chat/mentor-action-card'
import {
  StructuredOutputSections,
  StreamingMessageBubble,
} from '@/components/chat/streaming-message-bubble'
import { Speak2ActionToast } from '@/components/chat/speak2action-toast'
import { useSpeak2ActionCompile } from '@/components/chat/use-speak2action-compile'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import { coerceMentorChatStructuredOutput } from '@/lib/chat/structured-output'
import { PLANNER_GOAL_STORAGE_KEY } from '@/lib/planner/workspace-session'
import { buildSuggestedQuestions } from '@/lib/mentor/suggested-questions'
import { parseMentorActions } from '@/lib/mentor/parse-mentor-actions'
import {
  parseMentorSseErrorEvent,
  type MentorBudgetCapEvent,
} from '@/lib/mentor/sse-events'
import { BudgetCapBanner } from '@/components/mentor/BudgetCapBanner'
import type { MentorAction } from '@/lib/mentor/mentor-actions'
import {
  isActionOnlyStructuredOutput,
  resolveMentorChatFinalContent,
  type MentorChatStructuredOutput,
} from '@/types/mentor-chat'
import type { MentorSessionState } from '@/lib/planner/types'

/* ---------- types ---------- */

interface MentorMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: MentorAction[]
  structuredOutput?: MentorChatStructuredOutput
}

export interface MentorChatLessonContext {
  id: string
  title: string
  summary?: string
}

export interface MentorChatSidebarProps {
  open: boolean
  onClose: () => void
}

/* ---------- custom event for opening from anywhere ---------- */

export interface OpenMentorChatDetail {
  lesson?: MentorChatLessonContext
}

export function dispatchOpenMentorChat(detail?: OpenMentorChatDetail) {
  window.dispatchEvent(new CustomEvent('open-mentor-chat', { detail: detail ?? {} }))
}

function readStoredGoal() {
  if (typeof window === 'undefined') return ''

  try {
    return localStorage.getItem(PLANNER_GOAL_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/* ---------- component ---------- */

export function MentorChatSidebar({ open, onClose }: MentorChatSidebarProps) {
  const [messages, setMessages] = useState<MentorMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingPhase, setStreamingPhase] = useState<'connecting' | 'receiving' | 'finalizing' | null>(null)
  const [streamingStructuredOutput, setStreamingStructuredOutput] = useState<MentorChatStructuredOutput | null>(null)
  const [streamingActionsReceived, setStreamingActionsReceived] = useState(false)
  const [lessonContext, setLessonContext] = useState<MentorChatLessonContext | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [loadingSuggestedQuestions, setLoadingSuggestedQuestions] = useState(false)
  // W69: budget cap event を受けたとき構造化情報を banner で出すための state。
  // generic な error toast に倒さず、cap/used/projected/reset_at を表示する。
  const [budgetCapEvent, setBudgetCapEvent] = useState<MentorBudgetCapEvent | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastSuggestedQuestionKeyRef = useRef<string | null>(null)
  const {
    toast: speak2ActionToast,
    resetRound: resetSpeak2ActionRound,
    compileStructuredOutput,
  } = useSpeak2ActionCompile({
    sourceKind: lessonContext?.id ? 'lesson_chat' : 'mentor_chat',
    lessonId: lessonContext?.id,
  })

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, streamingText])

  // focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [open])

  // close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Listen for custom open-mentor-chat events (e.g. from lesson pages)
  useEffect(() => {
    function handleOpenEvent(e: Event) {
      const detail = (e as CustomEvent<OpenMentorChatDetail>).detail
      if (detail?.lesson) {
        setLessonContext(detail.lesson)
      }
    }
    window.addEventListener('open-mentor-chat', handleOpenEvent)
    return () => window.removeEventListener('open-mentor-chat', handleOpenEvent)
  }, [])

  const clearLessonContext = useCallback(() => {
    setLessonContext(null)
  }, [])

  const handleActionExecuted = useCallback((_action: MentorAction, success: boolean) => {
    if (success) {
      // Dispatch a custom event so parent components (e.g. planner dashboard) can refresh plan data
      window.dispatchEvent(new CustomEvent('mentor-action-executed', { detail: { action: _action } }))
    }
  }, [])

  useEffect(() => {
    if (!open) {
      lastSuggestedQuestionKeyRef.current = null
      setSuggestedQuestions([])
      setLoadingSuggestedQuestions(false)
      return
    }

    if (messages.length > 0 || streaming) {
      setLoadingSuggestedQuestions(false)
      return
    }

    const goalText = readStoredGoal()
    const requestKey = JSON.stringify({
      lessonId: lessonContext?.id ?? null,
      goalText,
    })

    if (lastSuggestedQuestionKeyRef.current === requestKey) {
      return
    }

    lastSuggestedQuestionKeyRef.current = requestKey

    const params = new URLSearchParams()
    if (lessonContext?.id) {
      params.set('lessonId', lessonContext.id)
    }
    if (goalText.trim()) {
      params.set('goalText', goalText)
    }

    const controller = new AbortController()
    const endpoint = params.toString()
      ? `/api/planner/mentor-chat/suggested-questions?${params.toString()}`
      : '/api/planner/mentor-chat/suggested-questions'
    setLoadingSuggestedQuestions(true)

    void fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`suggested-questions:${response.status}`)
        }

        const data = await response.json() as { questions?: unknown }
        const fallbackQuestions = buildSuggestedQuestions({
          lessonContext,
          goalText,
        })

        setSuggestedQuestions(
          Array.isArray(data.questions) && data.questions.every((question) => typeof question === 'string')
            ? data.questions.slice(0, 3)
            : fallbackQuestions,
        )
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }

        console.error('Failed to load mentor suggested questions', error)
        setSuggestedQuestions(buildSuggestedQuestions({
          lessonContext,
          goalText,
        }))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSuggestedQuestions(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [lessonContext, messages.length, open, streaming])

  useEffect(() => {
    if (!open) {
      return
    }

    const goalText = readStoredGoal().trim() || '学習相談'
    const controller = new AbortController()

    void fetch(`/api/mentor/session?goal=${encodeURIComponent(goalText)}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`mentor-session:${response.status}`)
        }

        const data = await response.json() as { session?: MentorSessionState | null }
        const nextSession = data.session ?? null

        if (!nextSession) {
          setSessionId(null)
          setMessages([])
          return
        }

        setSessionId(nextSession.id ?? null)
        setMessages(
          nextSession.messages
            .filter((message) => message.role === 'assistant' || message.role === 'user')
            .map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
            })),
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSessionId(null)
        }
      })

    return () => {
      controller.abort()
    }
  }, [open])

  const handleSend = useCallback(async (content?: string) => {
    const trimmed = (content ?? draft).trim()
    if (!trimmed || streaming) return

    const userMessage: MentorMessage = {
      id: `mentor-user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setDraft('')
    resetSpeak2ActionRound()
    setStreaming(true)
    setStreamingText('')
    setStreamingPhase('connecting')
    setStreamingStructuredOutput(null)
    setStreamingActionsReceived(false)

    try {
      // Read goal from workspace snapshot
      const goal = readStoredGoal().trim() || '学習相談'

      const requestBody: Record<string, unknown> = {
        goal,
        message: trimmed,
        sessionId,
        uiContext: {
          surface: 'mentor-sidebar',
        },
      }

      // Include lesson context if available
      if (lessonContext) {
        requestBody.lesson = {
          id: lessonContext.id,
          title: lessonContext.title,
          ...(lessonContext.summary ? { summary: lessonContext.summary } : {}),
        }
      }

      const response = await fetch('/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })

        while (true) {
          const boundaryIndex = sseBuffer.indexOf('\n\n')
          if (boundaryIndex < 0) break

          const eventText = sseBuffer.slice(0, boundaryIndex).trim()
          sseBuffer = sseBuffer.slice(boundaryIndex + 2)

          if (!eventText) continue

          const eventMatch = eventText.match(/^event:\s*(.+)$/m)
          const dataMatch = eventText.match(/^data:\s*(.+)$/m)
          if (!eventMatch || !dataMatch) continue

          const eventName = eventMatch[1].trim()
          let payload: Record<string, unknown>
          try {
            payload = JSON.parse(dataMatch[1].trim()) as Record<string, unknown>
          } catch {
            continue
          }

          if (eventName === 'transport') {
            setStreamingPhase('receiving')
          } else if (eventName === 'token' || eventName === 'text-delta') {
            const text = (payload.text as string) ?? ''
            accumulated += text
            setStreamingText(accumulated)
          } else if (eventName === 'actions') {
            // Server-detected mentor actions — attach to assistant message
            const acts = (payload.actions as MentorAction[]) ?? []
            if (acts.length > 0) {
              pendingActions = acts
              setStreamingActionsReceived(true)
            }
          } else if (eventName === 'done') {
            pendingStructuredOutput = coerceMentorChatStructuredOutput(payload.structuredOutput)
            setStreamingStructuredOutput(pendingStructuredOutput)
            setStreamingPhase('finalizing')
          } else if (eventName === 'result') {
            pendingSession = (payload.session as MentorSessionState | null) ?? null
          } else if (eventName === 'error') {
            // W69: `mentor_budget_cap_exceeded` は専用 banner で扱い、generic
            // error toast に倒さない。それ以外の error 系は従来どおり throw。
            const parsedError = parseMentorSseErrorEvent(payload)
            if (parsedError.kind === 'budget_cap') {
              setBudgetCapEvent(parsedError)
              // banner を出す代わりに stream をクリーンに終端する。
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
        const assistantMessage: MentorMessage = {
          id: `mentor-assistant-${Date.now()}`,
          role: 'assistant',
          content: finalContent ?? '',
          actions: actionsReceived ? pendingActions : undefined,
          structuredOutput: pendingStructuredOutput ?? undefined,
        }
        const finalMessages = [...updatedMessages, assistantMessage]
        setMessages(finalMessages)
      }

      if (pendingStructuredOutput) {
        void compileStructuredOutput(pendingStructuredOutput)
      }
    } catch (err) {
      const errorMessage: MentorMessage = {
        id: `mentor-error-${Date.now()}`,
        role: 'assistant',
        content: `エラー: ${err instanceof Error ? err.message : '通信エラーが発生しました'}`,
      }
      const errorMessages = [...updatedMessages, errorMessage]
      setMessages(errorMessages)
    } finally {
      setStreaming(false)
      setStreamingText('')
      setStreamingPhase(null)
      setStreamingStructuredOutput(null)
      setStreamingActionsReceived(false)
    }
  }, [draft, streaming, messages, lessonContext, sessionId])

  const handleSuggestedQuestionClick = useCallback((question: string) => {
    setDraft(question)
    void handleSend(question)
  }, [handleSend])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />

          {/* Sidebar */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-label="メンターチャット"
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl sm:w-[400px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">メンター</h2>
                  <p className="text-xs text-muted-foreground">学習の相談・質問</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="メンターチャットを閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lesson context indicator */}
            {lessonContext && (
              <div className="flex items-center gap-2 border-b border-border bg-indigo-50 px-4 py-2 dark:bg-indigo-950/30">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
                <p className="min-w-0 flex-1 truncate text-xs text-indigo-700 dark:text-indigo-200">
                  {lessonContext.title}
                </p>
                <button
                  type="button"
                  onClick={clearLessonContext}
                  className="shrink-0 rounded p-0.5 text-indigo-400 transition hover:text-indigo-600 dark:hover:text-indigo-200"
                  aria-label="レッスンコンテキストを解除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* W69: Budget cap exceeded banner — 構造化された 429 相当通知 */}
            {budgetCapEvent && (
              <div className="border-b border-border px-4 py-3">
                <BudgetCapBanner
                  usedUsd={budgetCapEvent.usedUsd}
                  capUsd={budgetCapEvent.capUsd}
                  projectedUsd={budgetCapEvent.projectedUsd}
                  resetAtIso={budgetCapEvent.resetAtIso}
                  message={budgetCapEvent.message}
                  onDismiss={() => setBudgetCapEvent(null)}
                />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite" aria-label="メンターメッセージ">
              {messages.length === 0 && !streaming && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-500/15">
                    <Bot className="h-7 w-7 text-orange-600 dark:text-orange-300" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">AIメンターに相談</p>
                  <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
                    学習プランの相談、レッスンの質問、ヒアリングの続きなど何でも聞けます。
                  </p>
                  <div className="mt-6 flex w-full max-w-[320px] flex-col gap-2 text-left">
                    <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                      Suggested Questions
                    </p>
                    {loadingSuggestedQuestions && (
                      <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-xs leading-5 text-muted-foreground">
                        今の状況に合わせた問いを準備しています...
                      </div>
                    )}
                    {!loadingSuggestedQuestions && suggestedQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => handleSuggestedQuestionClick(question)}
                        className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left text-sm leading-6 text-foreground transition hover:border-orange-300 hover:bg-orange-50/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10"
                      >
                        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" />
                        <span>{question}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => {
                const isAssistant = message.role === 'assistant'
                const parsed = isAssistant ? parseMentorActions(message.content) : null
                const actions = message.actions ?? parsed?.actions ?? []
                const displayContent = isAssistant
                  ? resolveMentorChatFinalContent({
                      streamedText: parsed?.cleanText ?? message.content,
                      structuredOutput: message.structuredOutput,
                      actionsReceived: actions.length > 0,
                    })
                  : message.content
                const isActionOnlyMessage = isAssistant
                  && actions.length > 0
                  && (
                    isActionOnlyStructuredOutput(message.structuredOutput)
                    || ((!message.structuredOutput) && !(parsed?.cleanText ?? message.content).trim())
                  )

                return (
                  <div key={message.id} className={`flex gap-3 ${isAssistant ? 'items-start' : 'justify-end'}`}>
                    {isAssistant && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className={isAssistant ? 'max-w-[85%]' : ''}>
                      {(!isAssistant || !isActionOnlyMessage) && (
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-7 ${
                            isAssistant
                              ? 'border border-border bg-[var(--surface-strong,theme(colors.slate.50))] text-foreground dark:bg-slate-900/60'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {isAssistant ? (
                            <>
                              <MarkdownRenderer content={displayContent ?? message.content} />
                              <StructuredOutputSections structuredOutput={message.structuredOutput} />
                            </>
                          ) : (
                            message.content
                          )}
                        </div>
                      )}
                      {isAssistant && actions.length > 0 && (
                        <div className="mt-1.5 space-y-1.5">
                          {actions.map((action, idx) => (
                            <MentorActionCard
                              key={`${message.id}-action-${idx}`}
                              action={action}
                              onExecuted={handleActionExecuted}
                            />
                          ))}
                        </div>
                      )}
                      {isAssistant && !streaming && !isActionOnlyMessage && (
                        <AiResponseFeedback
                          messageId={message.id}
                          messagePreview={message.content}
                          chatContext="mentor"
                        />
                      )}
                    </div>
                    {!isAssistant && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <User2 className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                )
              })}

              <StreamingMessageBubble
                text={streamingText || null}
                active={streaming}
                phase={streamingPhase}
                variant="orange"
                structuredOutput={streamingStructuredOutput}
                actionsReceived={streamingActionsReceived}
              />

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleSend()
                }}
              >
                <label className="block">
                  <span className="sr-only">メンターへの相談</span>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder={lessonContext ? `「${lessonContext.title}」について質問...` : '学習の相談やレッスンの質問を入力...'}
                    rows={2}
                    disabled={streaming}
                    className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none disabled:opacity-50 dark:focus:border-orange-500 dark:focus:ring-orange-500"
                  />
                </label>
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={streaming || !draft.trim()}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-orange-500 dark:hover:bg-orange-600"
                  >
                    相談する
                    <CornerDownLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </motion.aside>
        </>
      )}
      <Speak2ActionToast toast={speak2ActionToast} />
    </AnimatePresence>
  )
}
