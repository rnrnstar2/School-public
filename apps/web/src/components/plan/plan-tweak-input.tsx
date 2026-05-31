'use client'

import { useCallback, useState } from 'react'
import { CornerDownLeft, Loader2, Sparkles } from 'lucide-react'
import { MentorActionCard } from '@/components/chat/mentor-action-card'
import { BudgetCapBanner } from '@/components/mentor/BudgetCapBanner'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import { parseMentorActions } from '@/lib/mentor/parse-mentor-actions'
import { coerceMentorChatStructuredOutput } from '@/lib/chat/structured-output'
import {
  parseMentorSseErrorEvent,
  type MentorBudgetCapEvent,
} from '@/lib/mentor/sse-events'
import type { MentorAction } from '@/lib/mentor/mentor-actions'
import type { MentorChatStructuredOutput } from '@/types/mentor-chat'
import type { MentorSessionState } from '@/lib/planner/types'

/**
 * Sticky textarea on /plan that lets learners "talk to the plan".
 *
 * Pipes the message into POST /api/mentor/session (coaching surface) so the AI
 * can reply with one or more MENTOR_ACTION simple-tag proposals (recompile,
 * skip, focus, change_next_lesson, add_lesson, reorder_schedule, adjust_difficulty).
 * The user clicks 適用する on a card and that fires /api/mentor/actions, which
 * dispatches `mentor-action-executed` so the page can refresh.
 *
 * TQ-211: Owner Directive #20/#21 — dynamic plan editing input box.
 */

interface PlanTweakInputProps {
  goalSummary: string
  planId?: string | null
  /** Lesson currently in focus (used to give the mentor session lesson context) */
  lessonId?: string | null
  lessonTitle?: string | null
}

interface AssistantBubble {
  id: string
  text: string
  actions: MentorAction[]
  structuredOutput?: MentorChatStructuredOutput | null
}

const PROMPT_HINT_OPTIONS = [
  'このレッスンは飛ばしたい',
  '順番を入れ替えてほしい',
  '間に補習を一つ挟みたい',
  '今のペースだと厳しい、簡単めにしてほしい',
] as const

