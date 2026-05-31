'use client'

import { useMemo } from 'react'
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  HelpCircle,
  LineChart,
  Lock,
  PlayCircle,
  SkipForward,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '@school/ui/button'
import { getAiToolById } from '@/lib/atoms/ai-tools-catalog'
import { OwnerTypeBadge } from '@/components/goal-tree/owner-type-badge'
import { atomPlanToCompiledPlan, isAtomCompiledPlan } from '@/lib/planner/atom-plan-adapter'
import { resolveTodaysTasks } from '@/lib/planner/goal-first/next-action-resolver'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import type { CompiledPlan, CompiledPlanNode, NextAction } from '@/lib/planner/goal-first/types'
import type { LearnerUnderstandingProfile } from '@/lib/planner/resume-personalization'
import { cn } from '@/lib/utils'
import type { PlanNodeStatus } from '@/types/domain'
import type { NextQuestionOutput } from '@/lib/api/schemas'
import type { LearnerState, MentorMemory } from '@/types'
import { CountAccordionSection } from '@/components/ui/count-accordion-section'
import { NextActionCard } from './next-action-card'
import { NextQuestionCard } from './next-question-card'
import { PlanProgressBar } from './plan-progress-bar'
import { TodaysTasksCard } from './todays-tasks-card'

interface CompiledPlanPageProps {
  plan: CompiledPlan | AtomCompiledPlan
  nextAction: NextAction | null
  completedNodeIds: string[]
  preferredTools?: string[]
  goalSummary?: string
  goalId?: string | null
  initialNextQuestion?: NextQuestionOutput | null
  learnerState?: LearnerState | null
  mentorMemories?: MentorMemory[]
  understanding?: LearnerUnderstandingProfile | null
  onStartLesson: (lessonId: string, nodeId: string) => void
  onViewEvidence: (nodeId: string) => void
  /**
   * TQ-241: open the per-step rationale drawer ("なぜこのレッスン?").
   * Optional — when omitted, the drilldown buttons are not rendered.
   * `stepId` is the AtomCompiledPlan step identifier (== atomId).
   */
  onShowRationale?: (stepId: string, stepTitle: string) => void
}

const nodeStatusConfig: Record<
  PlanNodeStatus,
  { icon: React.ElementType; className: string; label: string }
> = {
  pending: { icon: Circle, className: 'text-slate-400 dark:text-slate-500', label: '未着手' },
  active: { icon: PlayCircle, className: 'text-blue-500 dark:text-blue-400', label: '進行中' },
  completed: { icon: CheckCircle2, className: 'text-emerald-500 dark:text-emerald-400', label: '完了' },
  skipped: { icon: SkipForward, className: 'text-slate-400 dark:text-slate-500', label: 'スキップ' },
  blocked: { icon: Lock, className: 'text-slate-400 dark:text-slate-500', label: 'ロック中' },
}

function getNodeStatus(nodeId: string, completedNodeIds: string[]): PlanNodeStatus {
  return completedNodeIds.includes(nodeId) ? 'completed' : 'pending'
}

function formatGoalSummary(goalSummary: string | undefined, planTitle: string) {
  if (goalSummary && goalSummary.trim().length > 0) {
    return goalSummary.trim()
  }

  return planTitle.replace(/^「/, '').replace(/」学習プラン$/, '')
}

function formatPlanStatus(completed: number, total: number) {
  if (total > 0 && completed >= total) {
    return '完了'
  }

  if (completed > 0) {
    return '進行中'
  }

  return '未着手'
}

function primaryActionLabel(action: NextAction | null) {
  if (!action) {
    return null
  }

  if (action.type === 'lesson') {
    return 'このタスクを始める'
  }

  if (action.type === 'evidence' || action.type === 'review') {
    return '完了する'
  }

  if (action.type === 'plan_revised') {
    return '新しいプランを見る'
  }

  return null
}

function analyticsCount(
  understanding: LearnerUnderstandingProfile | null | undefined,
  learnerState: LearnerState | null | undefined,
) {
  return (
    (understanding?.strengths.length ?? 0)
    + (understanding?.weaknesses.length ?? 0)
    + (understanding?.commonBlockers.length ?? 0)
    + (learnerState?.blockers.length ?? 0)
  )
}

