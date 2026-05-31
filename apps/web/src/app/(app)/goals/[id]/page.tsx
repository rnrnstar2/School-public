import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { z } from 'zod/v4'

import { ProgressTimeline } from '@/components/goals/progress-timeline'
import { fetchGoalContextForUser } from '@/lib/goals/goal-context'
import { listProgressTimelineForGoal } from '@/lib/goals/progress-timeline'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { GoalContextRefreshBridge } from '@/components/goals/goal-context-refresh-bridge'
import { OwnerTypeBadge } from '@/components/goal-tree/owner-type-badge'
import type {
  GoalContextApiResponse,
  GoalContextArtifactItem,
  GoalContextAssessment,
  GoalContextMemoryItem,
  GoalContextRecentChatUpdate,
  GoalContextNodeSummary,
  GoalContextSourceItem,
} from '@/types/goal-tree'

export const dynamic = 'force-dynamic'

const goalPageParamsSchema = z.object({
  id: z.string().uuid(),
})

const GOAL_STATUS_STYLES: Record<
  GoalContextApiResponse['goal']['status'],
  { label: string; className: string }
> = {
  active: {
    label: '進行中',
    className:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  },
  paused: {
    label: '停止中',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  },
  completed: {
    label: '完了',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  archived: {
    label: 'アーカイブ',
    className:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  },
}

const NODE_STATUS_LABELS: Record<GoalContextNodeSummary['status'], string> = {
  pending: '未着手',
  in_progress: '進行中',
  done: '完了',
  blocked: '要対応',
  skipped: '保留',
}

const CHAT_UPDATE_KIND_LABELS: Record<GoalContextRecentChatUpdate['kind'], string> = {
  decision: 'Decision',
  open_question: 'Open question',
  next_action: 'Next action',
}

const SPEAK2ACTION_SOURCE_TYPES = new Set([
  'speak2action_decision',
  'speak2action_open_question',
])

function formatDate(value: string | null) {
  if (!value) {
    return '未設定'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) {
    return value
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
  }).format(parsed)
}

function ContextSection(props: {
  id?: string
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      id={props.id}
      open={props.defaultOpen ? true : undefined}
      className="rounded-[24px] border border-border bg-card/90 p-4 shadow-sm sm:p-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-foreground">{props.title}</p>
          <p className="text-xs text-muted-foreground">タップして詳細を開く</p>
        </div>
        {typeof props.count === 'number' ? (
          <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {props.count}
          </span>
        ) : null}
      </summary>
      <div className="mt-4 border-t border-border/70 pt-4">
        {props.children}
      </div>
    </details>
  )
}

function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
      {props.message}
    </div>
  )
}

