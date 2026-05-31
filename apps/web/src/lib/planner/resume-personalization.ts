import type { PlannerCurrentTask, PlannerMentorMemorySummary } from '@/lib/planner/types'
import type { LearnerState, LessonFeedback, MentorMemory } from '@/types'

export interface PlannerResumeContext {
  learnerState: LearnerState | null
  mentorMemory: MentorMemory | null
}

function cleanBullet(value: string) {
  return value.replace(/^(goal|do|learn|why|関連 lesson|次の task)\s*:\s*/i, '').trim()
}

export function buildResumeSummary(context: PlannerResumeContext): string | null {
  const bullets = context.mentorMemory?.bullets ?? []
  const priorityBullets = bullets.filter((bullet) => /(why|次の task|優先|好み|苦手)/i.test(bullet))
  const selectedBullets = (priorityBullets.length > 0 ? priorityBullets : bullets)
    .map(cleanBullet)
    .filter(Boolean)
    .slice(0, 2)

  if (selectedBullets.length > 0) {
    return `前回メモを踏まえると、${selectedBullets.join(' / ')} を意識して進めます。`
  }

  if (context.learnerState?.blockers?.length) {
    return `前回の詰まりとして「${context.learnerState.blockers.slice(0, 2).join(' / ')}」を把握しているため、それを先に解消する順で進めます。`
  }

  return null
}

export function buildPersonalizedMentorMemory(goal: string, context: PlannerResumeContext): PlannerMentorMemorySummary {
  const fallbackGoal = goal.trim() || 'Webサイトを公開したい'
  const bullets = [
    context.learnerState?.target_outcome ? `目標は「${context.learnerState.target_outcome}」として引き継ぎます。` : `目標は「${fallbackGoal}」です。`,
    context.learnerState?.blockers?.length
      ? `前回の詰まり: ${context.learnerState.blockers.slice(0, 2).join(' / ')}`
      : null,
    buildResumeSummary(context),
  ].filter((bullet): bullet is string => Boolean(bullet))

  if (context.mentorMemory) {
    return {
      title: context.mentorMemory.title,
      bullets: [
        ...bullets,
        ...context.mentorMemory.bullets.map(cleanBullet).filter(Boolean).slice(0, 2),
      ].filter((bullet, index, list) => list.indexOf(bullet) === index),
    }
  }

  return {
    title: 'メンターの理解',
    bullets: bullets.length > 0 ? bullets : ['まずは範囲を固め、次に開発環境を立ち上げる順番で進めるのが安全です。'],
  }
}

export function applyResumeSummaryToTask(currentTask: PlannerCurrentTask, context: PlannerResumeContext): PlannerCurrentTask {
  const resumeSummary = buildResumeSummary(context)

  if (!resumeSummary) {
    return currentTask
  }

  return {
    ...currentTask,
    resumeSummary,
    why: `${currentTask.why} ${resumeSummary}`,
  }
}

// ── Understanding Profile ──

export interface UnderstandingProfileInput {
  learnerState: LearnerState | null
  mentorMemories: MentorMemory[]
  feedbackEntries: LessonFeedback[]
  taskProgress: Record<string, { status: string; do?: string; learn?: string; why?: string; relevantLessonIds?: string[]; updatedAt: string }>
}

export interface LearnerUnderstandingProfile {
  overallLevel: 'first-visit' | 'early' | 'progressing' | 'experienced'
  completedTaskCount: number
  blockedTaskCount: number
  averageDifficulty: number | null
  averageClarity: number | null
  commonBlockers: string[]
  strengths: string[]
  weaknesses: string[]
  resumeMessage: string
  adjustmentHints: LearnerAdjustmentHint[]
}

export interface LearnerAdjustmentHint {
  type: 'pace' | 'difficulty' | 'blocker' | 'encouragement'
  message: string
}