function CompiledPlanPage({
  plan,
  nextAction,
  completedNodeIds,
  preferredTools = [],
  goalSummary,
  goalId = null,
  initialNextQuestion = null,
  learnerState = null,
  mentorMemories = [],
  understanding = null,
  onStartLesson,
  onViewEvidence,
  onShowRationale,
}: CompiledPlanPageProps) {
  const normalizedPlan = isAtomCompiledPlan(plan) ? atomPlanToCompiledPlan(plan) : plan
  const sortedNodes = useMemo(
    () => [...normalizedPlan.nodes].sort((a, b) => a.sortOrder - b.sortOrder),
    [normalizedPlan],
  )
  const todaysTasks = useMemo(
    () => resolveTodaysTasks(plan, completedNodeIds, { limit: 3 }),
    [plan, completedNodeIds],
  )
  const currentNode = sortedNodes.find((node) => !completedNodeIds.includes(node.id))
    ?? sortedNodes[sortedNodes.length - 1]
    ?? null
  const currentMilestone = normalizedPlan.milestones.find((milestone) => milestone.id === currentNode?.milestoneId)
  const totalNodes = normalizedPlan.nodes.length
  const completedCount = normalizedPlan.nodes.filter((node) =>
    completedNodeIds.includes(node.id),
  ).length
  const recommendedToolLabel = preferredTools[0]
    ? getAiToolById(preferredTools[0])?.label
    : undefined
  const actionLabel = primaryActionLabel(nextAction)
  const pageStatus = formatPlanStatus(completedCount, totalNodes)
  const deadline = learnerState?.signals?.deadline?.trim()
  const insightCount = analyticsCount(understanding, learnerState)

  const handleNextAction = () => {
    if (!nextAction) {
      return
    }

    if (nextAction.type === 'lesson' && nextAction.lessonId && nextAction.nodeId) {
      onStartLesson(nextAction.lessonId, nextAction.nodeId)
    }

    if ((nextAction.type === 'evidence' || nextAction.type === 'review') && nextAction.nodeId) {
      onViewEvidence(nextAction.nodeId)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
      <header className="sticky top-16 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur md:static md:mx-0 md:rounded-[28px] md:border md:bg-[linear-gradient(135deg,#fffaf2_0%,#f8fbff_100%)] md:px-6 md:py-5 md:shadow-none dark:border-slate-800 dark:bg-slate-950/95 md:dark:bg-[linear-gradient(135deg,rgba(249,115,22,0.12)_0%,rgba(15,23,42,0.92)_100%)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-orange-700 dark:text-orange-200">
              GOAL
            </p>
            <h1
              className="text-lg font-semibold leading-snug text-slate-950 sm:text-2xl dark:text-slate-50"
              data-testid="plan-goal-summary"
            >
              {formatGoalSummary(goalSummary, normalizedPlan.title)}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {pageStatus}
              </span>
              {deadline ? (
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium dark:border-slate-700 dark:bg-slate-900">
                  期限: {deadline}
                </span>
              ) : null}
              {totalNodes > 0 ? <span>{completedCount}/{totalNodes} タスク完了</span> : null}
            </div>
          </div>

          {actionLabel ? (
            <Button
              size="sm"
              onClick={handleNextAction}
              className="shrink-0"
              data-testid="plan-primary-cta"
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </header>

      {goalId ? (
        <section
          aria-label="次の問い"
          data-testid="plan-next-question"
        >
          <NextQuestionCard
            goalId={goalId}
            initialQuestion={initialNextQuestion ?? undefined}
          />
        </section>
      ) : null}

      {currentNode ? (
        <section
          aria-label="現在のタスク"
          className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/85"
          data-testid="plan-current-task"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
                <Sparkles className="size-4" />
                現在のタスク
                <OwnerTypeBadge ownerType="user" size="sm" showAiDelegatable />
              </div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                {currentNode.lessonTitle}
              </h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {currentNode.rationale}
              </p>
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {getNodeStatus(currentNode.id, completedNodeIds) === 'completed' ? '完了' : '進行中'}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              {currentMilestone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Target className="size-4 text-orange-500" />
                  {currentMilestone.title}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4 text-orange-500" />
                約{currentNode.estimatedMinutes}分
              </span>
              {onShowRationale ? (
                <button
                  type="button"
                  onClick={() => onShowRationale(currentNode.id, currentNode.lessonTitle)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500 dark:hover:text-orange-200"
                  data-testid="plan-current-task-rationale-button"
                >
                  <HelpCircle className="size-3" />
                  なぜこのレッスン?
                </button>
              ) : null}
            </div>
            <PlanProgressBar completed={completedCount} total={totalNodes} className="mt-4" />
          </div>
        </section>
      ) : null}

      {nextAction ? (
        <section
          aria-label="次のアクション"
          className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/85"
          data-testid="plan-next-action"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
            <ArrowRight className="size-4 text-orange-500" />
            次のアクション
          </div>
          <NextActionCard
            action={nextAction}
            onAction={handleNextAction}
            recommendedToolLabel={recommendedToolLabel}
            ownerType={nextAction.type === 'blocked' ? 'blocked' : 'user'}
          />
        </section>
      ) : null}

      <TodaysTasksCard tasks={todaysTasks} onStartTask={onStartLesson} />

      <div className="space-y-3">
        <CountAccordionSection
          title="全体ロードマップ"
          count={sortedNodes.length}
          icon={Target}
          testId="plan-task-subdivision-accordion"
          badgeClassName="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
        >
          {sortedNodes.length > 0 ? (
            <ol className="space-y-3" role="list">
              {sortedNodes.map((node, index) => (
                <LessonRow
                  key={node.id}
                  node={node}
                  index={index + 1}
                  completedNodeIds={completedNodeIds}
                  onStartLesson={onStartLesson}
                  onViewEvidence={onViewEvidence}
                  onShowRationale={onShowRationale}
                />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">まだロードマップはありません。</p>
          )}

          {normalizedPlan.gapTasks.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
                追加コンテンツ準備中
              </p>
              {normalizedPlan.gapTasks.map((gap) => (
                <div key={gap.id} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{gap.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{gap.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CountAccordionSection>

        {mentorMemories.length > 0 ? (
          <CountAccordionSection
            title="メンター記憶"
            count={mentorMemories.length}
            icon={Brain}
            testId="plan-mentor-memory-accordion"
            badgeClassName="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
          >
            <div className="space-y-3">
              {mentorMemories.map((memory) => (
                <article key={memory.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{memory.title}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    {memory.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-violet-400" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </CountAccordionSection>
        ) : null}

        {insightCount > 0 ? (
          <CountAccordionSection
            title="学習メモ"
            count={insightCount}
            icon={LineChart}
            testId="plan-learner-analytics-accordion"
            badgeClassName="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
          >
            <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                <Eye className="size-4 text-sky-500" />
                得意
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {(understanding?.strengths ?? []).length > 0 ? (
                  understanding?.strengths.map((strength) => <li key={strength}>{strength}</li>)
                ) : (
                  <li>まだ把握できていません。</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                <Sparkles className="size-4 text-orange-500" />
                苦手・課題
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {(understanding?.weaknesses ?? []).length > 0 ? (
                  understanding?.weaknesses.map((weakness) => <li key={weakness}>{weakness}</li>)
                ) : (
                  <li>まだ登録されていません。</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                <BookOpen className="size-4 text-violet-500" />
                ブロッカー
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {((understanding?.commonBlockers ?? learnerState?.blockers) ?? []).length > 0 ? (
                  (understanding?.commonBlockers ?? learnerState?.blockers ?? []).map((blocker) => <li key={blocker}>{blocker}</li>)
                ) : (
                  <li>現在は大きなブロッカーを把握していません。</li>
                )}
              </ul>
            </div>
            </div>

            {understanding?.resumeMessage ? (
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {understanding.resumeMessage}
              </p>
            ) : null}
          </CountAccordionSection>
        ) : null}
      </div>
    </div>
  )
}

function LessonRow({
  node,
  index,
  completedNodeIds,
  onStartLesson,
  onViewEvidence,
  onShowRationale,
}: {
  node: CompiledPlanNode
  index: number
  completedNodeIds: string[]
  onStartLesson: (lessonId: string, nodeId: string) => void
  onViewEvidence: (nodeId: string) => void
  onShowRationale?: (stepId: string, stepTitle: string) => void
}) {
  const status = getNodeStatus(node.id, completedNodeIds)
  const cfg = nodeStatusConfig[status]
  const StatusIcon = cfg.icon
  const canStart = status === 'pending' || status === 'active'

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4 transition-colors',
        status === 'completed'
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70',
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {status === 'completed' ? (
          <StatusIcon className={cn('size-4', cfg.className)} aria-label={cfg.label} />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">{index}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{node.lessonTitle}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3" />
          <span>約{node.estimatedMinutes}分</span>
        </div>
      </div>

      {onShowRationale ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onShowRationale(node.id, node.lessonTitle)}
          data-testid="plan-step-rationale-button"
          aria-label={`${node.lessonTitle} の選定根拠を見る`}
        >
          <HelpCircle className="size-3" />
          なぜ?
        </Button>
      ) : null}
      {canStart ? (
        <Button size="xs" onClick={() => onStartLesson(node.lessonId, node.id)}>
          開始する
        </Button>
      ) : null}
      {status === 'completed' ? (
        <Button size="xs" variant="ghost" onClick={() => onViewEvidence(node.id)}>
          成果物
        </Button>
      ) : null}
    </li>
  )
}

export { CompiledPlanPage }
export type { CompiledPlanPageProps }
