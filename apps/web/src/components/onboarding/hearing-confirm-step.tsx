'use client'

import { CheckCircle2, Clock3, Target } from 'lucide-react'
import { Button } from '@school/ui/button'
import type { PlannerHearingTransport } from '@/lib/planner/types'

interface HearingConfirmStepProps {
  audience: string | null
  blockers: string[]
  deadline: string | null
  goal: string
  keyPoints: string[]
  onBack: () => void
  onConfirm: () => void
  personaLabels: string[]
  pending: boolean
  preferredTools: string[]
  transport: PlannerHearingTransport | null
}

function SummaryList({
  items,
  emptyLabel,
}: {
  emptyLabel: string
  items: string[]
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

export function HearingConfirmStep({
  audience,
  blockers,
  deadline,
  goal,
  keyPoints,
  onBack,
  onConfirm,
  personaLabels,
  pending,
  preferredTools,
  transport,
}: HearingConfirmStepProps) {
  return (
    <section
      className="rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/90"
      data-testid="hearing-confirm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
            Confirm
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            この内容でプランを作成しますか？
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
            ヒアリングで集めた前提をまとめました。問題なければこのまま compile に進みます。
          </p>
        </div>
        {transport ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {transport.label}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Target className="h-4 w-4 text-emerald-600" />
              目標要約
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{goal}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">persona 候補</p>
              <div className="mt-2">
                <SummaryList items={personaLabels} emptyLabel="まだ抽出されていません" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">利用できる AI ツール</p>
              <div className="mt-2">
                <SummaryList items={preferredTools} emptyLabel="未回答" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">対象読者</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {audience || '未指定'}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Clock3 className="h-4 w-4 text-amber-600" />
                期限
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {deadline || '未指定'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">主な blocker / 制約</p>
            <div className="mt-2">
              <SummaryList items={blockers} emptyLabel="大きな blocker は見つかっていません" />
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">hearingSummary</p>
          {keyPoints.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
              {keyPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              要約ポイントはありません。
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          ヒアリングに戻る
        </Button>
        <Button type="button" onClick={onConfirm} disabled={pending}>
          {pending ? 'プランを作成しています...' : 'この内容でプランを作成する'}
        </Button>
      </div>
    </section>
  )
}
