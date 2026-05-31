/**
 * TQ-256 (Auditor C18): delegation node landing page.
 *
 * Plan steps with `atomId.startsWith('delegation:')` are synthetic — they
 * surface a Goal Tree leaf that has no matching atom yet, but the AI has
 * recommended a tool + brief to fill the gap. Pre-TQ-256 the plan UI
 * routed these atoms to `/lessons/<atomId>`, which produced a `notFound()`
 * response (the curated lesson set has no `delegation:*` entries).
 *
 * This page resolves the active compiled plan and renders the delegation
 * step's title, rationale, recommended tool, and brief so the learner has
 * an actionable surface to continue from. UX is intentionally minimal —
 * richer drawer / launch-card behaviour is tracked in a follow-up TQ.
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCompiledPlanRecord } from '@/lib/compiled-plans'
import { getAiToolById } from '@/lib/atoms/ai-tools-catalog'
import type { AtomPlanStep } from '@/lib/planner/goal-first/plan-compiler'

interface DelegationPageProps {
  params: Promise<{ atomId: string }>
}

export default async function DelegationNodePage({ params }: DelegationPageProps) {
  const { atomId: rawAtomId } = await params
  const atomId = decodeURIComponent(rawAtomId).trim()

  if (!atomId.startsWith('delegation:')) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/plan/onboarding')
  }

  const record = await getCompiledPlanRecord({
    userId: user.id,
    status: 'active',
    client: supabase,
  })

  if (!record) {
    notFound()
  }

  const step: AtomPlanStep | undefined = record.plan.steps.find((s) => s.atomId === atomId)
  if (!step) {
    notFound()
  }

  const milestone = step.milestoneId
    ? record.plan.milestones.find((m) => m.id === step.milestoneId)
    : null
  const tool = step.recommendedTool ? getAiToolById(step.recommendedTool) : null
  const toolLabel = tool?.label ?? step.recommendedTool ?? null

  return (
    <div className="theme-page-shell min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <Link
            href="/plan"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-orange-700 dark:text-slate-300 dark:hover:text-orange-200"
            data-testid="delegation-back-link"
          >
            <ArrowLeft className="size-4" />
            プランに戻る
          </Link>
        </div>

        <header className="rounded-[24px] border border-orange-200 bg-orange-50/70 p-5 shadow-sm dark:border-orange-900/40 dark:bg-orange-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-orange-700 dark:text-orange-200">
            <Sparkles className="size-4" />
            AI ツールに委譲するステップ
          </div>
          <h1
            className="mt-2 text-xl font-semibold leading-snug text-slate-950 dark:text-slate-50 sm:text-2xl"
            data-testid="delegation-title"
          >
            {step.title}
          </h1>
          {milestone ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              マイルストーン: {milestone.title}
            </p>
          ) : null}
        </header>

        {step.rationale ? (
          <section
            aria-label="このステップの目的"
            className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80"
          >
            <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              なぜこのステップが必要か
            </h2>
            <p
              className="text-sm leading-7 text-slate-700 dark:text-slate-300"
              data-testid="delegation-rationale"
            >
              {step.rationale}
            </p>
          </section>
        ) : null}

        <section
          aria-label="推奨ツール"
          className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80"
        >
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            推奨 AI ツール
          </h2>
          {toolLabel ? (
            <p
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
              data-testid="delegation-tool"
            >
              {toolLabel}
              {step.recommendedTool && tool ? (
                <span className="ml-2 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {step.recommendedTool}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              まだツールが割り当てられていません。プランページの「メンターに調整を相談」から
              ツールの推薦を依頼できます。
            </p>
          )}
        </section>

        {step.delegationBrief ? (
          <section
            aria-label="委譲依頼文"
            className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80"
          >
            <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              ツールに渡す依頼文
            </h2>
            <pre
              className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              data-testid="delegation-brief"
            >
              {step.delegationBrief}
            </pre>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              この依頼文を {toolLabel ?? 'AI ツール'} にコピー & ペーストして実行してください。
            </p>
          </section>
        ) : null}
      </div>
    </div>
  )
}
