'use client'

/**
 * TQ-241: Plan-step rationale drilldown drawer.
 *
 * Renders the response from GET /api/planner/plan-rationale/[planId]
 * for the step the learner clicked "なぜこのレッスン?" on. Designed as
 * a learner-facing transparency surface — sub-agent CoT / raw prompts
 * MUST NOT be displayed here, only the redacted summaries returned by
 * the API.
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Search, Sparkles, Wrench, X } from 'lucide-react'
import { getAiToolById } from '@/lib/atoms/ai-tools-catalog'
import type {
  StepRationale,
  StepRationaleType,
} from '@/lib/planner/goal-first/plan-rationale'

interface PlanStepRationaleDrawerProps {
  open: boolean
  planId: string | null
  /** stepId == atomId in the AtomCompiledPlan domain. */
  stepId: string | null
  /** Lesson title for the heading; falls back to step id when unknown. */
  stepTitle?: string | null
  onClose: () => void
}

interface RationaleApiResponse {
  data?: {
    planId: string
    goal: string
    planSource: 'anchor' | 'topo' | 'ai'
    rationales: StepRationale[]
  }
  message?: string
}

const RATIONALE_LABEL: Record<StepRationaleType, string> = {
  matched_atom: '既存レッスンと一致',
  delegation_node: 'AIツールに任せる作業',
  persona_anchor: 'ペルソナ初手シーケンス',
}

const RATIONALE_BADGE_CLASS: Record<StepRationaleType, string> = {
  matched_atom:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  delegation_node:
    'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  persona_anchor:
    'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200',
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null
  }
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}秒`
  return `${Math.round(durationMs / 1000 / 6) / 10}分`
}

export function PlanStepRationaleDrawer({
  open,
  planId,
  stepId,
  stepTitle,
  onClose,
}: PlanStepRationaleDrawerProps) {
  const [rationale, setRationale] = useState<StepRationale | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRationale = useCallback(
    async (currentPlanId: string, currentStepId: string, signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      setRationale(null)

      try {
        const response = await fetch(
          `/api/planner/plan-rationale/${encodeURIComponent(currentPlanId)}`,
          { signal, cache: 'no-store' },
        )

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as RationaleApiResponse | null
          throw new Error(
            data?.message ?? `根拠の取得に失敗しました (${response.status})`,
          )
        }

        const json = (await response.json()) as RationaleApiResponse
        const list = json.data?.rationales ?? []
        const found = list.find((entry) => entry.stepId === currentStepId) ?? null

        if (!found) {
          setError('このステップの根拠データが見つかりません。')
        } else {
          setRationale(found)
        }
      } catch (err) {
        if (signal.aborted) return
        setError(err instanceof Error ? err.message : '通信エラー')
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!open || !planId || !stepId) return
    const controller = new AbortController()
    void fetchRationale(planId, stepId, controller.signal)
    return () => controller.abort()
  }, [open, planId, stepId, fetchRationale])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const tool = rationale?.recommendedTool
    ? getAiToolById(rationale.recommendedTool)
    : null

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            role="dialog"
            aria-label="このレッスンの選定根拠"
            data-testid="plan-step-rationale-drawer"
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl sm:w-[440px]"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">なぜこのレッスン?</h2>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {stepTitle?.trim() || stepId || 'レッスン未指定'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  data-testid="plan-step-rationale-loading"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中...
                </p>
              ) : null}

              {error ? (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                  data-testid="plan-step-rationale-error"
                >
                  {error}
                </p>
              ) : null}

              {rationale && !loading && !error ? (
                <div className="space-y-4" data-testid="plan-step-rationale-content">
                  <section className="space-y-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RATIONALE_BADGE_CLASS[rationale.rationaleType]}`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {RATIONALE_LABEL[rationale.rationaleType]}
                    </span>
                    <p
                      className="whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200"
                      data-testid="plan-step-rationale-why"
                    >
                      {rationale.why}
                    </p>
                  </section>

                  {tool || rationale.delegationBrief ? (
                    <section
                      className="space-y-2 rounded-2xl border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900/40 dark:bg-orange-950/30"
                      data-testid="plan-step-rationale-tool"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 dark:text-orange-200">
                        <Wrench className="h-3.5 w-3.5" />
                        推奨AIツール
                      </div>
                      {tool ? (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                          {tool.label}
                        </p>
                      ) : rationale.recommendedTool ? (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                          {rationale.recommendedTool}
                        </p>
                      ) : null}
                      {rationale.delegationBrief ? (
                        <p className="whitespace-pre-line rounded-lg border border-orange-200/70 bg-white/80 p-2 text-xs leading-5 text-slate-700 dark:border-orange-900/30 dark:bg-slate-950/40 dark:text-slate-200">
                          {rationale.delegationBrief}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  {rationale.subAgentRuns.length > 0 ? (
                    <section
                      className="space-y-2"
                      data-testid="plan-step-rationale-agent-runs"
                    >
                      <h3 className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        サブエージェントの調査ログ
                      </h3>
                      <ol className="space-y-2">
                        {rationale.subAgentRuns.map((run) => {
                          const duration = formatDuration(run.durationMs)
                          return (
                            <li
                              key={run.runId}
                              className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                  {run.agentName}
                                </p>
                                <span className="text-[11px] text-slate-400">
                                  {[run.model, duration].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                                {run.summary}
                              </p>
                            </li>
                          )
                        })}
                      </ol>
                    </section>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      サブエージェントの詳細ログは現在未連携です（Phase 3 で公開予定）。
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
