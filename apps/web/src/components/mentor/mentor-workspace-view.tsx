'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Brain,
  Edit3,
  Eye,
  LineChart,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '@school/ui/button'
import { OwnerTypeBadge } from '@/components/goal-tree/owner-type-badge'
import { CountAccordionSection } from '@/components/ui/count-accordion-section'
import { useRefreshOnVisible } from '@/hooks/use-refresh-on-visible'
import { buildLessonHref } from '@/lib/planner/task-links'
import { writePlannerGoalToStorage } from '@/lib/planner/workspace-session'
import { getTaskStatusTone, isTaskFinished, type TaskEditorState, type TaskStatusOption } from '@/lib/planner/status-helpers'
import type {
  PlannerAdapterResult,
  PlannerContinuationPlan,
  PlannerLessonReference,
  PlannerMentorWorkspace,
  PlannerResolvedTaskState,
  PlannerTaskProgressRecord,
  PlannerTaskProgressStatus,
} from '@/lib/planner/types'
import type { LearnerUnderstandingProfile, SubdividedTask } from '@/lib/planner/resume-personalization'
import type { LearnerState, MentorMemory } from '@/types'

function formatDeadline(deadline: string | undefined) {
  if (!deadline) {
    return null
  }

  return deadline.trim()
}

function buildAnalyticsCount(
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

function dedupeLessons(lessons: PlannerLessonReference[]) {
  const seen = new Set<string>()
  return lessons.filter((lesson) => {
    if (seen.has(lesson.lessonId)) {
      return false
    }

    seen.add(lesson.lessonId)
    return true
  })
}

function buildCompletedLessonIds(taskProgress: Record<string, PlannerTaskProgressRecord>) {
  const completedLessonIds = new Set<string>()

  for (const progress of Object.values(taskProgress)) {
    if (!isTaskFinished(progress.status)) {
      continue
    }

    for (const lessonId of progress.relevantLessonIds ?? []) {
      completedLessonIds.add(lessonId)
    }
  }

  return completedLessonIds
}

function mapSubtasksToSteps(subtasks: SubdividedTask[]) {
  return subtasks.map((subtask) => ({
    id: subtask.id,
    title: subtask.title,
    description: subtask.description,
    outcome: subtask.outcome,
    requirement: subtask.requirement,
  }))
}

function buildTaskEditorDraft(params: {
  taskEditor: TaskEditorState | null
  previewTaskState: PlannerResolvedTaskState | null
  workspace: PlannerMentorWorkspace
  activeTaskStatus: PlannerTaskProgressStatus
}) {
  const { taskEditor, previewTaskState, workspace, activeTaskStatus } = params

  return {
    title: taskEditor?.title ?? previewTaskState?.currentTask.title ?? workspace.currentTask.title,
    status: taskEditor?.status ?? activeTaskStatus,
    do: taskEditor?.do ?? previewTaskState?.currentTask.do ?? workspace.currentTask.do,
    learn: taskEditor?.learn ?? previewTaskState?.currentTask.learn ?? workspace.currentTask.learn,
    why: taskEditor?.why ?? previewTaskState?.currentTask.why ?? workspace.currentTask.why,
    relevantLessonIds: taskEditor?.relevantLessonIds ?? [],
  } satisfies TaskEditorState
}

function isSameTaskEditorDraft(left: TaskEditorState, right: TaskEditorState) {
  return left.title === right.title
    && left.status === right.status
    && left.do === right.do
    && left.learn === right.learn
    && left.why === right.why
    && left.relevantLessonIds.length === right.relevantLessonIds.length
    && left.relevantLessonIds.every((lessonId, index) => lessonId === right.relevantLessonIds[index])
}

export interface MentorWorkspaceViewProps {
  goal: string
  trackId?: string | null
  workspace: PlannerMentorWorkspace
  result: PlannerAdapterResult
  continuation?: PlannerContinuationPlan
  previewTaskState: PlannerResolvedTaskState | null
  availableLessons: PlannerLessonReference[]
  activeTaskStatus: PlannerTaskProgressStatus
  activeTaskStatusOption: TaskStatusOption
  taskEditor: TaskEditorState | null
  taskStatusOptions: TaskStatusOption[]
  taskStatusTimestamp: string | null
  currentStepReason: string
  taskProgress: Record<string, PlannerTaskProgressRecord>
  recommendedLessonId?: string | null
  activeStepId?: string | null
  nextStepId?: string | null
  loading: boolean
  onTaskStatusChange: (taskId: string, status: PlannerTaskProgressStatus) => void
  onTaskContextSave: (editorState?: TaskEditorState) => void
  onRelevantLessonToggle: (lessonId: string) => void
  onPlanReviewRequest?: () => void
  planReviewAvailable?: boolean
  understanding?: LearnerUnderstandingProfile | null
  learnerState?: LearnerState | null
  mentorMemories?: MentorMemory[]
  onMemoryUpdate?: (id: string, updates: { title?: string; bullets?: string[] }) => Promise<void>
  onMemoryDelete?: (id: string) => Promise<void>
  onInsightFeedback?: (type: 'remove_blocker' | 'add_strength' | 'remove_weakness', value: string) => Promise<void>
  taskSubdivision?: { targetStepId: string; subtasks: SubdividedTask[] } | null
}

export function MentorWorkspaceView({
  goal,
  trackId,
  workspace,
  result,
  continuation,
  previewTaskState,
  availableLessons,
  activeTaskStatus,
  activeTaskStatusOption,
  taskEditor,
  currentStepReason,
  taskProgress,
  recommendedLessonId,
  activeStepId,
  nextStepId,
  loading,
  onTaskStatusChange,
  onTaskContextSave,
  understanding,
  learnerState,
  mentorMemories = [],
  onInsightFeedback,
  taskSubdivision,
}: MentorWorkspaceViewProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const editorBaseline = useMemo(
    () =>
      buildTaskEditorDraft({
        taskEditor,
        previewTaskState,
        workspace,
        activeTaskStatus,
      }),
    [activeTaskStatus, previewTaskState, taskEditor, workspace],
  )
  const [draftEditor, setDraftEditor] = useState<TaskEditorState | null>(null)
  const [saveState, setSaveState] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  useRefreshOnVisible(
    useCallback(() => {
      router.refresh()
    }, [router]),
  )

  useEffect(() => {
    writePlannerGoalToStorage(goal)
  }, [goal])

  const currentTask = previewTaskState?.currentTask ?? workspace.currentTask
  const relevantLessons = previewTaskState?.relevantLessons ?? workspace.relevantLessons
  const routeContext = { goal, trackId, taskId: currentTask.id, stepId: currentTask.id }
  const deadline = formatDeadline(learnerState?.signals?.deadline)
  const completedLessonIds = useMemo(() => buildCompletedLessonIds(taskProgress), [taskProgress])
  const primaryLesson = useMemo(() => {
    const incompleteLessons = dedupeLessons([...relevantLessons, ...availableLessons]).filter(
      (lesson) => !completedLessonIds.has(lesson.lessonId),
    )
    return incompleteLessons.find((lesson) => lesson.lessonId === recommendedLessonId)
      ?? incompleteLessons[0]
      ?? null
  }, [availableLessons, completedLessonIds, recommendedLessonId, relevantLessons])
  const totalSteps = continuation?.steps.length ?? 0
  const completedSteps = continuation?.steps.filter((step) =>
    isTaskFinished(taskProgress[step.id]?.status ?? 'not-started'),
  ).length ?? 0
  const activeDraftEditor = draftEditor ?? editorBaseline
  const isInlineEditorOpen = isEditing
  const isInlineEditorDirty = isInlineEditorOpen && !isSameTaskEditorDraft(activeDraftEditor, editorBaseline)
  const analyticsCount = buildAnalyticsCount(understanding, learnerState)
  const subdivisionItems = taskSubdivision?.subtasks
    ? mapSubtasksToSteps(taskSubdivision.subtasks)
    : (continuation?.steps ?? []).map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        outcome: step.outcome,
        requirement: step.requirement,
      }))
  const nextTask = subdivisionItems.find((item) => item.id === nextStepId)
    ?? subdivisionItems.find((item) =>
      item.id !== (activeStepId ?? currentTask.id)
      && (taskProgress[item.id]?.status ?? 'not-started') === 'not-started',
    )
    ?? null

  async function handleSave() {
    setSaveState(null)

    try {
      await Promise.resolve(onTaskContextSave(activeDraftEditor))
      setDraftEditor(null)
      setIsEditing(false)
      setSaveState({ tone: 'success', message: 'タスク内容を更新しました。' })
    } catch (error) {
      setSaveState({
        tone: 'error',
        message: error instanceof Error ? error.message : 'タスク内容の保存に失敗しました。',
      })
    }
  }

  function handleCancel() {
    setDraftEditor(null)
    setIsEditing(false)
    setSaveState(null)
  }

  function handlePrimaryAction() {
    if (isInlineEditorOpen) {
      if (isInlineEditorDirty) {
        setSaveState({ tone: 'error', message: '保存してから進んでください。' })
      }
      return
    }

    if (activeTaskStatus === 'in-progress') {
      onTaskStatusChange(currentTask.id, 'completed')
      return
    }

    if (activeTaskStatus === 'completed') {
      return
    }

    onTaskStatusChange(currentTask.id, 'in-progress')

    if (primaryLesson) {
      router.push(buildLessonHref(primaryLesson.lessonId, routeContext))
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void handleSave()
    }
  }

  const primaryActionLabel =
    activeTaskStatus === 'in-progress'
      ? '完了する'
      : activeTaskStatus === 'completed'
        ? '完了済み'
        : 'このタスクを始める'

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
              data-testid="mentor-workspace-goal"
            >
              {result.recommendation.userFacingGoal || goal || result.recommendation.normalizedGoal}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {completedSteps >= totalSteps && totalSteps > 0 ? '完了' : '進行中'}
              </span>
              {deadline ? (
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium dark:border-slate-700 dark:bg-slate-900">
                  期限: {deadline}
                </span>
              ) : null}
              {totalSteps > 0 ? <span>{completedSteps}/{totalSteps} タスク完了</span> : null}
            </div>
          </div>

          <Button
            size="sm"
            onClick={handlePrimaryAction}
            disabled={loading || activeTaskStatus === 'completed' || isInlineEditorOpen}
            data-testid="mentor-workspace-primary-cta"
            aria-describedby={isInlineEditorDirty ? 'mentor-workspace-inline-editor-note' : undefined}
          >
            {primaryActionLabel}
          </Button>
        </div>
        {isInlineEditorDirty ? (
          <p
            id="mentor-workspace-inline-editor-note"
            className="mt-3 text-xs text-amber-700 dark:text-amber-200"
          >
            保存してから進んでください。
          </p>
        ) : null}
      </header>

      <section
        aria-label="現在のタスク"
        className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/85"
        data-testid="mentor-workspace-current-task"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
              <Sparkles className="size-4" />
              現在のタスク
              <OwnerTypeBadge ownerType="user" size="sm" showAiDelegatable />
            </div>
            {isEditing ? (
              <input
                value={activeDraftEditor.title}
                onChange={(event) => {
                  setDraftEditor((previous) => ({
                    ...(previous ?? editorBaseline),
                    title: event.target.value,
                  }))
                }}
                onKeyDown={handleEditorKeyDown}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-lg font-semibold text-slate-950 focus:border-orange-300 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                aria-label="タスクタイトル"
              />
            ) : (
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                {currentTask.title}
              </h2>
            )}
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {currentStepReason || currentTask.outcome}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getTaskStatusTone(activeTaskStatus)}`}
            >
              {activeTaskStatusOption.label}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraftEditor(editorBaseline)
                setSaveState(null)
                setIsEditing(true)
              }}
              data-testid="mentor-workspace-edit-task"
            >
              <Edit3 className="size-3.5" />
              編集
            </Button>
          </div>
        </div>

        {/*
          Owner Directive #23 (2026-03-15): Do/Learn/Why はバックグラウンドで管理しユーザーには見せない。
          metadata は taskEditor 経由で保持し続けるが、UI には露出させない。
        */}

        {isEditing ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} data-testid="mentor-workspace-save-task">
              保存
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              キャンセル
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              `Esc` でキャンセル / `Cmd+Enter` で保存
            </span>
          </div>
        ) : null}

        {saveState ? (
          <p
            className={`mt-3 text-sm ${saveState.tone === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}
            role={saveState.tone === 'error' ? 'alert' : 'status'}
          >
            {saveState.message}
          </p>
        ) : null}

        {primaryLesson ? (
          <Link
            href={buildLessonHref(primaryLesson.lessonId, routeContext)}
            className="mt-4 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3 text-sm transition hover:border-orange-300 dark:border-orange-900/50 dark:bg-orange-950/30 dark:hover:border-orange-400/40"
          >
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">次のレッスン</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{primaryLesson.title}</p>
            </div>
            <ArrowRight className="size-4 text-orange-500" />
          </Link>
        ) : null}
      </section>

      {nextTask ? (
        <section
          aria-label="次のタスク"
          className="rounded-[24px] border border-orange-200 bg-orange-50/80 p-5 shadow-sm dark:border-orange-900/40 dark:bg-orange-950/30"
          data-testid="mentor-workspace-next-task"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
                <ArrowRight className="size-4" />
                次のタスク
                <OwnerTypeBadge ownerType="user" size="sm" showAiDelegatable />
              </div>
              <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                {nextTask.title}
              </h3>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {nextTask.description}
              </p>
            </div>
            <span className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-200">
              {nextTask.requirement === 'required' ? '必須' : '任意'}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            完了条件: {nextTask.outcome}
          </p>
        </section>
      ) : null}

      <div className="space-y-3">
        <CountAccordionSection
          title="Mentor memory"
          count={mentorMemories.length}
          icon={Brain}
          testId="mentor-workspace-memory-accordion"
          badgeClassName="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
        >
          {mentorMemories.length > 0 ? (
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
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">まだ保持している mentor memory はありません。</p>
          )}
        </CountAccordionSection>

        <CountAccordionSection
          title="Task subdivision"
          count={subdivisionItems.length}
          icon={Target}
          testId="mentor-workspace-task-subdivision-accordion"
          badgeClassName="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
        >
          {subdivisionItems.length > 0 ? (
            <ol className="space-y-3">
              {subdivisionItems.map((item, index) => {
                const status = taskProgress[item.id]?.status ?? 'not-started'
                const statusLabel =
                  status === 'completed'
                    ? '完了'
                    : status === 'in-progress'
                      ? '進行中'
                      : status === 'blocked'
                        ? 'ブロック中'
                        : '未着手'

                return (
                  <li key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          STEP {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">{item.title}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getTaskStatusTone(status)}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">完了条件: {item.outcome}</p>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">分割されたタスクはまだありません。</p>
          )}
        </CountAccordionSection>

        <CountAccordionSection
          title="Learner analytics"
          count={analyticsCount}
          icon={LineChart}
          testId="mentor-workspace-analytics-accordion"
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
                <Target className="size-4 text-orange-500" />
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
                <Brain className="size-4 text-violet-500" />
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

          {onInsightFeedback && understanding?.commonBlockers?.[0] ? (
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void onInsightFeedback('remove_blocker', understanding.commonBlockers[0] ?? '')
                }}
              >
                最初のブロッカーを解消済みにする
              </Button>
            </div>
          ) : null}
        </CountAccordionSection>
      </div>

      <Link
        href="/plan"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
      >
        <ArrowRight className="size-4" />
        プランに戻る
      </Link>
    </div>
  )
}
