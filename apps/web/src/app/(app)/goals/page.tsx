import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { AiDelegationButton } from '@/components/goals/ai-delegation-button'
import { fetchAtomsByIds } from '@/lib/atoms/atom-repository'
import { listGoalsWithNodesForUser } from '@/lib/supabase/decision-ledger'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { OwnerTypeBadge } from '@/components/goal-tree/owner-type-badge'
import {
  goalTreeApiResponseSchema,
  type GoalTreeApiResponse,
  type GoalTreeGoal,
  type GoalTreeNode,
} from '@/types/goal-tree'

export const dynamic = 'force-dynamic'
const MAX_TREE_DEPTH = 50

type GoalTreeBranch = GoalTreeNode & {
  children: GoalTreeBranch[]
}

const STATUS_STYLES: Record<GoalTreeNode['status'], { label: string; className: string }> = {
  pending: {
    label: '未着手',
    className:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  },
  in_progress: {
    label: '進行中',
    className:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  },
  done: {
    label: '完了',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  blocked: {
    label: '要対応',
    className:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200',
  },
  skipped: {
    label: '保留',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  },
}

const NODE_TYPE_LABELS: Record<GoalTreeNode['node_type'], string> = {
  objective: 'Objective',
  milestone: 'Milestone',
  task: 'Task',
  sub_task: 'Sub task',
}

async function loadGoalTree(userId: string): Promise<GoalTreeApiResponse> {
  const result = await listGoalsWithNodesForUser(userId)
  if (result.error || !result.data) {
    throw new Error(`Failed to load goals: ${result.error ?? 'unknown error'}`)
  }

  return goalTreeApiResponseSchema.parse({
    goals: result.data,
  })
}

function compareNodes(left: GoalTreeNode, right: GoalTreeNode) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order
  }

  return left.label.localeCompare(right.label, 'ja')
}

function buildGoalTree(nodes: GoalTreeNode[]): GoalTreeBranch[] {
  const byId = new Map<string, GoalTreeBranch>()
  const roots: GoalTreeBranch[] = []

  for (const node of [...nodes].sort(compareNodes)) {
    byId.set(node.id, {
      ...node,
      children: [],
    })
  }

  for (const node of [...byId.values()].sort(compareNodes)) {
    if (!node.parent_node_id) {
      roots.push(node)
      continue
    }

    const parent = byId.get(node.parent_node_id)
    if (!parent) {
      roots.push(node)
      continue
    }

    parent.children.push(node)
  }

  return roots
}

async function buildLessonTitleMap(goals: GoalTreeGoal[]) {
  const lessonIds = Array.from(new Set(
    goals.flatMap((goal) =>
      goal.nodes.flatMap((node) =>
        node.selected_lesson ? [node.selected_lesson.lesson_id] : [],
      ),
    ),
  ))

  if (lessonIds.length === 0) {
    return new Map<string, string>()
  }

  const atoms = await fetchAtomsByIds(lessonIds)
  return new Map(atoms.map((atom) => [atom.atomId, atom.title]))
}

function resolveNodeLabels(nodeIds: string[], nodeLabelById: Map<string, string>) {
  return nodeIds.map((nodeId) => nodeLabelById.get(nodeId) ?? `node:${nodeId.slice(0, 8)}`)
}

function GoalNodeItem(props: {
  goalId: string
  node: GoalTreeBranch
  level: number
  lessonTitleById: Map<string, string>
  nodeLabelById: Map<string, string>
}) {
  const { goalId, node, level, lessonTitleById, nodeLabelById } = props
  const status = STATUS_STYLES[node.status]
  const lessonTitle = node.selected_lesson
    ? lessonTitleById.get(node.selected_lesson.lesson_id) ?? node.selected_lesson.lesson_id
    : null
  const dependsOnLabels = resolveNodeLabels(node.depends_on_node_ids, nodeLabelById)
  const fallbackLabel = node.fallback_node_id
    ? nodeLabelById.get(node.fallback_node_id) ?? `node:${node.fallback_node_id.slice(0, 8)}`
    : null
  const canRenderChildren = node.children.length > 0 && level < MAX_TREE_DEPTH

  return (
    <li
      id={`goal-node-${node.id}`}
      role="treeitem"
      aria-level={level}
      aria-expanded={node.children.length > 0 ? canRenderChildren : undefined}
      tabIndex={0}
      className="list-none scroll-mt-24 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&:target]:ring-2 [&:target]:ring-primary/60 [&:target]:ring-offset-2"
    >
      <div className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {NODE_TYPE_LABELS[node.node_type]}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                  status.className,
                )}
              >
                {status.label}
              </span>
              <OwnerTypeBadge
                ownerType={node.owner_type}
                size="sm"
                showAiDelegatable
              />
            </div>
            <p className="mt-2 break-words text-sm font-semibold leading-6 text-foreground sm:text-[15px]">
              {node.label}
            </p>
            {dependsOnLabels.length > 0 ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                ↑ {dependsOnLabels.join(' / ')} を先に完了
              </p>
            ) : null}
            {fallbackLabel && node.fallback_node_id ? (
              <div className="mt-2">
                <Link
                  href={`#goal-node-${node.fallback_node_id}`}
                  className="text-xs font-semibold text-primary underline underline-offset-4"
                >
                  Open fallback: {fallbackLabel}
                </Link>
              </div>
            ) : null}
          </div>

          <AiDelegationButton
            goalId={goalId}
            nodeId={node.id}
            nodeLabel={node.label}
            ownerType={node.owner_type}
            nodeType={node.node_type}
            className="shrink-0"
          />
        </div>

        {node.selected_lesson && lessonTitle ? (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/60 dark:bg-sky-950/30">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
              Selected lesson
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">
                  {lessonTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  score {node.selected_lesson.score.toFixed(2)}
                </p>
              </div>
              <Link
                href={`/lessons/${node.selected_lesson.lesson_id}`}
                className="touch-target inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open lesson
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {canRenderChildren ? (
        <ul
          role="group"
          className="mt-3 space-y-3 border-l border-border/80 pl-3 sm:pl-4"
        >
          {node.children.map((child) => (
            <GoalNodeItem
              key={child.id}
              goalId={goalId}
              node={child}
              level={level + 1}
              lessonTitleById={lessonTitleById}
              nodeLabelById={nodeLabelById}
            />
          ))}
        </ul>
      ) : null}
      {!canRenderChildren && node.children.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          深さ制限 {MAX_TREE_DEPTH} に達したため、この先の node 表示を省略しました。
        </p>
      ) : null}
    </li>
  )
}

