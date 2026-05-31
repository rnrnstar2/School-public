'use client'

import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  Loader2,
  MessageCircleQuestion,
  PauseCircle,
  SkipForward,
  Target,
  AlertTriangle,
} from 'lucide-react'
import type {
  PlannerContinuationPlan,
  PlannerContinuationStep,
  PlannerMentorWorkspace,
  PlannerTaskProgressRecord,
  PlannerTaskProgressStatus,
} from '@/lib/planner/types'
import type { LearnerState, LessonChatSummary, MentorMemory } from '@/types'
import { countRequiredSteps, getRequirementBadgeTone, isTaskFinished } from '@/lib/planner/status-helpers'

/* ---------- props ---------- */

export interface ProgressSummaryPanelProps {
  workspace: PlannerMentorWorkspace
  continuation?: PlannerContinuationPlan
  taskProgress: Record<string, PlannerTaskProgressRecord>
  learnerState: LearnerState | null
  mentorMemories: MentorMemory[]
  chatSummaries?: LessonChatSummary[]
  activeStepId?: string | null
  nextStepId?: string | null
}

/* ---------- helpers ---------- */

function statusIcon(status: PlannerTaskProgressStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'in-progress':
      return <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
    case 'on-hold':
      return <PauseCircle className="h-4 w-4 text-amber-500" />
    case 'blocked':
      return <AlertTriangle className="h-4 w-4 text-rose-500" />
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-slate-400" />
    default:
      return <Circle className="h-4 w-4 text-slate-500 dark:text-slate-600" />
  }
}

function statusLabel(status: PlannerTaskProgressStatus) {
  const map: Record<PlannerTaskProgressStatus, string> = {
    'not-started': '未着手',
    'in-progress': '取り組み中',
    completed: '完了',
    'on-hold': '保留',
    blocked: '詰まり',
    skipped: 'スキップ',
  }
  return map[status]
}

function groupStepsByStatus(
  steps: PlannerContinuationStep[],
  taskProgress: Record<string, PlannerTaskProgressRecord>,
) {
  const completed: PlannerContinuationStep[] = []
  const inProgress: PlannerContinuationStep[] = []
  const blocked: PlannerContinuationStep[] = []
  const remaining: PlannerContinuationStep[] = []

  for (const step of steps) {
    const status = taskProgress[step.id]?.status ?? 'not-started'
    if (status === 'completed') completed.push(step)
    else if (status === 'in-progress') inProgress.push(step)
    else if (status === 'blocked' || status === 'on-hold') blocked.push(step)
    else remaining.push(step)
  }

  return { completed, inProgress, blocked, remaining }
}

/* ---------- component ---------- */

