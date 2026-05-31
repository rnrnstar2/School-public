import type {
  PlannerContinuationPlan,
  PlannerContinuationStep,
  PlannerTaskProgressRecord,
  PlannerTaskProgressStatus,
} from '@/lib/planner/types'
import type { LearnerState, LessonFeedback, MentorMemory } from '@/types'

/* ---------- types ---------- */

export interface PlanReviewTrigger {
  shouldReview: boolean
  reasons: PlanReviewReason[]
}

export interface PlanReviewReason {
  type: 'blocked-accumulation' | 'skipped-accumulation' | 'low-feedback' | 'learner-state-change'
  label: string
  detail: string
}

export interface PlanReviewProposal {
  summary: string
  rationale: string
  revisedSteps: PlanReviewRevisedStep[]
  removedStepIds: string[]
  mentorNote: string
}

export interface PlanReviewRevisedStep {
  id: string
  title: string
  description: string
  outcome: string
  purpose: string
  isNew: boolean
  originalStepId?: string
}

export interface PlanReviewRequest {
  goal: string
  continuation: PlannerContinuationPlan
  taskProgress: Record<string, PlannerTaskProgressRecord>
  learnerState: LearnerState | null
  mentorMemories: MentorMemory[]
  feedbacks: LessonFeedback[]
  triggerReasons: PlanReviewReason[]
}

/* ---------- constants ---------- */

const BLOCKED_THRESHOLD = 2
const SKIPPED_THRESHOLD = 2
const LOW_FEEDBACK_THRESHOLD = 2.5

/* ---------- detection ---------- */

export function detectPlanReviewTrigger(
  continuation: PlannerContinuationPlan | undefined,
  taskProgress: Record<string, PlannerTaskProgressRecord>,
  feedbacks: LessonFeedback[],
  learnerState: LearnerState | null
): PlanReviewTrigger {
  if (!continuation?.steps.length) {
    return { shouldReview: false, reasons: [] }
  }

  const reasons: PlanReviewReason[] = []

  // 1. blocked task accumulation
  const blockedTasks = countTasksByStatus(continuation.steps, taskProgress, 'blocked')
  if (blockedTasks >= BLOCKED_THRESHOLD) {
    reasons.push({
      type: 'blocked-accumulation',
      label: 'ブロック蓄積',
      detail: `${blockedTasks} 個のタスクがブロック状態です。プランの分解や順序を見直す必要があるかもしれません。`,
    })
  }

  // 2. skipped task accumulation
  const skippedTasks = countTasksByStatus(continuation.steps, taskProgress, 'skipped')
  if (skippedTasks >= SKIPPED_THRESHOLD) {
    reasons.push({
      type: 'skipped-accumulation',
      label: 'スキップ蓄積',
      detail: `${skippedTasks} 個のタスクがスキップされています。タスクの難易度や前提条件が合っていない可能性があります。`,
    })
  }

  // 3. low feedback ratings
  const recentFeedbacks = feedbacks.slice(0, 5)
  if (recentFeedbacks.length >= 2) {
    const avgDifficulty = average(recentFeedbacks.map((f) => f.difficulty_rating))
    const avgClarity = average(recentFeedbacks.map((f) => f.clarity_rating))

    if (avgClarity < LOW_FEEDBACK_THRESHOLD) {
      reasons.push({
        type: 'low-feedback',
        label: 'フィードバック低評価',
        detail: `直近のレッスンの分かりやすさ評価が平均 ${avgClarity.toFixed(1)} と低めです。レベル感や順番の見直しが有効かもしれません。`,
      })
    }

    if (avgDifficulty >= 4.0) {
      reasons.push({
        type: 'low-feedback',
        label: '難易度が高い',
        detail: `直近のレッスンの難易度が平均 ${avgDifficulty.toFixed(1)} と感じられています。ステップをより細かく分解する提案ができます。`,
      })
    }
  }

  // 4. learner_state blockers
  if (learnerState?.blockers && learnerState.blockers.length > 0) {
    reasons.push({
      type: 'learner-state-change',
      label: 'ブロッカー検出',
      detail: `学習者の状態に ${learnerState.blockers.length} 件のブロッカーが記録されています: ${learnerState.blockers.slice(0, 2).join('、')}`,
    })
  }

  return {
    shouldReview: reasons.length > 0,
    reasons,
  }
}

