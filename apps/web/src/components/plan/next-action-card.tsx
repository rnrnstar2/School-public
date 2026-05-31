'use client'

import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  MessageCircleQuestion,
  PartyPopper,
  PlayCircle,
} from 'lucide-react'
import { Button } from '@school/ui/button'
import { AiDelegationButton } from '@/components/goals/ai-delegation-button'
import { Card, CardContent } from '@school/ui/card'
import { OwnerTypeBadge } from '@/components/goal-tree/owner-type-badge'
import { cn } from '@/lib/utils'
import type { NextAction } from '@/lib/planner/goal-first/types'
import type { GoalTreeOwnerType } from '@/types/goal-tree'

interface NextActionCardProps {
  action: NextAction
  onAction: () => void
  recommendedToolLabel?: string
  ownerType?: GoalTreeOwnerType
  aiDelegationTarget?: {
    goalId: string
    nodeId: string
    nodeLabel: string
    ownerType: GoalTreeOwnerType
  }
}

const configByType: Record<
  NextAction['type'],
  {
    icon: React.ElementType
    accentClass: string
    borderClass: string
    buttonLabel: string | null
  }
> = {
  lesson: {
    icon: PlayCircle,
    accentClass: 'text-blue-600 dark:text-blue-400',
    borderClass: 'border-blue-200 dark:border-blue-800',
    buttonLabel: '開始する',
  },
  evidence: {
    icon: FileText,
    accentClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-200 dark:border-amber-800',
    buttonLabel: '提出する',
  },
  review: {
    icon: CheckCircle2,
    accentClass: 'text-violet-600 dark:text-violet-400',
    borderClass: 'border-violet-200 dark:border-violet-800',
    buttonLabel: '結果を見る',
  },
  graduated: {
    icon: PartyPopper,
    accentClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    buttonLabel: null,
  },
  blocked: {
    icon: Lock,
    accentClass: 'text-slate-500 dark:text-slate-400',
    borderClass: 'border-slate-200 dark:border-slate-700',
    buttonLabel: null,
  },
  plan_revised: {
    icon: ArrowRight,
    accentClass: 'text-sky-600 dark:text-sky-400',
    borderClass: 'border-sky-200 dark:border-sky-800',
    buttonLabel: '新しいプランを見る',
  },
}

function NextActionCard({
  action,
  onAction,
  recommendedToolLabel,
  ownerType = 'user',
  aiDelegationTarget,
}: NextActionCardProps) {
  const cfg = configByType[action.type]
  const Icon = cfg.icon

  return (
    <Card className={cn('overflow-hidden', cfg.borderClass)}>
      {action.bridgeQuestion && (
        <div className="border-b border-border/60 bg-slate-50/80 px-4 py-3 dark:bg-slate-900/40 sm:px-5">
          <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <MessageCircleQuestion
              className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <p className="leading-6">{action.bridgeQuestion}</p>
          </div>
        </div>
      )}
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800',
            cfg.accentClass,
          )}
        >
          <Icon className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {action.type === 'lesson' && '次のレッスン'}
              {action.type === 'evidence' && '成果物を提出してください'}
              {action.type === 'review' && 'レビュー結果を確認'}
              {action.type === 'graduated' && 'おめでとうございます！目標達成！'}
              {action.type === 'blocked' && '前のレッスンを完了してください'}
              {action.type === 'plan_revised' && '新しいプランを確認'}
            </p>
            <OwnerTypeBadge
              ownerType={ownerType}
              size="sm"
              showAiDelegatable
            />
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {action.message}
          </p>
          {recommendedToolLabel && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              推奨ツール: {recommendedToolLabel}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {aiDelegationTarget ? (
            <AiDelegationButton
              goalId={aiDelegationTarget.goalId}
              nodeId={aiDelegationTarget.nodeId}
              nodeLabel={aiDelegationTarget.nodeLabel}
              ownerType={aiDelegationTarget.ownerType}
              className="shrink-0"
            />
          ) : null}

          {cfg.buttonLabel ? (
            <Button
              size="sm"
              onClick={onAction}
              className="h-11 min-w-[44px] shrink-0 px-4 text-sm"
            >
              {cfg.buttonLabel}
              <ArrowRight data-icon="inline-end" className="ml-1 size-3.5" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export { NextActionCard }
export type { NextActionCardProps }
