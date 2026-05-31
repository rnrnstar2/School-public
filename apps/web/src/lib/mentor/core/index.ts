/**
 * Mentor Core Module
 *
 * 統一メンターモジュールのエントリーポイント。
 * 4つのロール定義・コンテキスト構築・プロンプト構築・レッスン優先ポリシーを提供する。
 *
 * 既存のAPIルートは段階的にこのモジュールへ移行する。
 *
 * @example
 * ```ts
 * import {
 *   getMentorRoleConfig,
 *   buildMentorContext,
 *   buildMentorPrompt,
 * } from '@/lib/mentor/core'
 *
 * const config = getMentorRoleConfig('coaching')
 * const context = await buildMentorContext({ userId, supabase, role: 'coaching' })
 * const { system, messages } = buildMentorPrompt(config, context, userMessage)
 * ```
 */

// roles.ts
export {
  type MentorRole,
  type MentorContextField,
  type MentorRoleConfig,
  HEARING_CONFIG,
  PLANNING_CONFIG,
  COACHING_CONFIG,
  REVIEW_CONFIG,
  MENTOR_ROLE_CONFIGS,
  MENTOR_ACTION_INSTRUCTIONS,
  getMentorRoleConfig,
} from './roles'

// context-builder.ts
export {
  type MentorContextParams,
  type ConversationMessage,
  type LessonInfo,
  type MentorContext,
  type NegativeFeedbackEntry,
  type HearingDigest,
  type HearingDigestInput,
  buildMentorContext,
  buildHearingDigest,
  summarizeOlderMessages,
} from './context-builder'

// prompt-builder.ts
export {
  type MentorPromptResult,
  buildMentorPrompt,
} from './prompt-builder'

// lesson-preference-policy.ts
export {
  type LessonCandidate,
  buildLessonPreferenceDirective,
} from './lesson-preference-policy'