export function ProgressSummaryPanel({
  workspace,
  continuation,
  taskProgress,
  learnerState,
  mentorMemories,
  chatSummaries,
  activeStepId,
  nextStepId,
}: ProgressSummaryPanelProps) {
  const steps = continuation?.steps ?? []
  const totalSteps = steps.length
  const totalRequired = countRequiredSteps(steps)
  const groups = groupStepsByStatus(steps, taskProgress)
  const completedCount = groups.completed.length
  const completedRequired = groups.completed.filter((s) => s.requirement === 'required').length
  const progressPercent = totalRequired > 0 ? Math.max((completedRequired / totalRequired) * 100, 8) : 0

  const activeStep = steps.find((s) => s.id === activeStepId)
  const nextStep = steps.find((s) => s.id === nextStepId)

  return (
    <div className="space-y-5">
      {/* ── 1. Overview card ── */}
      <section className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#fff7ed_100%)] p-6 dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(56,189,248,0.10)_0%,rgba(249,115,22,0.10)_100%)]">
        <p className="text-xs font-semibold tracking-[0.18em] text-sky-700 dark:text-sky-200">
          進捗サマリー
        </p>
        <h2 className="mt-2 text-xl font-semibold text-overflow-wrap sm:text-2xl">{continuation?.title ?? workspace.goalSummary}</h2>

        {/* Progress stats row */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="完了" value={groups.completed.length} total={totalSteps} color="emerald" />
          <StatCard label="取り組み中" value={groups.inProgress.length} total={totalSteps} color="sky" />
          <StatCard label="詰まり / 保留" value={groups.blocked.length} total={totalSteps} color="amber" />
          <StatCard label="残タスク" value={groups.remaining.length} total={totalSteps} color="slate" />
        </div>

        {/* Progress bar */}
        {totalSteps > 0 && (
          <div className="mt-5 flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
              <Target className="h-4 w-4 text-orange-500" />
              必須 {completedRequired} / {totalRequired} step{completedCount > completedRequired ? `（全 ${completedCount}/${totalSteps}）` : ''}
            </div>
            <div className="h-2.5 flex-1 rounded-full bg-white/80 dark:bg-slate-900/80">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Current position & next step ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Current position */}
        <section className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-5 dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-700 dark:text-sky-200">
            <Target className="h-4 w-4" />
            いまの現在地
          </div>
          <p className="mt-3 text-lg font-semibold text-sky-900 dark:text-sky-100">
            {activeStep?.title ?? workspace.currentTask.title}
          </p>
          <p className="mt-2 text-sm leading-7 text-sky-700 dark:text-sky-200">
            {activeStep?.description ?? workspace.currentTask.do}
          </p>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              {statusIcon(taskProgress[activeStep?.id ?? workspace.currentTask.id]?.status ?? 'in-progress')}
              {statusLabel(taskProgress[activeStep?.id ?? workspace.currentTask.id]?.status ?? 'in-progress')}
            </span>
          </div>
        </section>

        {/* Next step */}
        <section className="rounded-[24px] border border-orange-200 bg-orange-50/80 p-5 dark:border-orange-900/40 dark:bg-orange-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-orange-700 dark:text-orange-200">
            <ArrowRight className="h-4 w-4" />
            次の一手
          </div>
          {nextStep ? (
            <>
              <p className="mt-3 text-lg font-semibold text-orange-900 dark:text-orange-100">
                {nextStep.title}
              </p>
              <p className="mt-2 text-sm leading-7 text-orange-700 dark:text-orange-200">
                {nextStep.description}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-7 text-orange-700 dark:text-orange-200">
              {completedCount >= totalSteps && totalSteps > 0
                ? '全ての step を完了しています。おめでとうございます!'
                : '現在の task を完了すると次が表示されます。'}
            </p>
          )}
        </section>
      </div>

      {/* ── 3. Current milestone ── */}
      <section className="rounded-[24px] border border-slate-200 bg-white/95 p-5 dark:border-slate-700 dark:bg-slate-950/80">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
          <Flag className="h-4 w-4 text-orange-500" />
          現在のマイルストーン
        </div>
        <p className="mt-3 text-lg font-semibold">{workspace.currentMilestone.title}</p>
        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{workspace.currentMilestone.description}</p>
        {workspace.currentMilestone.evidence.length > 0 && (
          <div className="mt-3 space-y-1">
            {workspace.currentMilestone.evidence.map((ev) => (
              <p key={ev} className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                {ev}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Step-by-step breakdown ── */}
      {steps.length > 0 && (
        <section className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-5 dark:border-slate-700 dark:bg-slate-950/60">
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">全 Step 一覧</p>
          <div className="mt-4 space-y-2">
            {steps.map((step, index) => {
              const progress = taskProgress[step.id]
              const status = progress?.status ?? 'not-started'
              const isCurrent = step.id === activeStepId
              const isNext = step.id === nextStepId

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-[16px] border p-3 transition ${
                    isCurrent
                      ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40'
                      : isNext
                        ? 'border-orange-200 bg-orange-50/50 dark:border-orange-900/40 dark:bg-orange-950/20'
                        : isTaskFinished(status)
                          ? 'border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-950/40'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{statusIcon(status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                        {index + 1}.
                      </span>
                      <p className={`text-sm font-semibold ${isTaskFinished(status) ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}>
                        {step.title}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRequirementBadgeTone(step.requirement)}`}>
                        {step.requirement === 'required' ? '必須' : '任意'}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          現在
                        </span>
                      )}
                      {isNext && (
                        <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200">
                          次
                        </span>
                      )}
                    </div>
                    {progress?.do && (
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Do: {progress.do}
                      </p>
                    )}
                    {progress?.updatedAt && (
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {new Date(progress.updatedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {statusLabel(status)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 5. Learner state snapshot ── */}
      {learnerState && (
        <section className="rounded-[24px] border border-slate-200 bg-white/95 p-5 dark:border-slate-700 dark:bg-slate-950/80">
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">学習者の状態</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {learnerState.target_outcome && (
              <LearnerField label="目標" value={learnerState.target_outcome} />
            )}
            {learnerState.skill_level && (
              <LearnerField
                label="スキルレベル"
                value={learnerState.skill_level === 'beginner' ? '初心者' : learnerState.skill_level === 'intermediate' ? '中級' : '上級'}
              />
            )}
            {learnerState.active_task_id && (
              <LearnerField label="アクティブタスク" value={steps.find((s) => s.id === learnerState.active_task_id)?.title ?? learnerState.active_task_id} />
            )}
            {learnerState.blockers.length > 0 && (
              <LearnerField label="ブロッカー" value={learnerState.blockers.join(', ')} />
            )}
          </div>
        </section>
      )}

      {/* ── 6. Lesson chat summaries ── */}
      {chatSummaries && chatSummaries.length > 0 && (
        <section className="rounded-[24px] border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-indigo-700 dark:text-indigo-200">
            <MessageCircleQuestion className="h-4 w-4" />
            レッスンチャット要約
          </div>
          <div className="mt-4 space-y-3">
            {chatSummaries.map((summary) => (
              <div key={summary.lesson_id} className="rounded-[16px] border border-indigo-100 bg-white p-3 dark:border-indigo-800/40 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                    {summary.lesson_title || summary.lesson_id}
                  </p>
                  <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                    {summary.message_count}件の会話
                  </span>
                </div>
                {summary.summary_key_points.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {summary.summary_key_points.map((point, i) => (
                      <p key={`${summary.lesson_id}-kp-${i}`} className="flex items-start gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                        {point}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 7. Recent mentor memories ── */}
      {mentorMemories.length > 0 && (
        <section className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-5 dark:border-slate-700 dark:bg-slate-950/60">
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">最近のメンター記録</p>
          <div className="mt-4 space-y-3">
            {mentorMemories.slice(0, 5).map((memory) => (
              <div key={memory.id} className="rounded-[16px] border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{memory.title}</p>
                  <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                    {new Date(memory.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {memory.bullets.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {memory.bullets.map((bullet, i) => (
                      <p key={`${memory.id}-${i}`} className="flex items-start gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" />
                        {bullet}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ---------- sub-components ---------- */

function StatCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30',
    sky: 'border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/30',
    amber: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30',
    slate: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  }
  const textMap: Record<string, string> = {
    emerald: 'text-emerald-700 dark:text-emerald-200',
    sky: 'text-sky-700 dark:text-sky-200',
    amber: 'text-amber-700 dark:text-amber-200',
    slate: 'text-slate-700 dark:text-slate-200',
  }

  return (
    <div className={`rounded-[18px] border p-3 ${colorMap[color] ?? colorMap.slate}`}>
      <p className={`text-xs font-semibold tracking-[0.14em] ${textMap[color] ?? textMap.slate}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${textMap[color] ?? textMap.slate}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">/ {total} step</p>
    </div>
  )
}

function LearnerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  )
}