/* ---------- helpers ---------- */

function countTasksByStatus(
  steps: PlannerContinuationStep[],
  taskProgress: Record<string, PlannerTaskProgressRecord>,
  status: PlannerTaskProgressStatus
) {
  return steps.filter((step) => taskProgress[step.id]?.status === status).length
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/* ---------- AI prompt builder ---------- */

export function buildPlanReviewPrompt(request: PlanReviewRequest): {
  system: string
  user: string
} {
  const blockedSteps: Array<{ id: string; title: string; do: string | undefined }> = []
  const skippedSteps: Array<{ id: string; title: string }> = []
  const completedSteps: Array<{ id: string; title: string }> = []

  for (const s of request.continuation.steps) {
    const status = request.taskProgress[s.id]?.status
    if (status === 'blocked') blockedSteps.push({ id: s.id, title: s.title, do: request.taskProgress[s.id]?.do })
    else if (status === 'skipped') skippedSteps.push({ id: s.id, title: s.title })
    else if (status === 'completed') completedSteps.push({ id: s.id, title: s.title })
  }

  const system = [
    'あなたは学習プランのリビジョンアドバイザーです。',
    '学習者の現在の進捗状況・ブロッカー・フィードバック・メンターメモリを踏まえて、プランの再構成を提案してください。',
    '必ず JSON オブジェクトだけを返してください。Markdown、前置き、コードフェンスは禁止です。',
    '',
    'JSON schema:',
    JSON.stringify({
      summary: 'string - 再構成の概要（1-2文）',
      rationale: 'string - なぜこの変更が必要かの説明',
      revisedSteps: [
        {
          id: 'string - step ID (新規なら new-xxx)',
          title: 'string',
          description: 'string',
          outcome: 'string',
          purpose: 'string',
          isNew: 'boolean - 新規追加か',
          originalStepId: 'string | null - 元のstep ID（分割・変更の場合）',
        },
      ],
      removedStepIds: ['string - 削除するstep ID'],
      mentorNote: 'string - 学習者への励ましと変更の意図を伝えるメッセージ',
    }),
    '',
    '重要なルール:',
    '- 完了済みのstepは変更しないでください。',
    '- blockedのstepは、より細かく分解するか、前提を整理するstepを追加してください。',
    '- skippedのstepは、学習者に合わないと判断して削除するか、順序を変えてください。',
    '- フィードバックの低評価がある場合は、難易度を下げる方向で調整してください。',
    '- 変更は最小限にして、学習者が混乱しないようにしてください。',
    '- mentorNote は励ましのトーンで、変更の意図を分かりやすく伝えてください。',
  ].join('\n')

  const userPayload = {
    goal: request.goal,
    currentPlan: {
      title: request.continuation.title,
      summary: request.continuation.summary,
      totalSteps: request.continuation.steps.length,
    },
    progress: {
      completed: completedSteps,
      blocked: blockedSteps,
      skipped: skippedSteps,
    },
    remainingSteps: request.continuation.steps
      .filter((s) => {
        const status = request.taskProgress[s.id]?.status
        return !status || status === 'not-started' || status === 'in-progress' || status === 'on-hold'
      })
      .map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        outcome: s.outcome,
        purpose: s.purpose,
      })),
    learnerState: request.learnerState
      ? {
          skillLevel: request.learnerState.skill_level,
          blockers: request.learnerState.blockers,
          targetOutcome: request.learnerState.target_outcome,
        }
      : null,
    mentorMemories: request.mentorMemories.slice(0, 5).map((m) => ({
      title: m.title,
      bullets: m.bullets,
      source: m.source,
    })),
    recentFeedback: request.feedbacks.slice(0, 3).map((f) => ({
      difficulty: f.difficulty_rating,
      clarity: f.clarity_rating,
      comment: f.comment,
    })),
    triggerReasons: request.triggerReasons.map((r) => r.detail),
  }

  return { system, user: JSON.stringify(userPayload, null, 2) }
}