function NodeSummaryList(props: { nodes: GoalContextNodeSummary[] }) {
  if (props.nodes.length === 0) {
    return <EmptyPanel message="goal tree node はまだ保存されていません。" />
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {props.nodes.slice(0, 5).map((node) => (
          <li
            key={node.id}
            className="rounded-2xl border border-border bg-background/70 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {NODE_STATUS_LABELS[node.status]}
              </span>
              <OwnerTypeBadge
                ownerType={node.owner_type}
                size="sm"
                showAiDelegatable
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{node.label}</p>
            {node.next_action_preview ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Next: {node.next_action_preview}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Link
          href="/goals"
          className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          完全ツリーを見る
        </Link>
      </div>
    </div>
  )
}

function MemoryList(props: { items: GoalContextMemoryItem[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="mentor memory はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {item.source}
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {item.bullets.map((bullet) => (
              <li key={`${item.id}-${bullet}`}>• {bullet}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function GoalContextList(props: { items: GoalContextSourceItem[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="goal に紐づく context source はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{item.source_type}</p>
            <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.content}</p>
          {item.source_uri ? (
            <div className="mt-3">
              <a
                href={item.source_uri}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-primary underline underline-offset-4"
              >
                source を開く
              </a>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function chatSourceLabel(value: string | null | undefined) {
  if (value === 'lesson_chat') return 'Lesson chat'
  if (value === 'mentor_chat') return 'Mentor chat'
  if (value === 'hearing') return 'Hearing'
  return 'Chat'
}

function RecentChatUpdatesList(props: { items: GoalContextRecentChatUpdate[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="chat 由来の更新はまだありません。" />
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {props.items.slice(0, 5).map((item) => (
          <li key={`${item.kind}-${item.id}`} className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                  {CHAT_UPDATE_KIND_LABELS[item.kind]}
                </span>
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  {chatSourceLabel(item.chat_source)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.content}</p>
            {item.source_uri ? (
              <div className="mt-3">
                <a
                  href={item.source_uri}
                  className="text-sm font-semibold text-primary underline underline-offset-4"
                >
                  チャットへ戻る
                </a>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {props.items.length > 5 ? (
        <p className="text-xs text-muted-foreground">
          最新 5 件を表示しています。
        </p>
      ) : null}
    </div>
  )
}

function delegateKindLabel(value: unknown) {
  if (value === 'prompt') return 'Prompt'
  if (value === 'code_brief') return 'Code Brief'
  if (value === 'analyze') return 'Analyze'
  if (value === 'codex_cli_brief') return 'Codex CLI Brief'
  if (value === 'claude_code_brief') return 'Claude Code Brief'
  return 'Brief'
}

function agentLabel(value: unknown) {
  if (value === 'codex') return 'Codex CLI'
  if (value === 'claude_code') return 'Claude Code'
  return 'Agent'
}

function AiDelegationBriefList(props: {
  items: GoalContextSourceItem[]
  nodeLabelById: Map<string, string>
}) {
  if (props.items.length === 0) {
    return <EmptyPanel message="AI delegation brief はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => {
        const nodeLabel = item.node_id
          ? props.nodeLabelById.get(item.node_id) ?? `node:${item.node_id.slice(0, 8)}`
          : null

        return (
          <li key={item.id} className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                    {delegateKindLabel(item.metadata?.delegate_kind)}
                  </span>
                  {nodeLabel ? (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      {nodeLabel}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-foreground">AI delegation brief</p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.content}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function AgentDelegationBriefList(props: {
  items: GoalContextSourceItem[]
  nodeLabelById: Map<string, string>
}) {
  if (props.items.length === 0) {
    return <EmptyPanel message="Agent delegation brief はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => {
        const nodeLabel = item.node_id
          ? props.nodeLabelById.get(item.node_id) ?? `node:${item.node_id.slice(0, 8)}`
          : null

        return (
          <li key={item.id} className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {agentLabel(item.metadata?.agent)}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                    {delegateKindLabel(item.metadata?.delegate_kind)}
                  </span>
                  {nodeLabel ? (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      {nodeLabel}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-foreground">Agent delegation brief</p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.content}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function ArtifactList(props: { items: GoalContextArtifactItem[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="この goal に関連する成果物はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {item.title ?? item.step_title ?? '成果物'}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.milestone_title ?? 'Milestone 未設定'}
                {item.step_title ? ` / ${item.step_title}` : ''}
              </p>
            </div>
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {item.artifact_type}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.content_preview}</p>
          {item.url ? (
            <div className="mt-3">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-primary underline underline-offset-4"
              >
                成果物リンクを開く
              </a>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function DecisionsList(props: { items: string[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="structured decisions はまだ記録されていません。" />
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
      {props.items.map((decision) => (
        <li key={decision}>• {decision}</li>
      ))}
    </ul>
  )
}

function AssessmentList(props: { items: GoalContextAssessment[] }) {
  if (props.items.length === 0) {
    return <EmptyPanel message="assessment はまだありません。" />
  }

  return (
    <ul className="space-y-3">
      {props.items.map((item) => (
        <li key={item.capability_slug} className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.capability_slug}</p>
            </div>
            <span className="text-sm font-semibold text-foreground">{item.latest_score}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ProfileStateSection(props: {
  data: GoalContextApiResponse
}) {
  const { profile, state } = props.data

  if (!profile && !state) {
    return <EmptyPanel message="learner profile / state はまだありません。" />
  }

  return (
    <div className="space-y-5">
      {profile ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Profile</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Display</dt>
              <dd className="mt-2 text-sm text-foreground">{profile.display_name ?? '未設定'}</dd>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Experience</dt>
              <dd className="mt-2 text-sm text-foreground">
                {profile.experience_summary ?? profile.experience_level ?? '未設定'}
              </dd>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tools</dt>
              <dd className="mt-2 text-sm text-foreground">
                {profile.available_ai_tools.length > 0
                  ? profile.available_ai_tools.join(' / ')
                  : profile.tool_familiarity ?? '未設定'}
              </dd>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">OS</dt>
              <dd className="mt-2 text-sm text-foreground">{profile.operating_system ?? '未設定'}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {state ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">State</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Capabilities</p>
              {state.capabilities.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-foreground">
                  {state.capabilities.map((capability) => (
                    <li key={capability}>• {capability}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">保存済み capability はありません。</p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Blockers</p>
              {state.blockers.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-foreground">
                  {state.blockers.map((blocker) => (
                    <li key={blocker}>• {blocker}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">blocker は記録されていません。</p>
              )}
            </div>
          </div>
          <AssessmentList items={state.assessments_top5} />
        </div>
      ) : null}
    </div>
  )
}

function GoalContextForbidden() {
  return (
    <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-rose-50/80 p-6 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700 dark:text-rose-200">
        403
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">この goal にはアクセスできません</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        goal の owner と現在のユーザーが一致しません。別の goal を確認してください。
      </p>
      <div className="mt-5">
        <Link
          href="/goals"
          className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          ゴール一覧へ戻る
        </Link>
      </div>
    </div>
  )
}

export default async function GoalContextPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const parsedParams = goalPageParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    notFound()
  }

  const goalId = parsedParams.data.id
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/goals/${goalId}`)
  }

  const result = await fetchGoalContextForUser(user.id, goalId)

  if (result.kind === 'not_found') {
    notFound()
  }

  if (result.kind === 'forbidden') {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <GoalContextForbidden />
        </div>
      </div>
    )
  }

  if (result.kind === 'error') {
    throw new Error(result.message)
  }

  const data = result.data
  const timelineResult = await listProgressTimelineForGoal(user.id, goalId)

  if (timelineResult.kind === 'not_found') {
    notFound()
  }

  if (timelineResult.kind === 'forbidden') {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <GoalContextForbidden />
        </div>
      </div>
    )
  }

  if (timelineResult.kind === 'error') {
    throw new Error(timelineResult.message)
  }

  const status = GOAL_STATUS_STYLES[data.goal.status]
  const aiDelegationBriefs = data.goal_contexts.filter(
    (item) => item.source_type === 'ai_delegation_brief',
  )
  const agentDelegationBriefs = data.goal_contexts.filter(
    (item) => item.source_type === 'agent_delegation_brief',
  )
  const contextSources = data.goal_contexts.filter(
    (item) =>
      item.source_type !== 'ai_delegation_brief'
      && item.source_type !== 'agent_delegation_brief'
      && !SPEAK2ACTION_SOURCE_TYPES.has(item.source_type),
  )
  const nodeLabelById = new Map(data.nodes.map((node) => [node.id, node.label]))

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <GoalContextRefreshBridge goalId={goalId} />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-4 rounded-[32px] border border-border bg-card/95 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Goal Context Panel
              </p>
              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {data.goal.title}
              </h1>
              {data.goal.description ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {data.goal.description}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold',
                status.className,
              )}
            >
              {status.label}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Deadline</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(data.goal.deadline)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(data.goal.created_at)}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
                  Current Next Action
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {data.next_action ?? 'structured next_action はまだ記録されていません。'}
                </p>
              </div>
              <Link
                href="/goals"
                className="inline-flex items-center justify-center rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
              >
                完全ツリーを見る
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <ContextSection title="Goal Tree (summary)" count={data.nodes.length}>
            <NodeSummaryList nodes={data.nodes} />
          </ContextSection>

          <ContextSection title="Mentor Memory" count={data.mentor_memories.length}>
            <MemoryList items={data.mentor_memories} />
          </ContextSection>

          <ContextSection
            id="ai-delegation-briefs"
            title="AI Delegation Briefs"
            count={aiDelegationBriefs.length}
          >
            <AiDelegationBriefList
              items={aiDelegationBriefs}
              nodeLabelById={nodeLabelById}
            />
          </ContextSection>

          <ContextSection
            id="agent-delegation-briefs"
            title="Agent Delegation Briefs"
            count={agentDelegationBriefs.length}
          >
            <AgentDelegationBriefList
              items={agentDelegationBriefs}
              nodeLabelById={nodeLabelById}
            />
          </ContextSection>

          <ContextSection
            id="recent-chat-derived-updates"
            title="Recent chat-derived updates"
            count={data.recent_chat_updates.length}
          >
            <RecentChatUpdatesList items={data.recent_chat_updates} />
          </ContextSection>

          <ContextSection title="Context Sources" count={contextSources.length}>
            <GoalContextList items={contextSources} />
          </ContextSection>

          <ContextSection title="Artifacts" count={data.artifacts.length}>
            <ArtifactList items={data.artifacts} />
          </ContextSection>

          <ContextSection title="Decisions" count={data.decisions.length}>
            <DecisionsList items={data.decisions} />
          </ContextSection>

          <ContextSection
            title="Profile / State"
            count={(data.profile ? 1 : 0) + (data.state ? 1 : 0)}
          >
            <ProfileStateSection data={data} />
          </ContextSection>

          <ContextSection
            title="Progress Timeline"
            count={timelineResult.data.length}
            defaultOpen
          >
            <ProgressTimeline events={timelineResult.data} />
          </ContextSection>
        </div>
      </div>
    </div>
  )
}
