'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@school/ui/button'
import { GoalSuggestions } from '@/components/onboarding'
import { HearingChatThread } from '@/components/onboarding/hearing-chat-thread'
import { HearingConfirmStep } from '@/components/onboarding/hearing-confirm-step'
import {
  buildHearingPlanDraft,
} from '@/components/onboarding/hearing-onboarding-utils'
import { SubAgentProgressPanel } from '@/components/mentor/SubAgentProgressPanel'
import { BudgetCapBanner } from '@/components/mentor/BudgetCapBanner'
import {
  getCurrentHearingQuestion,
} from '@/lib/planner/hearing'
import { parseSubAgentSseEvent } from '@/lib/mentor/sse-client'
import {
  parseMentorSseErrorEvent,
  type MentorBudgetCapEvent,
} from '@/lib/mentor/sse-events'
import type { SubAgentProgressEvent } from '@/lib/mentor/sub-agents/types'
import type { PlannerHearingSession, PlannerHearingTransport } from '@/lib/planner/types'
import { writePlannerGoalToStorage } from '@/lib/planner/workspace-session'
import type { MentorSessionState, MentorSessionTransport } from '@/lib/planner/types'

type OnboardingStage = 'goal' | 'chat' | 'confirm'

type HearingResultPayload = {
  completed?: boolean
  session?: MentorSessionState | null
}

