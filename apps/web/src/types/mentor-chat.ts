import { z } from 'zod'

export const MentorSessionPhaseSchema = z.enum([
  'discovering',
  'clarifying_goal',
  'ready_to_plan',
  'planning',
  'coaching',
  'executing',
  'stuck',
  'reviewing',
])

export const MentorSessionActionSchema = z.object({
  type: z.string().min(1),
  reason: z.string().default(''),
})

export const MentorChatStructuredOutputSchema = z.object({
  reply: z.string().default(''),
  phase: MentorSessionPhaseSchema.default('coaching'),
  actions: z.array(MentorSessionActionSchema).default([]),
  decisions: z.array(z.string().min(1)).default([]),
  open_questions: z.array(z.string().min(1)).default([]),
  next_question: z.string().nullable().default(null),
  next_action: z.string().nullable().default(null),
})

export type MentorSessionPhase = z.infer<typeof MentorSessionPhaseSchema>
export type MentorSessionAction = z.infer<typeof MentorSessionActionSchema>

export interface MentorChatStructuredOutput {
  reply: string
  phase?: MentorSessionPhase
  actions?: MentorSessionAction[]
  decisions: string[]
  open_questions: string[]
  next_question: string | null
  next_action: string | null
}

export const MENTOR_CHAT_EMPTY_REPLY_PLACEHOLDER = '応答を表示できませんでした。'

export function isActionOnlyStructuredOutput(
  output: MentorChatStructuredOutput | null | undefined,
): output is MentorChatStructuredOutput {
  if (!output) {
    return false
  }

  return (
    output.reply.trim() === ''
    && (output.actions ?? []).filter((action) => action.type.trim()).length === 0
    && output.decisions.filter(Boolean).length === 0
    && output.open_questions.filter(Boolean).length === 0
    && !output.next_question?.trim()
    && !output.next_action?.trim()
  )
}

export function resolveMentorChatFinalContent({
  streamedText,
  structuredOutput,
  actionsReceived = false,
}: {
  streamedText?: string | null
  structuredOutput?: MentorChatStructuredOutput | null
  actionsReceived?: boolean
}) {
  const reply = structuredOutput?.reply?.trim() ?? ''
  if (reply) {
    return reply
  }

  const streamed = streamedText?.trim() ?? ''
  if (streamed) {
    return streamed
  }

  if (actionsReceived && isActionOnlyStructuredOutput(structuredOutput)) {
    return null
  }

  return MENTOR_CHAT_EMPTY_REPLY_PLACEHOLDER
}
