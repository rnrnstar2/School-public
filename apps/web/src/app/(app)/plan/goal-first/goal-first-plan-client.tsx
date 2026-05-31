'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@school/ui/button'
import { CompiledPlanPage } from '@/components/plan/compiled-plan-page'
import { GraduationGateSelect } from '@/components/plan/GraduationGateSelect'
import { PlanStepRationaleDrawer } from '@/components/plan/plan-step-rationale-drawer'
import { PlanTweakInput } from '@/components/plan/plan-tweak-input'
import { PlanHistoryDrawer } from '@/components/plan/plan-history-drawer'
import { BudgetCapBanner } from '@/components/mentor/BudgetCapBanner'
import { useRefreshOnVisible } from '@/hooks/use-refresh-on-visible'
import { clearWorkspaceSnapshot, PLANNER_GOAL_STORAGE_KEY } from '@/lib/planner/workspace-session'
import type { MentorBudgetCapEvent } from '@/lib/mentor/sse-events'
import type { NextQuestionOutput } from '@/lib/api/schemas'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import type { NextAction } from '@/lib/planner/goal-first/types'
import type { LearnerUnderstandingProfile } from '@/lib/planner/resume-personalization'
import type { LearnerState, MentorMemory } from '@/types'

interface GoalFirstPlanClientProps {
  goalSummary: string
  plan: AtomCompiledPlan
  nextAction: NextAction | null
  completedNodeIds: string[]
  preferredTools?: string[]
  goalId?: string | null
  planId?: string | null
  initialNextQuestion?: NextQuestionOutput | null
  learnerState?: LearnerState | null
  mentorMemories?: MentorMemory[]
  understanding?: LearnerUnderstandingProfile | null
  /**
   * TQ-251 / TQ-252 — 動的卒業ゲート選択 UI 用 props。
   * page.tsx 側で resolveUserPersonas + graduation_decisions の SSR 取得を行い渡す。
   */
  personaSlug?: string | null
  goalSlug?: string | null
  initialGraduationDecision?: {
    kind: string
    label: string
    artifactValue: string
    explanation: string | null
  } | null
}

/**
 * Client wrapper for CompiledPlanPage that handles navigation actions and
 * mentor-driven plan tweaks.
 *
 * TQ-211 wiring:
 * - PlanTweakInput sticky textarea (Owner Directive #20)
 * - mentor-action-executed listener triggers router.refresh() so server-side
 *   recompiles propagate without waiting for visibility changes
 * - PlanHistoryDrawer button calls /api/planner/plan-history
 */