function GoalTreeSection(props: {
  goal: GoalTreeGoal
  lessonTitleById: Map<string, string>
}) {
  const tree = buildGoalTree(props.goal.nodes)
  const nodeLabelById = new Map(props.goal.nodes.map((node) => [node.id, node.label]))
  const goalStatus = {
    active: '進行中',
    paused: '停止中',
    completed: '完了済み',
    archived: 'アーカイブ',
  }[props.goal.status]

  return (
    <section
      key={props.goal.id}
      className="rounded-[28px] border border-border bg-card/90 p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Goal
          </p>
          <h2 className="mt-2 break-words text-xl font-semibold text-foreground sm:text-2xl">
            <Link
              href={`/goals/${props.goal.id}`}
              className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {props.goal.title}
            </Link>
          </h2>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          {goalStatus}
        </span>
      </div>

      <ul
        role="tree"
        aria-label={`${props.goal.title} の goal tree`}
        className="mt-5 space-y-4"
      >
        <li
          role="treeitem"
          aria-level={1}
          aria-expanded={true}
          tabIndex={0}
          className="list-none rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="rounded-3xl border border-orange-200 bg-orange-50/80 p-4 dark:border-orange-900/60 dark:bg-orange-950/30">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">
              Goal root
            </p>
            <p className="mt-2 break-words text-sm font-semibold leading-6 text-foreground sm:text-[15px]">
              {props.goal.title}
            </p>
          </div>

          {tree.length > 0 ? (
            <ul
              role="group"
              className="mt-4 space-y-3 border-l border-border/80 pl-3 sm:pl-4"
            >
              {tree.map((node) => (
                <GoalNodeItem
                  key={node.id}
                  goalId={props.goal.id}
                  node={node}
                  level={2}
                  lessonTitleById={props.lessonTitleById}
                  nodeLabelById={nodeLabelById}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {props.goal.nodes.length === 0
                ? 'まだ node がありません。'
                : 'root node を解決できないため tree を描画できません。'}
            </p>
          )}
        </li>
      </ul>
    </section>
  )
}

function GoalsEmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-border bg-card/70 p-6 text-center sm:p-8">
      <h2 className="text-lg font-semibold text-foreground">まだ goal がありません。</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        <Link href="/plan" className="font-semibold text-primary underline underline-offset-4">
          /plan
        </Link>
        {' '}でヒアリングを始めましょう。
      </p>
    </div>
  )
}

async function GoalsPageContent({ userId }: { userId: string }) {
  const payload = await loadGoalTree(userId)

  if (payload.goals.length === 0) {
    return <GoalsEmptyState />
  }

  const lessonTitleById = await buildLessonTitleMap(payload.goals)

  return (
    <div className="space-y-6">
      {payload.goals.map((goal) => (
        <GoalTreeSection
          key={goal.id}
          goal={goal}
          lessonTitleById={lessonTitleById}
        />
      ))}
    </div>
  )
}

function GoalsPageSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="rounded-[28px] border border-border bg-card/80 p-6 shadow-sm">
        <div className="h-4 w-24 rounded-full bg-muted" />
        <div className="mt-3 h-8 w-2/3 rounded-full bg-muted" />
        <div className="mt-6 space-y-3">
          <div className="h-28 rounded-2xl bg-muted/80" />
          <div className="h-28 rounded-2xl bg-muted/80" />
        </div>
      </div>
    </div>
  )
}

export default async function GoalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/goals')
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Goal tree
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            ゴールツリー
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            今の目標、マイルストーン、タスク、推奨レッスンを 1 画面で見渡せます。
          </p>
        </div>

        <Suspense fallback={<GoalsPageSkeleton />}>
          <GoalsPageContent userId={user.id} />
        </Suspense>
      </div>
    </div>
  )
}