export function PlanTweakInput({
  goalSummary,
  planId = null,
  lessonId = null,
  lessonTitle = null,
}: PlanTweakInputProps) {
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [bubble, setBubble] = useState<AssistantBubble | null>(null)
  const [error, setError] = useState<string | null>(null)
  // W16-C: budget cap event を受けたとき構造化情報を banner で出すための state。
  // generic な error toast に倒さず、cap/used/projected/reset_at を表示する。
  const [budgetCapEvent, setBudgetCapEvent] = useState<MentorBudgetCapEvent | null>(null)

  const submit = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || streaming) return

    setStreaming(true)
    setError(null)
    setBubble({ id: `tweak-pending-${Date.now()}`, text: '', actions: [] })

    try {
      const requestBody: Record<string, unknown> = {
        goal: goalSummary || '学習相談',
        message: trimmed,
        uiContext: { surface: 'plan-tweak-input' },
      }
      if (lessonId) {
        requestBody.lesson = {
          id: lessonId,
          ...(lessonTitle ? { title: lessonTitle } : { title: lessonId }),
        }
      }

      const response = await fetch('/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(data?.message ?? `エラーが発生しました (${response.status})`)
      }

      if (!response.body) {
        throw new Error('応答が空でした')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let accumulated = ''
      let pendingActions: MentorAction[] = []
      let pendingStructuredOutput: MentorChatStructuredOutput | null = null

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

          let payload: Record<string, unknown>
          try {
            payload = JSON.parse(dataMatch[1].trim()) as Record<string, unknown>
          } catch {
            continue
          }

          const eventName = eventMatch[1].trim()
          if (eventName === 'token' || eventName === 'text-delta') {
            const text = (payload.text as string) ?? ''
            accumulated += text
            setBubble((prev) =>
              prev ? { ...prev, text: accumulated } : prev,
            )
          } else if (eventName === 'actions') {
            const acts = (payload.actions as MentorAction[]) ?? []
            if (acts.length > 0) {
              pendingActions = acts
            }
          } else if (eventName === 'done') {
            pendingStructuredOutput = coerceMentorChatStructuredOutput(payload.structuredOutput)
          } else if (eventName === 'result') {
            // The session payload is persisted server-side already; we don't
            // need to track it on this surface.
            const session = (payload.session as MentorSessionState | null) ?? null
            void session
          } else if (eventName === 'error') {
            // W16-C: `mentor_budget_cap_exceeded` は専用 banner で扱い、generic
            // error toast に倒さない。それ以外の error 系は従来どおり throw。
            const parsedError = parseMentorSseErrorEvent(payload)
            if (parsedError.kind === 'budget_cap') {
              setBudgetCapEvent(parsedError)
              setBubble(null)
              // 親 client (e.g. GoalFirstPlanClient) も banner を出せるように propagate。
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('mentor-budget-cap-exceeded', {
                    detail: parsedError,
                  }),
                )
              }
              return
            }
            throw new Error(parsedError.message)
          }
        }
      }

      const parsed = parseMentorActions(accumulated)
      const finalActions = pendingActions.length > 0 ? pendingActions : parsed.actions
      const cleanText = parsed.cleanText || accumulated.trim()

      setBubble({
        id: `tweak-final-${Date.now()}`,
        text: cleanText,
        actions: finalActions,
        structuredOutput: pendingStructuredOutput,
      })
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '通信エラーが発生しました')
      setBubble(null)
    } finally {
      setStreaming(false)
    }
  }, [goalSummary, lessonId, lessonTitle, streaming])

  const handleActionExecuted = useCallback((action: MentorAction, success: boolean) => {
    if (success) {
      // Lets goal-first-plan-client refresh the page after a recompile/skip etc.
      window.dispatchEvent(
        new CustomEvent('mentor-action-executed', { detail: { action } }),
      )
    }
  }, [])

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void submit(draft)
    },
    [draft, submit],
  )

  return (
    <section
      aria-label="プラン調整インプット"
      data-testid="plan-tweak-input"
      className="sticky bottom-0 z-30 -mx-4 border-t border-orange-200 bg-white/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border md:bg-white md:px-5 md:py-4 md:shadow-sm dark:border-orange-900/40 dark:bg-slate-950/95 md:dark:bg-slate-950/85"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
          <Sparkles className="size-4" />
          メンターに調整を相談
        </div>

        {/* W16-C: Budget cap exceeded banner — 構造化された 429 相当通知 */}
        {budgetCapEvent ? (
          <BudgetCapBanner
            usedUsd={budgetCapEvent.usedUsd}
            capUsd={budgetCapEvent.capUsd}
            projectedUsd={budgetCapEvent.projectedUsd}
            resetAtIso={budgetCapEvent.resetAtIso}
            message={budgetCapEvent.message}
            onDismiss={() => setBudgetCapEvent(null)}
          />
        ) : null}

        {bubble ? (
          <div
            className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3 text-sm leading-7 text-slate-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-slate-100"
            data-testid="plan-tweak-response"
          >
            {bubble.text ? (
              <MarkdownRenderer content={bubble.text} />
            ) : streaming ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="size-3 animate-spin" />
                AIが提案をまとめています...
              </span>
            ) : null}
            {bubble.actions.length > 0 ? (
              <div className="mt-2 space-y-2">
                {bubble.actions.map((action, idx) => (
                  <MentorActionCard
                    key={`tweak-action-${idx}`}
                    action={action}
                    planId={planId ?? undefined}
                    lessonId={lessonId ?? undefined}
                    onExecuted={handleActionExecuted}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-2">
          <label className="block">
            <span className="sr-only">プランの相談</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit(draft)
                }
              }}
              placeholder="例: 「最初の3つの順番を入れ替えたい」「ここに補習を1つ追加して」"
              rows={2}
              disabled={streaming}
              data-testid="plan-tweak-textarea"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 placeholder:text-slate-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-orange-500 dark:focus:ring-orange-500"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_HINT_OPTIONS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => {
                    setDraft(hint)
                    void submit(hint)
                  }}
                  disabled={streaming}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10"
                >
                  {hint}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={streaming || !draft.trim()}
              data-testid="plan-tweak-submit"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
            >
              {streaming ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  相談中...
                </>
              ) : (
                <>
                  相談する
                  <CornerDownLeft className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