export function GoalFirstPlanClient({
  goalSummary,
  plan,
  nextAction,
  completedNodeIds,
  preferredTools,
  goalId = null,
  planId = null,
  initialNextQuestion = null,
  learnerState = null,
  mentorMemories = [],
  understanding = null,
  personaSlug = null,
  goalSlug = null,
  initialGraduationDecision = null,
}: GoalFirstPlanClientProps) {
  const [graduationStatus, setGraduationStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; decisionKind: string; label: string }
    | { kind: 'error'; message: string }
  >(
    initialGraduationDecision
      ? {
          kind: 'saved',
          decisionKind: initialGraduationDecision.kind,
          label: initialGraduationDecision.label,
        }
      : { kind: 'idle' },
  )

  const handleGraduationSubmit = useCallback(
    async (payload: {
      option: { kind: string; label: string }
      artifactValue: string
      explanation?: string
    }) => {
      setGraduationStatus({ kind: 'saving' })
      try {
        const response = await fetch('/api/planner/graduation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'gate_decision',
            persona_slug: personaSlug,
            goal_slug: goalSlug,
            plan_id: planId,
            decision: {
              kind: payload.option.kind,
              label: payload.option.label,
              artifact_value: payload.artifactValue,
              explanation: payload.explanation ?? null,
            },
          }),
        })
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string }
            | null
          throw new Error(
            data?.message ?? `卒業ゲートの保存に失敗しました (${response.status})`,
          )
        }
        setGraduationStatus({
          kind: 'saved',
          decisionKind: payload.option.kind,
          label: payload.option.label,
        })
      } catch (err) {
        setGraduationStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : '通信エラーが発生しました',
        })
      }
    },
    [goalSlug, personaSlug, planId],
  )

  const router = useRouter()
  const [isRestarting, setIsRestarting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewSummary, setReviewSummary] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewProposal, setReviewProposal] = useState<{
    summary: string
    rationale: string
    revisedSteps: Array<{
      id: string
      title: string
      description: string
      outcome: string
      purpose: string
      isNew: boolean
      originalStepId?: string
    }>
    removedStepIds: string[]
  } | null>(null)
  const [isApplyingRevision, setIsApplyingRevision] = useState(false)
  const [recompileBanner, setRecompileBanner] = useState<string | null>(null)
  const recompileBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rationaleDrawer, setRationaleDrawer] = useState<{
    stepId: string
    stepTitle: string
  } | null>(null)
  // W16-C: budget cap event を受けたとき構造化情報を banner で出すための state。
  // PlanTweakInput が SSE で `mentor_budget_cap_exceeded` を捕捉した際、子から
  // window event 'mentor-budget-cap-exceeded' を dispatch して親側でも表示する。
  const [budgetCapEvent, setBudgetCapEvent] = useState<MentorBudgetCapEvent | null>(null)

  const handleShowRationale = useCallback((stepId: string, stepTitle: string) => {
    setRationaleDrawer({ stepId, stepTitle })
  }, [])

  const handleCloseRationale = useCallback(() => {
    setRationaleDrawer(null)
  }, [])

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleRestart = useCallback(async () => {
    const shouldRestart = window.confirm(
      '今の会話内容を消して、新しいヒアリングから作り直します。続けますか？',
    )

    if (!shouldRestart) {
      return
    }

    setIsRestarting(true)

    try {
      clearWorkspaceSnapshot(goalSummary)
      window.sessionStorage.removeItem('school:preview:plan')
      window.localStorage.removeItem(PLANNER_GOAL_STORAGE_KEY)

      if (goalSummary.trim()) {
        const params = new URLSearchParams({ goal: goalSummary.trim() })
        const response = await fetch(`/api/mentor/session?${params.toString()}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          console.warn('[planner] mentor session reset failed', {
            status: response.status,
          })
        }
      }
    } catch (error) {
      console.warn('[planner] failed to clear previous plan state', error)
    } finally {
      router.push('/plan/onboarding?restart=1')
      router.refresh()
    }
  }, [goalSummary, router])

  const handleReviewClick = useCallback(async () => {
    if (isReviewing) return
    setIsReviewing(true)
    setReviewSummary(null)
    setReviewError(null)

    try {
      // The plan-review route requires goal + continuation; we hand it the
      // current compiled plan as continuation steps. taskProgress / feedbacks
      // are best supplied server-side, so we send minimal context here and
      // let the local fallback handle missing data gracefully.
      const continuationSteps = plan.steps.map((step) => ({
        id: step.atomId,
        title: step.title,
        description: step.rationale ?? '',
        outcome: '',
        purpose: '',
      }))

      const response = await fetch('/api/planner/plan-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goalSummary,
          continuation: { steps: continuationSteps },
          taskProgress: {},
          learnerState,
          mentorMemories,
          feedbacks: [],
          triggerReasons: [
            {
              type: 'manual',
              label: '手動レビュー',
              detail: '学習者の依頼によるプラン見直し',
            },
          ],
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(data?.message ?? `プランレビューに失敗しました (${response.status})`)
      }

      const json = await response.json() as {
        data?: {
          summary?: string
          mentorNote?: string
          rationale?: string
          revisedSteps?: Array<{
            id: string
            title: string
            description: string
            outcome?: string
            purpose?: string
            isNew?: boolean
            originalStepId?: string
          }>
          removedStepIds?: string[]
        }
      }

      const proposal = json.data
      const parts = [proposal?.summary, proposal?.mentorNote].filter(Boolean) as string[]
      setReviewSummary(parts.length > 0 ? parts.join('\n\n') : 'プランの見直しが完了しました。')

      const revisedSteps = Array.isArray(proposal?.revisedSteps) ? proposal.revisedSteps : []
      if (proposal && revisedSteps.length > 0) {
        setReviewProposal({
          summary: proposal.summary ?? 'プラン見直し提案',
          rationale: proposal.rationale ?? '',
          revisedSteps: revisedSteps.map((step) => ({
            id: step.id,
            title: step.title,
            description: step.description,
            outcome: step.outcome ?? '',
            purpose: step.purpose ?? '',
            isNew: Boolean(step.isNew),
            ...(step.originalStepId ? { originalStepId: step.originalStepId } : {}),
          })),
          removedStepIds: Array.isArray(proposal.removedStepIds) ? proposal.removedStepIds : [],
        })
      } else {
        setReviewProposal(null)
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '通信エラーが発生しました')
    } finally {
      setIsReviewing(false)
    }
  }, [goalSummary, isReviewing, learnerState, mentorMemories, plan.steps])

  const handleApplyRevision = useCallback(async () => {
    if (!reviewProposal || !planId || isApplyingRevision) return
    setIsApplyingRevision(true)
    setReviewError(null)

    try {
      const response = await fetch('/api/planner/plan-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          goal: goalSummary,
          title: `「${goalSummary}」学習プラン`,
          summary: reviewProposal.summary,
          revisedSteps: reviewProposal.revisedSteps,
          removedStepIds: reviewProposal.removedStepIds,
          revisionSummary: reviewProposal.summary,
          revisionRationale: reviewProposal.rationale || reviewProposal.summary,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(data?.message ?? `プラン更新に失敗しました (${response.status})`)
      }

      setReviewProposal(null)
      setReviewSummary('プランを更新しました。')
      setRecompileBanner('プランを更新しています...')
      if (recompileBannerTimeoutRef.current) {
        clearTimeout(recompileBannerTimeoutRef.current)
      }
      recompileBannerTimeoutRef.current = setTimeout(() => {
        setRecompileBanner(null)
      }, 2500)
      router.refresh()
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'プラン更新に失敗しました')
    } finally {
      setIsApplyingRevision(false)
    }
  }, [goalSummary, isApplyingRevision, planId, reviewProposal, router])

  useRefreshOnVisible(refresh)

  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    function handleMentorActionExecuted(event: Event) {
      const detail = (event as CustomEvent<{ action?: { type?: string } }>).detail
      const actionType = detail?.action?.type
      // TQ-250 (Auditor C9 / C11): explicit whitelist of action types that
      // require a server round-trip refresh. Includes the original 7
      // plan-edit actions plus the 3 TQ-221 AI tool actions, all of which
      // now persist to compiled_plans (TQ-249 / TQ-256). Unknown / unsafe
      // events are dropped silently — the listener is a soft trigger and
      // unrecognized event types must NOT trigger a refresh.
      const ALLOWED_REFRESH_ACTIONS = new Set([
        'recompile_plan',
        'adjust_difficulty',
        'skip_lesson',
        'add_lesson',
        'reorder_schedule',
        'change_next_lesson',
        'focus_lesson',
        'recommend_tool',
        'delegate_to_tool',
        'switch_tool',
      ])
      const requiresRefresh =
        typeof actionType === 'string' && ALLOWED_REFRESH_ACTIONS.has(actionType)

      if (!requiresRefresh) {
        return
      }

      setRecompileBanner('プランを更新しています...')
      if (recompileBannerTimeoutRef.current) {
        clearTimeout(recompileBannerTimeoutRef.current)
      }
      recompileBannerTimeoutRef.current = setTimeout(() => {
        setRecompileBanner(null)
      }, 2500)

      refresh()
    }

    window.addEventListener('mentor-action-executed', handleMentorActionExecuted)
    return () => {
      window.removeEventListener('mentor-action-executed', handleMentorActionExecuted)
      if (recompileBannerTimeoutRef.current) {
        clearTimeout(recompileBannerTimeoutRef.current)
      }
    }
  }, [refresh])

  useEffect(() => {
    function handleBudgetCapEvent(event: Event) {
      const detail = (event as CustomEvent<MentorBudgetCapEvent>).detail
      if (detail && detail.kind === 'budget_cap') {
        setBudgetCapEvent(detail)
      }
    }

    window.addEventListener('mentor-budget-cap-exceeded', handleBudgetCapEvent)
    return () => {
      window.removeEventListener('mentor-budget-cap-exceeded', handleBudgetCapEvent)
    }
  }, [])

  return (
    <div className="space-y-3">
      {/* W16-C: Budget cap exceeded banner — 構造化された 429 相当通知 */}
      {budgetCapEvent ? (
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
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

      {recompileBanner ? (
        <div
          className="mx-auto max-w-3xl rounded-2xl border border-orange-300 bg-orange-50/80 px-4 py-2 text-xs font-semibold text-orange-800 shadow-sm dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-100"
          data-testid="plan-recompile-banner"
          role="status"
        >
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            {recompileBanner}
          </span>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 px-4 pt-5 sm:px-6">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleReviewClick}
          disabled={isReviewing}
          data-testid="plan-review-cta"
        >
          {isReviewing ? '見直し中...' : (
            <>
              <Sparkles className="mr-1.5 size-3.5" />
              プランを見直す
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setHistoryOpen(true)}
          disabled={!planId}
          data-testid="plan-history-cta"
        >
          <History className="mr-1.5 size-3.5" />
          改訂履歴
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRestart}
          data-testid="plan-restart-cta"
          disabled={isRestarting}
        >
          {isRestarting ? '作り直し中...' : 'プランを最初から作り直す'}
        </Button>
      </div>

      {reviewSummary ? (
        <div
          className="mx-auto max-w-3xl space-y-2 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs leading-6 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100"
          data-testid="plan-review-summary"
          role="status"
        >
          <p className="whitespace-pre-line">{reviewSummary}</p>
          {reviewProposal && planId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                onClick={handleApplyRevision}
                disabled={isApplyingRevision}
                data-testid="plan-review-apply"
              >
                {isApplyingRevision ? '更新中...' : 'この提案でプランを更新'}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setReviewProposal(null)}
                disabled={isApplyingRevision}
                data-testid="plan-review-dismiss"
              >
                却下
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {reviewError ? (
        <div
          className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100"
          data-testid="plan-review-error"
          role="alert"
        >
          {reviewError}
        </div>
      ) : null}

      <CompiledPlanPage
        plan={plan}
        nextAction={nextAction}
        completedNodeIds={completedNodeIds}
        preferredTools={preferredTools}
        goalSummary={goalSummary}
        goalId={goalId}
        initialNextQuestion={initialNextQuestion}
        learnerState={learnerState}
        mentorMemories={mentorMemories}
        understanding={understanding}
        onStartLesson={(atomId) => {
          const trimmed = atomId.trim()
          // TQ-256 (Auditor C18): delegation:* atoms are synthetic plan
          // nodes ("lesson が足りなくても tree は作る") and have no lesson
          // page. Route them to the delegation drawer instead so the
          // learner can see the AI tool recommendation + brief.
          if (trimmed.startsWith('delegation:')) {
            router.push(`/plan/delegation/${encodeURIComponent(trimmed)}`)
            return
          }
          router.push(`/lessons/${trimmed}`)
        }}
        onViewEvidence={(atomId) => {
          const trimmed = atomId.trim()
          if (trimmed.startsWith('delegation:')) {
            router.push(`/plan/delegation/${encodeURIComponent(trimmed)}`)
            return
          }
          router.push(`/lessons/${trimmed}`)
        }}
        onShowRationale={planId ? handleShowRationale : undefined}
      />

      {/* TQ-251 / TQ-252 — 動的卒業ゲート選択 UI を /plan に配線。
          persona × goal で options が動的に出し分けられる。 */}
      <div
        className="mx-auto max-w-3xl px-4 sm:px-6"
        data-testid="plan-graduation-gate-section"
      >
        <GraduationGateSelect
          personaSlug={personaSlug}
          goalSlug={goalSlug ?? null}
          onSubmit={handleGraduationSubmit}
        />
        {graduationStatus.kind === 'saving' ? (
          <p
            className="mt-2 text-xs text-muted-foreground"
            data-testid="plan-graduation-gate-saving"
          >
            卒業ゲートを保存しています...
          </p>
        ) : null}
        {graduationStatus.kind === 'saved' ? (
          <p
            className="mt-2 text-xs text-emerald-700 dark:text-emerald-300"
            data-testid="plan-graduation-gate-saved"
            role="status"
          >
            卒業ゲートを保存しました: {graduationStatus.label}
          </p>
        ) : null}
        {graduationStatus.kind === 'error' ? (
          <p
            className="mt-2 text-xs text-rose-700 dark:text-rose-300"
            data-testid="plan-graduation-gate-error"
            role="alert"
          >
            {graduationStatus.message}
          </p>
        ) : null}
      </div>

      <PlanTweakInput
        goalSummary={goalSummary}
        planId={planId}
      />

      <PlanHistoryDrawer
        open={historyOpen}
        planId={planId}
        onClose={() => setHistoryOpen(false)}
      />

      <PlanStepRationaleDrawer
        open={rationaleDrawer !== null}
        planId={planId}
        stepId={rationaleDrawer?.stepId ?? null}
        stepTitle={rationaleDrawer?.stepTitle ?? null}
        onClose={handleCloseRationale}
      />
    </div>
  )
}