export function HearingOnboardingClient() {
  const router = useRouter()
  const goalInputRef = useRef<HTMLTextAreaElement>(null)
  const [stage, setStage] = useState<OnboardingStage>('goal')
  const [goalInput, setGoalInput] = useState('')
  const [draftAnswer, setDraftAnswer] = useState('')
  const [session, setSession] = useState<MentorSessionState | null>(null)
  const [transport, setTransport] = useState<PlannerHearingTransport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  // TQ-232: Conductor INVESTIGATE phase の sub-agent fan-out 進捗を貯める。
  // 1 ターンずつ reset したいので advanceHearing 開始時に空配列に戻す。
  const [subAgentEvents, setSubAgentEvents] = useState<SubAgentProgressEvent[]>([])
  // W16-C: budget cap event を受けたとき構造化情報を banner で出すための state。
  // generic な error toast に倒さず、cap/used/projected/reset_at を表示する。
  const [budgetCapEvent, setBudgetCapEvent] = useState<MentorBudgetCapEvent | null>(null)

  const goal = goalInput.trim()
  const currentQuestion = stage === 'chat'
    ? getCurrentHearingQuestion(
      session
        ? ({
            ...session,
            transport: {
              ...session.transport,
              status: session.transport.status === 'error' ? 'unavailable' : session.transport.status,
            },
          } as PlannerHearingSession)
        : null,
    )
    : null
  const planDraft = useMemo(
    () => (goal && session ? buildHearingPlanDraft(goal, session as unknown as PlannerHearingSession) : null),
    [goal, session],
  )

  useEffect(() => {
    if (stage === 'goal') {
      goalInputRef.current?.focus()
    }
  }, [stage])

  const applyHearingResult = useCallback((nextSession: MentorSessionState, completed: boolean) => {
    setSession(nextSession)
    setTransport({
      status: nextSession.transport.status === 'error' ? 'unavailable' : nextSession.transport.status,
      label: nextSession.transport.label,
      message: nextSession.transport.message,
      model: nextSession.transport.model,
      endpoint: nextSession.transport.endpoint,
    })
    setStreamingText('')
    setStage(completed || Boolean(nextSession.completedAt) ? 'confirm' : 'chat')
  }, [])

  const advanceHearing = useCallback(async (answer: string | null) => {
    if (!goal) {
      goalInputRef.current?.focus()
      return
    }

    setError(null)
    setPending(true)
    setStreamingText('')
    setSubAgentEvents([])

    try {
      const response = await fetch('/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          message: answer,
          sessionId: session?.id ?? null,
          uiContext: {
            surface: 'onboarding',
          },
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(body?.message ?? `ヒアリングの取得に失敗しました (${response.status})`)
      }

      if (!response.body) {
        throw new Error('ヒアリングレスポンスが空でした。')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let accumulated = ''
      let pendingResult: HearingResultPayload | null = null

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

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
            const nextTransport = payload.transport as Record<string, unknown> | undefined
            const status = nextTransport?.status

            setTransport({
              status: status === 'live' || status === 'unavailable'
                ? status
                : 'unavailable',
              label: typeof nextTransport?.label === 'string' ? nextTransport.label : 'AIメンター',
              message: typeof nextTransport?.message === 'string' ? nextTransport.message : 'mentor session transport unavailable',
              model: typeof nextTransport?.model === 'string' ? nextTransport.model : undefined,
              endpoint: typeof nextTransport?.endpoint === 'string' ? nextTransport.endpoint : undefined,
            })
            continue
          }

          if (eventName === 'token' || eventName === 'text-delta') {
            const text = typeof payload.text === 'string' ? payload.text : ''
            accumulated += text
            setStreamingText(accumulated)
            continue
          }

          // TQ-232: Conductor INVESTIGATE phase の sub-agent 進捗を listen。
          // 形式違反の event は parseSubAgentSseEvent が null を返すので
          // そのまま無視する。
          if (eventName === 'subagent-progress' || eventName === 'subagent-result') {
            const subEvent = parseSubAgentSseEvent(eventName, payload)
            if (subEvent) {
              setSubAgentEvents((prev) => [...prev, subEvent])
            }
            continue
          }

          if (eventName === 'result') {
            pendingResult = payload as HearingResultPayload
            continue
          }

          if (eventName === 'error') {
            // W16-C: `mentor_budget_cap_exceeded` は専用 banner で扱い、generic
            // error toast に倒さない。それ以外の error 系は従来どおり throw。
            const parsedError = parseMentorSseErrorEvent(payload)
            if (parsedError.kind === 'budget_cap') {
              setBudgetCapEvent(parsedError)
              return
            }
            throw new Error(
              typeof payload.message === 'string'
                ? payload.message
                : 'ヒアリングの進行に失敗しました。',
            )
          }
        }
      }

      const nextSession = pendingResult?.session ?? null

      if (!nextSession) {
        throw new Error('ヒアリング結果を解釈できませんでした。')
      }

      applyHearingResult(
        nextSession,
        Boolean(pendingResult?.completed) || Boolean(nextSession.completedAt),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ヒアリング中にエラーが発生しました。')
    } finally {
      setPending(false)
    }
  }, [applyHearingResult, goal, session])

  const handleGoalSubmit = useCallback(() => {
    if (!goal) {
      goalInputRef.current?.focus()
      return
    }

    writePlannerGoalToStorage(goal)
    setStage('chat')
    void advanceHearing(null)
  }, [advanceHearing, goal])

  const handleAnswerSubmit = useCallback((value?: string) => {
    const nextAnswer = (value ?? draftAnswer).trim()

    if (!nextAnswer || pending) {
      return
    }

    setDraftAnswer('')
    void advanceHearing(nextAnswer)
  }, [advanceHearing, draftAnswer, pending])

  const handleChoiceSelect = useCallback((value: string) => {
    setDraftAnswer(value)
    handleAnswerSubmit(value)
  }, [handleAnswerSubmit])

  const handleCompile = useCallback(async () => {
    if (!planDraft) {
      return
    }

    setError(null)
    setSaving(true)

    try {
      const goalRes = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planDraft.goalRequest),
      })

      if (!goalRes.ok) {
        const body = await goalRes.json().catch(() => null) as { message?: string } | null
        throw new Error(body?.message ?? 'ゴールの保存に失敗しました')
      }

      const goalBody = await goalRes.json().catch(() => null)
      const isPreview = goalBody?.data?.preview === true

      const compileRes = await fetch('/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planDraft.compileRequest),
      })

      const compileBody = await compileRes.json().catch(() => null)

      if (!compileRes.ok && isPreview) {
        const message = typeof compileBody?.message === 'string'
          ? compileBody.message
          : 'プレビュープランの作成に失敗しました'
        throw new Error(message)
      }

      if (!compileRes.ok) {
        console.warn('プラン事前コンパイルをスキップしました')
        router.replace('/plan')
        return
      }

      if (isPreview && compileBody?.data?.plan) {
        try {
          sessionStorage.setItem(
            'school:preview:plan',
            JSON.stringify({
              plan: compileBody.data.plan,
              goal,
              tools: planDraft.summary.preferredTools,
              compiledAt: new Date().toISOString(),
            }),
          )
        } catch (storageError) {
          console.warn('プレビュープラン保存失敗', storageError)
        }

        router.replace('/plan/preview')
        return
      }

      router.replace('/plan')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プラン作成中にエラーが発生しました。')
      setSaving(false)
    }
  }, [goal, planDraft, router])

  const showGoalSuggestions = stage === 'goal'
  const goalHelperHidden = goal.length > 0 || stage !== 'goal'

  return (
    <div className="theme-page-shell min-h-[calc(100vh-4rem)] px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
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

        {error ? (
          <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {stage === 'goal' ? (
          <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/90 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
                  Step 1
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                  どんなものを作りたいですか？
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  最初の一文だけで十分です。次の hearing で背景や制約を詰めます。
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" />
                3〜5問で完了
              </span>
            </div>

            <div className="mt-6">
              <label htmlFor="plan-onboarding-goal" className="block text-sm font-medium text-slate-900 dark:text-white">
                ゴール入力
              </label>
              <textarea
                id="plan-onboarding-goal"
                ref={goalInputRef}
                aria-describedby="plan-submit-helper"
                value={goalInput}
                onChange={(event) => setGoalInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    handleGoalSubmit()
                  }
                }}
                placeholder="例: AIでポートフォリオやホームページを作りたい"
                className="mt-3 min-h-[144px] w-full resize-none rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-500/50 dark:focus:ring-emerald-500/20"
              />
              <p
                id="plan-submit-helper"
                aria-hidden={goalHelperHidden || undefined}
                className="mt-3 text-sm text-slate-500 transition-opacity dark:text-slate-400"
              >
                ゴールを入力すると次へ進めます
              </p>
            </div>

            <GoalSuggestions
              className="mt-5"
              fadedOut={!showGoalSuggestions || goal.length >= 6}
              onSelect={(nextGoal) => {
                setGoalInput(nextGoal)
                goalInputRef.current?.focus()
              }}
            />

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => router.push('/plan')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                type="button"
                data-testid="plan-submit"
                aria-describedby="plan-submit-helper"
                onClick={handleGoalSubmit}
              >
                次へ
              </Button>
            </div>
          </section>
        ) : null}

        {stage === 'chat' ? (
          <>
            {/*
              TQ-232: 「7 体のサブエージェントが動いている」事実を可視化する panel。
              hearing 完了後のターンで Conductor INVESTIGATE phase が走るときだけ
              event が流れてくる。pending 状態で 7 行を先出しすると体感の AI 並列感が
              出るが、現状 Conductor が起動する sub-agent は env 配線次第なので、
              event 受信後に展開する `hideWhenAllPending` 既定値を採用。
            */}
            <SubAgentProgressPanel events={subAgentEvents} />
            <HearingChatThread
              currentQuestion={currentQuestion}
              draft={draftAnswer}
              messages={session?.messages ?? []}
              pending={pending}
              streamingText={streamingText}
              transport={transport}
              onDraftChange={setDraftAnswer}
              onSubmit={() => handleAnswerSubmit()}
              onChoiceSelect={handleChoiceSelect}
            />
          </>
        ) : null}

        {stage === 'confirm' && planDraft ? (
          <HearingConfirmStep
            audience={planDraft.summary.audience}
            blockers={planDraft.summary.blockers}
            deadline={planDraft.summary.deadline}
            goal={planDraft.summary.goal}
            keyPoints={planDraft.summary.keyPoints}
            onBack={() => setStage('chat')}
            onConfirm={handleCompile}
            personaLabels={planDraft.summary.personaLabels}
            pending={saving}
            preferredTools={planDraft.summary.preferredTools}
            transport={planDraft.summary.transport}
          />
        ) : null}
      </div>
    </div>
  )
}