export function buildUnderstandingProfile(input: UnderstandingProfileInput): LearnerUnderstandingProfile {
  const { learnerState, mentorMemories, feedbackEntries, taskProgress } = input

  const taskEntries = Object.values(taskProgress)
  const completedTaskCount = taskEntries.filter((entry) => entry.status === 'completed').length
  const blockedTaskCount = taskEntries.filter((entry) => entry.status === 'blocked').length
  const skippedTaskCount = taskEntries.filter((entry) => entry.status === 'skipped').length

  // Overall level from task completion count
  let overallLevel: LearnerUnderstandingProfile['overallLevel'] = 'first-visit'
  if (completedTaskCount >= 5) {
    overallLevel = 'experienced'
  } else if (completedTaskCount >= 2) {
    overallLevel = 'progressing'
  } else if (completedTaskCount >= 1 || taskEntries.length > 0) {
    overallLevel = 'early'
  }

  // Feedback aggregation
  const difficultyRatings = feedbackEntries.map((entry) => entry.difficulty_rating).filter(Boolean)
  const clarityRatings = feedbackEntries.map((entry) => entry.clarity_rating).filter(Boolean)
  const averageDifficulty = difficultyRatings.length > 0
    ? Math.round((difficultyRatings.reduce((sum, rating) => sum + rating, 0) / difficultyRatings.length) * 10) / 10
    : null
  const averageClarity = clarityRatings.length > 0
    ? Math.round((clarityRatings.reduce((sum, rating) => sum + rating, 0) / clarityRatings.length) * 10) / 10
    : null

  // Extract patterns from mentor memories
  const allBullets = mentorMemories.flatMap((memory) => memory.bullets)
  const commonBlockers = learnerState?.blockers?.slice(0, 3) ?? []
  const strengths = extractPatternItems(allBullets, /(得意|強み|できる|理解して|上手く|成功|完了)/)
  const weaknesses = extractPatternItems(allBullets, /(苦手|弱み|詰まり|難しい|失敗|不慣れ|不安)/)

  // Build resume message
  const resumeMessage = buildResumeDisplayMessage({
    overallLevel,
    completedTaskCount,
    blockedTaskCount,
    learnerState,
    mentorMemories,
  })

  // Build adjustment hints
  const adjustmentHints = buildAdjustmentHints({
    overallLevel,
    completedTaskCount,
    blockedTaskCount,
    skippedTaskCount,
    averageDifficulty,
    averageClarity,
    commonBlockers,
    learnerState,
  })

  return {
    overallLevel,
    completedTaskCount,
    blockedTaskCount,
    averageDifficulty,
    averageClarity,
    commonBlockers,
    strengths,
    weaknesses,
    resumeMessage,
    adjustmentHints,
  }
}

function extractPatternItems(bullets: string[], pattern: RegExp): string[] {
  return bullets
    .filter((bullet) => pattern.test(bullet))
    .map(cleanBullet)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 3)
}

function buildResumeDisplayMessage(context: {
  overallLevel: LearnerUnderstandingProfile['overallLevel']
  completedTaskCount: number
  blockedTaskCount: number
  learnerState: LearnerState | null
  mentorMemories: MentorMemory[]
}): string {
  const { overallLevel, completedTaskCount, blockedTaskCount, learnerState, mentorMemories } = context
  const activeTaskId = learnerState?.active_task_id
  const latestMemory = mentorMemories[0]

  if (overallLevel === 'first-visit') {
    return 'はじめまして。目標を入力すると、あなた専用の学習プランを組み立てます。'
  }

  const parts: string[] = []

  if (activeTaskId && latestMemory) {
    parts.push(`前回は「${latestMemory.title}」まで進みました。`)
  } else if (activeTaskId) {
    parts.push('前回の続きから再開できます。')
  }

  if (completedTaskCount > 0) {
    parts.push(`これまでに ${completedTaskCount} 個のタスクを完了しています。`)
  }

  if (blockedTaskCount > 0) {
    parts.push(`${blockedTaskCount} 件の詰まりを把握しているため、それを優先して解消します。`)
  }

  if (learnerState?.blockers?.length) {
    parts.push(`既知のブロッカー: ${learnerState.blockers.slice(0, 2).join('、')}`)
  }

  return parts.length > 0
    ? parts.join(' ')
    : '前回の状態を復元しました。続きから進められます。'
}

