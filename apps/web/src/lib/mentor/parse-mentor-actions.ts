/**
 * Parse structured mentor action tags from AI response text.
 *
 * Supports two formats:
 * 1. JSON block: [MENTOR_ACTION]{...json...}[/MENTOR_ACTION]
 * 2. Simple tag:  [MENTOR_ACTION:action_type]payload[/MENTOR_ACTION]
 *
 * Returns clean display text (tags stripped) and parsed actions.
 *
 * Simple tag formats supported (TQ-221 expanded 7 -> 10 to add AI-tool switching):
 * - [MENTOR_ACTION:recompile_plan]reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:skip_lesson]lessonId|lessonTitle|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:focus_lesson]lessonId|lessonTitle|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:adjust_difficulty]easier|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:change_next_lesson]lessonId|lessonTitle|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:add_lesson]lessonId|lessonTitle|beforeLessonId|reason[/MENTOR_ACTION]
 *   (beforeLessonId optional — pass empty string to append at the end)
 * - [MENTOR_ACTION:reorder_schedule]lessonId1:title1,lessonId2:title2,...|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:recommend_tool]stepId|toolId|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:delegate_to_tool]stepId|toolId|delegationBrief|reason[/MENTOR_ACTION]
 * - [MENTOR_ACTION:switch_tool]stepId|fromToolId|toToolId|reason[/MENTOR_ACTION]
 *   (fromToolId may be empty when no tool was assigned yet)
 */

import type { MentorAction } from './mentor-actions'

export interface ParsedMentorResponse {
  /** Text with all action tags removed, ready for display */
  cleanText: string
  /** Parsed actions found in the text */
  actions: MentorAction[]
}

const ACTION_BLOCK_REGEX = /\[MENTOR_ACTION\]([\s\S]*?)\[\/MENTOR_ACTION\]/g
const ACTION_TAG_REGEX = /\[MENTOR_ACTION:(\w+)\]([\s\S]*?)\[\/MENTOR_ACTION\]/g

export function stripMentorActionTags(text: string): string {
  return text
    .replace(/\[MENTOR_ACTION:\w+\][\s\S]*?\[\/MENTOR_ACTION\]/g, '')
    .replace(/\[MENTOR_ACTION\][\s\S]*?\[\/MENTOR_ACTION\]/g, '')
    .trim()
}

/**
 * Parse mentor actions from AI response text.
 * Handles both JSON block format and simple tag format.
 */
