/**
 * Mentor Action Types — defines what the AI mentor can propose
 * during lesson chat conversations.
 *
 * Actions are embedded in the AI response as structured JSON blocks,
 * parsed by the frontend, and executed via /api/mentor/actions on confirmation.
 */

export type MentorActionType =
  | 'change_next_lesson'
  | 'skip_lesson'
  | 'add_lesson'
  | 'reorder_schedule'
  | 'recompile_plan'
  | 'focus_lesson'
  | 'adjust_difficulty'
  | 'recommend_tool'
  | 'delegate_to_tool'
  | 'switch_tool'

export interface MentorActionBase {
  type: MentorActionType
  reason: string
}

export interface ChangeNextLessonAction extends MentorActionBase {
  type: 'change_next_lesson'
  /** The lesson to set as next */
  targetLessonId: string
  targetLessonTitle: string
  /** The lesson currently scheduled as next (if known) */
  currentNextLessonId?: string
  currentNextLessonTitle?: string
}

export interface SkipLessonAction extends MentorActionBase {
  type: 'skip_lesson'
  /** Lesson to skip */
  targetLessonId: string
  targetLessonTitle: string
}

export interface AddLessonAction extends MentorActionBase {
  type: 'add_lesson'
  /** Lesson to insert */
  targetLessonId: string
  targetLessonTitle: string
  /** Insert before this lesson (optional) */
  beforeLessonId?: string
}

export interface ReorderScheduleAction extends MentorActionBase {
  type: 'reorder_schedule'
  /** Ordered list of lesson IDs representing the new schedule */
  newOrder: Array<{ lessonId: string; lessonTitle: string }>
}

export interface RecompilePlanAction extends MentorActionBase {
  type: 'recompile_plan'
}

export interface FocusLessonAction extends MentorActionBase {
  type: 'focus_lesson'
  targetLessonId: string
  targetLessonTitle: string
}

export interface AdjustDifficultyAction extends MentorActionBase {
  type: 'adjust_difficulty'
  direction: 'easier' | 'harder'
}

/**
 * TQ-221: AI ツールを「このステップに合いそうだから試してみない?」と推薦する。
 * 学習者の同意を得てから plan の該当 step に紐付ける想定。
 */
export interface RecommendToolAction extends MentorActionBase {
  type: 'recommend_tool'
  /** Plan step (atom) id this tool is recommended for. */
  stepId: string
  /** Stable id from `ai-tools-catalog` (e.g. 'v0', 'claude-code'). */
  toolId: string
  /** Optional human-readable label (resolved from catalog when missing). */
  toolLabel?: string
}

/**
 * TQ-221: AI ツールにタスクを委譲する。
 * 推薦より一歩踏み込み、ツールに渡す brief（依頼文の素案）も含める。
 */
export interface DelegateToToolAction extends MentorActionBase {
  type: 'delegate_to_tool'
  stepId: string
  toolId: string
  toolLabel?: string
  /** Brief / prompt the learner can paste into the target tool. */
  delegationBrief: string
}

/**
 * TQ-221: 既に進行中のステップで使っているツールを別のツールへ切り替える。
 * 例: 「v0 でやってみたい」→ 該当 step が claude-code から v0 へ更新される。
 */
export interface SwitchToolAction extends MentorActionBase {
  type: 'switch_tool'
  stepId: string
  /** Optional — null when the step had no tool pinned yet. */
  fromToolId: string | null
  toToolId: string
  toToolLabel?: string
}

export type MentorAction =
  | ChangeNextLessonAction
  | SkipLessonAction
  | AddLessonAction
  | ReorderScheduleAction
  | RecompilePlanAction
  | FocusLessonAction
  | AdjustDifficultyAction
  | RecommendToolAction
  | DelegateToToolAction
  | SwitchToolAction

/**
 * Parse mentor action blocks from AI response text.
 * Format: [MENTOR_ACTION]{...json...}[/MENTOR_ACTION]
 */
export function parseMentorActions(text: string): MentorAction[] {
  const actions: MentorAction[] = []
  const regex = /\[MENTOR_ACTION\]([\s\S]*?)\[\/MENTOR_ACTION\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as MentorAction
      if (parsed.type && parsed.reason) {
        actions.push(parsed)
      }
    } catch {
      // skip malformed action blocks
    }
  }

  return actions
}

/**
 * Strip mentor action blocks from text to get clean display text.
 */
export function stripMentorActionBlocks(text: string): string {
  return text.replace(/\[MENTOR_ACTION\][\s\S]*?\[\/MENTOR_ACTION\]/g, '').trim()
}

/**
 * Action labels for display in Japanese.
 */
export const mentorActionLabels: Record<MentorActionType, string> = {
  change_next_lesson: '次のレッスンを変更',
  skip_lesson: 'レッスンをスキップ',
  add_lesson: 'レッスンを追加',
  reorder_schedule: 'スケジュールを並べ替え',
  recompile_plan: 'プランを再生成',
  focus_lesson: 'レッスンにフォーカス',
  adjust_difficulty: '難易度を調整',
  recommend_tool: 'AIツールを推薦',
  delegate_to_tool: 'AIツールに委譲',
  switch_tool: 'AIツールを切替',
}