function buildAdjustmentHints(context: {
  overallLevel: LearnerUnderstandingProfile['overallLevel']
  completedTaskCount: number
  blockedTaskCount: number
  skippedTaskCount: number
  averageDifficulty: number | null
  averageClarity: number | null
  commonBlockers: string[]
  learnerState: LearnerState | null
}): LearnerAdjustmentHint[] {
  const hints: LearnerAdjustmentHint[] = []

  // Difficulty-based hints
  if (context.averageDifficulty !== null && context.averageDifficulty >= 4) {
    hints.push({
      type: 'difficulty',
      message: '直近のレッスンが難しいと感じているようです。基礎を補強するレッスンを優先表示します。',
    })
  }

  if (context.averageDifficulty !== null && context.averageDifficulty <= 2 && context.completedTaskCount >= 3) {
    hints.push({
      type: 'pace',
      message: 'スムーズに進んでいるので、次のステップへ進むペースを上げても大丈夫です。',
    })
  }

  // Clarity-based hints
  if (context.averageClarity !== null && context.averageClarity <= 2) {
    hints.push({
      type: 'difficulty',
      message: 'レッスンの説明がわかりにくいと感じているようです。補足説明を多めに表示します。',
    })
  }

  // Blocker-based hints
  if (context.blockedTaskCount >= 2) {
    hints.push({
      type: 'blocker',
      message: '複数のタスクで詰まりが発生しています。ブロッカーの解消を最優先で進めます。',
    })
  }

  if (context.commonBlockers.length > 0 && context.blockedTaskCount > 0) {
    hints.push({
      type: 'blocker',
      message: `「${context.commonBlockers[0]}」に関連するレッスンを先に見ると解消しやすいです。`,
    })
  }

  // Skip-based hints
  if (context.skippedTaskCount >= 2) {
    hints.push({
      type: 'pace',
      message: 'スキップしたタスクが多いため、進め方の好みに合わせて順番を調整します。',
    })
  }

  // Encouragement
  if (context.overallLevel === 'early' && context.completedTaskCount === 1) {
    hints.push({
      type: 'encouragement',
      message: '最初のタスクを完了しました。この調子で次のステップへ進みましょう。',
    })
  }

  if (context.overallLevel === 'progressing') {
    hints.push({
      type: 'encouragement',
      message: '着実に進んでいます。理解度に合わせてレッスンの順番を最適化しています。',
    })
  }

  return hints
}

// ── Personalized task/lesson adjustment based on understanding ──

export type LessonDifficultyAdjustment = 'easier' | 'normal' | 'harder'

export function resolveDesiredDifficulty(understanding: LearnerUnderstandingProfile | null): LessonDifficultyAdjustment {
  if (!understanding) {
    return 'normal'
  }

  if (understanding.averageDifficulty !== null && understanding.averageDifficulty >= 4) {
    return 'easier'
  }

  if (
    understanding.averageDifficulty !== null &&
    understanding.averageDifficulty <= 2 &&
    understanding.completedTaskCount >= 3
  ) {
    return 'harder'
  }

  return 'normal'
}

export function shouldPrioritizeBlockerResolution(understanding: LearnerUnderstandingProfile | null): boolean {
  if (!understanding) {
    return false
  }

  return understanding.blockedTaskCount >= 1 && understanding.commonBlockers.length > 0
}

// ── Consecutive-blocked task subdivision ──

export interface SubdividedTask {
  id: string
  title: string
  description: string
  outcome: string
  purpose: string
  completionCriteria: string
  artifacts: string[]
  requirement: 'required' | 'optional'
  milestoneId?: string
  parentTaskId: string
}