export function parseMentorActions(text: string): ParsedMentorResponse {
  const actions: MentorAction[] = []

  // 1. Try simple tag format: [MENTOR_ACTION:type]payload[/MENTOR_ACTION]
  let match: RegExpExecArray | null
  const simpleTagRegex = new RegExp(ACTION_TAG_REGEX.source, 'g')

  while ((match = simpleTagRegex.exec(text)) !== null) {
    const actionType = match[1]
    const payload = match[2].trim()
    const parsed = parseSimpleAction(actionType, payload)
    if (parsed) {
      actions.push(parsed)
    }
  }

  // 2. Try JSON block format: [MENTOR_ACTION]{...}[/MENTOR_ACTION]
  //    (only if no simple tags were found, to avoid double-parsing)
  if (actions.length === 0) {
    const jsonBlockRegex = new RegExp(ACTION_BLOCK_REGEX.source, 'g')

    while ((match = jsonBlockRegex.exec(text)) !== null) {
      const content = match[1].trim()
      // Skip if it looks like a simple tag (already handled above)
      if (content.startsWith('{')) {
        try {
          const parsed = JSON.parse(content) as MentorAction
          if (parsed.type && parsed.reason) {
            actions.push(parsed)
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  // Strip all action tags from display text
  const cleanText = stripMentorActionTags(text)

  return { cleanText, actions }
}

/**
 * Parse a simple tag action type and payload into a MentorAction.
 */
function parseSimpleAction(actionType: string, payload: string): MentorAction | null {
  switch (actionType) {
    case 'recompile_plan':
      return {
        type: 'recompile_plan',
        reason: payload || 'プランの再生成が提案されました',
      }
    case 'skip_lesson': {
      // payload format: "lessonId|lessonTitle|reason" or just "reason"
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length >= 3) {
        return {
          type: 'skip_lesson',
          targetLessonId: parts[0],
          targetLessonTitle: parts[1],
          reason: parts[2],
        }
      }
      return {
        type: 'skip_lesson',
        targetLessonId: '',
        targetLessonTitle: '',
        reason: payload,
      }
    }
    case 'focus_lesson': {
      // payload format: "lessonId|lessonTitle|reason" or just "lessonId"
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length >= 3) {
        return {
          type: 'focus_lesson',
          targetLessonId: parts[0],
          targetLessonTitle: parts[1],
          reason: parts[2],
        }
      }
      return {
        type: 'focus_lesson',
        targetLessonId: parts[0] ?? '',
        targetLessonTitle: '',
        reason: parts[1] ?? 'このレッスンに集中することを提案します',
      }
    }
    case 'adjust_difficulty': {
      // payload format: "easier" or "harder" optionally followed by "|reason"
      const parts = payload.split('|').map((s) => s.trim())
      const direction = parts[0] === 'harder' ? 'harder' : 'easier'
      return {
        type: 'adjust_difficulty',
        direction,
        reason: parts[1] ?? (direction === 'easier'
          ? '難易度を下げてプランを再構成します'
          : '難易度を上げてプランを再構成します'),
      }
    }
    case 'change_next_lesson': {
      // payload format: "lessonId|lessonTitle|reason"
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length < 2 || !parts[0]) {
        return null
      }
      return {
        type: 'change_next_lesson',
        targetLessonId: parts[0],
        targetLessonTitle: parts[1] ?? '',
        reason: parts[2] ?? '次に取り組むレッスンを変更します',
      }
    }
    case 'add_lesson': {
      // payload format: "lessonId|lessonTitle|beforeLessonId|reason"
      // beforeLessonId may be empty (append at end)
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length < 2 || !parts[0]) {
        return null
      }
      const targetLessonId = parts[0]
      const targetLessonTitle = parts[1] ?? ''
      const beforeLessonId = parts[2] && parts[2].length > 0 ? parts[2] : undefined
      const reason = parts[3] ?? 'このレッスンを追加します'
      const action: MentorAction = {
        type: 'add_lesson',
        targetLessonId,
        targetLessonTitle,
        reason,
        ...(beforeLessonId ? { beforeLessonId } : {}),
      }
      return action
    }
    case 'reorder_schedule': {
      // payload format: "lessonId1:title1,lessonId2:title2,...|reason"
      const pipeIndex = payload.lastIndexOf('|')
      const orderText = pipeIndex >= 0 ? payload.slice(0, pipeIndex).trim() : payload.trim()
      const reason = pipeIndex >= 0
        ? (payload.slice(pipeIndex + 1).trim() || 'スケジュールを並べ替えます')
        : 'スケジュールを並べ替えます'

      const newOrder = orderText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const colonIndex = entry.indexOf(':')
          if (colonIndex < 0) {
            return { lessonId: entry, lessonTitle: '' }
          }
          return {
            lessonId: entry.slice(0, colonIndex).trim(),
            lessonTitle: entry.slice(colonIndex + 1).trim(),
          }
        })
        .filter((entry) => entry.lessonId.length > 0)

      if (newOrder.length === 0) {
        return null
      }

      return {
        type: 'reorder_schedule',
        newOrder,
        reason,
      }
    }
    case 'recommend_tool': {
      // payload format: "stepId|toolId|reason"
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        return null
      }
      return {
        type: 'recommend_tool',
        stepId: parts[0],
        toolId: parts[1],
        reason: parts[2],
      }
    }
    case 'delegate_to_tool': {
      // payload format: "stepId|toolId|delegationBrief|reason"
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts[3]) {
        return null
      }
      return {
        type: 'delegate_to_tool',
        stepId: parts[0],
        toolId: parts[1],
        delegationBrief: parts[2],
        reason: parts[3],
      }
    }
    case 'switch_tool': {
      // payload format: "stepId|fromToolId|toToolId|reason"
      // fromToolId may be empty when the step had no tool assigned yet.
      const parts = payload.split('|').map((s) => s.trim())
      if (parts.length < 4 || !parts[0] || !parts[2] || !parts[3]) {
        return null
      }
      return {
        type: 'switch_tool',
        stepId: parts[0],
        fromToolId: parts[1].length > 0 ? parts[1] : null,
        toToolId: parts[2],
        reason: parts[3],
      }
    }
    default:
      return null
  }
}
