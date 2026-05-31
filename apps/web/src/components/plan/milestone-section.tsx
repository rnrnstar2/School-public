'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Lock,
  PlayCircle,
  SkipForward,
} from 'lucide-react'
import { Button } from '@school/ui/button'
import { cn } from '@/lib/utils'
import type { CompiledMilestone, CompiledPlanNode } from '@/lib/planner/goal-first/types'
import type { PlanNodeStatus } from '@/types/domain'
import { PlanProgressBar } from './plan-progress-bar'

interface MilestoneSectionProps {
  milestone: CompiledMilestone
  nodes: CompiledPlanNode[]
  completedNodeIds: string[]
  nodeStatuses?: Record<string, PlanNodeStatus>
  onStartLesson: (lessonId: string, nodeId: string) => void
  onViewEvidence: (nodeId: string) => void
  defaultOpen?: boolean
}

function getNodeStatus(
  nodeId: string,
  completedNodeIds: string[],
  nodeStatuses?: Record<string, PlanNodeStatus>,
): PlanNodeStatus {
  if (completedNodeIds.includes(nodeId)) return 'completed'
  return nodeStatuses?.[nodeId] ?? 'pending'
}

const statusConfig: Record<
  PlanNodeStatus,
  { icon: React.ElementType; className: string; label: string }
> = {
  pending: {
    icon: Circle,
    className: 'text-slate-400 dark:text-slate-500',
    label: '未着手',
  },
  active: {
    icon: PlayCircle,
    className: 'text-blue-500 dark:text-blue-400',
    label: '進行中',
  },
  completed: {
    icon: CheckCircle2,
    className: 'text-emerald-500 dark:text-emerald-400',
    label: '完了',
  },
  skipped: {
    icon: SkipForward,
    className: 'text-slate-400 dark:text-slate-500',
    label: 'スキップ',
  },
  blocked: {
    icon: Lock,
    className: 'text-slate-400 dark:text-slate-500',
    label: 'ロック中',
  },
}

function MilestoneSection({
  milestone,
  nodes,
  completedNodeIds,
  nodeStatuses,
  onStartLesson,
  onViewEvidence,
  defaultOpen = false,
}: MilestoneSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const sortedNodes = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)
  const completedCount = sortedNodes.filter((n) =>
    completedNodeIds.includes(n.id),
  ).length
  const allDone = completedCount === sortedNodes.length && sortedNodes.length > 0

  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground',
        allDone
          ? 'border-emerald-200 dark:border-emerald-900/40'
          : 'border-border',
      )}
    >
      {/* Accordion trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">
            {milestone.title}
          </h3>
          {milestone.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {milestone.description}
            </p>
          )}
        </div>
        <PlanProgressBar
          completed={completedCount}
          total={sortedNodes.length}
          className="w-28 sm:w-36"
        />
      </button>

      {/* Expandable content */}
      {open && (
        <div className="border-t px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
          <ul className="space-y-2" role="list">
            {sortedNodes.map((node) => {
              const status = getNodeStatus(node.id, completedNodeIds, nodeStatuses)
              const cfg = statusConfig[status]
              const StatusIcon = cfg.icon
              const canStart = status === 'pending' || status === 'active'

              return (
                <li
                  key={node.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-3 transition-colors',
                    status === 'completed'
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                      : status === 'active'
                        ? 'bg-blue-50/50 dark:bg-blue-950/20'
                        : 'bg-slate-50/50 dark:bg-slate-900/20',
                  )}
                >
                  {/* Status icon */}
                  <StatusIcon
                    className={cn('mt-0.5 size-4 shrink-0', cfg.className)}
                    aria-label={cfg.label}
                  />

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {node.lessonTitle}
                    </p>
                    {node.rationale && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {node.rationale}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="size-3" />
                      <span>約{node.estimatedMinutes}分</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canStart && (
                      <Button
                        size="xs"
                        onClick={() => onStartLesson(node.lessonId, node.id)}
                      >
                        開始する
                      </Button>
                    )}
                    {status === 'completed' && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onViewEvidence(node.id)}
                      >
                        成果物
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export { MilestoneSection }
export type { MilestoneSectionProps }