/**
 * Detects consecutive blocked tasks and subdivides the next pending/in-progress task
 * into smaller subtasks to help the learner make incremental progress.
 *
 * Returns null if subdivision is not warranted (fewer than 2 consecutive blocked tasks).
 */
export function subdivideBlockedTask(
  steps: Array<{ id: string; title: string; description: string; outcome: string; purpose: string; completionCriteria: string; artifacts: string[]; requirement: 'required' | 'optional'; milestoneId?: string }>,
  taskProgress: Record<string, { status: string }>,
  understanding: LearnerUnderstandingProfile | null
): { targetStepId: string; subtasks: SubdividedTask[] } | null {
  if (!understanding || understanding.blockedTaskCount < 2) {
    return null
  }

  // Find consecutive blocked tasks
  let consecutiveBlocked = 0
  let lastBlockedIndex = -1
  for (let i = 0; i < steps.length; i++) {
    const progress = taskProgress[steps[i].id]
    if (progress?.status === 'blocked') {
      consecutiveBlocked++
      lastBlockedIndex = i
    } else if (progress?.status === 'completed' || progress?.status === 'skipped') {
      consecutiveBlocked = 0
    } else {
      break
    }
  }

  if (consecutiveBlocked < 2) {
    return null
  }

  // Find the next non-completed step to subdivide
  const targetIndex = lastBlockedIndex + 1 < steps.length ? lastBlockedIndex + 1 : lastBlockedIndex
  const targetStep = steps[targetIndex]
  if (!targetStep) {
    return null
  }

  const subtasks = generateSubtasks(targetStep, understanding)
  return { targetStepId: targetStep.id, subtasks }
}

function generateSubtasks(
  step: { id: string; title: string; description: string; outcome: string; purpose: string; completionCriteria: string; artifacts: string[]; requirement: 'required' | 'optional'; milestoneId?: string },
  understanding: LearnerUnderstandingProfile
): SubdividedTask[] {
  const blockerContext = understanding.commonBlockers.length > 0
    ? `まず「${understanding.commonBlockers[0]}」を解消します。`
    : ''

  const subtasks: SubdividedTask[] = []

  // Subtask 1: Blocker resolution (if blockers exist)
  if (understanding.commonBlockers.length > 0) {
    subtasks.push({
      id: `${step.id}--blocker-resolve`,
      title: `${step.title}: ブロッカー解消`,
      description: `${blockerContext}${step.title}を進める前に、詰まりの原因を特定して解消します。`,
      outcome: '詰まりの原因が解消され、次のステップに進める状態になっている',
      purpose: step.purpose,
      completionCriteria: 'ブロッカーとなっていた問題が解決済み',
      artifacts: [],
      requirement: 'required',
      milestoneId: step.milestoneId,
      parentTaskId: step.id,
    })
  }

  // Subtask 2: Minimal first step
  subtasks.push({
    id: `${step.id}--minimal-start`,
    title: `${step.title}: 最小限の着手`,
    description: `${step.description} — まずは最小限の範囲だけ実行して動作確認します。`,
    outcome: '最小限の実装が動作確認できている',
    purpose: step.purpose,
    completionCriteria: '最小限の動作確認が完了',
    artifacts: step.artifacts.slice(0, 1),
    requirement: 'required',
    milestoneId: step.milestoneId,
    parentTaskId: step.id,
  })

  // Subtask 3: Complete the full task
  subtasks.push({
    id: `${step.id}--complete`,
    title: `${step.title}: 仕上げ`,
    description: `最小限の動作確認ができたら、${step.outcome}を達成するために残りを仕上げます。`,
    outcome: step.outcome,
    purpose: step.purpose,
    completionCriteria: step.completionCriteria,
    artifacts: step.artifacts,
    requirement: step.requirement,
    milestoneId: step.milestoneId,
    parentTaskId: step.id,
  })

  return subtasks
}
