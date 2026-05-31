import { describe, expect, it } from 'vitest'
import { MentorChatStructuredOutputSchema } from '@/types/mentor-chat'
import { finalizePlannerMentorStructuredOutput } from './finalize-structured-output'

describe('finalizePlannerMentorStructuredOutput', () => {
  it('strips mentor action tags from action-only replies before returning UI content', () => {
    const { detectedActions, finalStructuredOutput } = finalizePlannerMentorStructuredOutput({
      reply: '[MENTOR_ACTION:recompile_plan]進め方を見直したい[/MENTOR_ACTION]',
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })

    expect(detectedActions).toHaveLength(1)
    expect(finalStructuredOutput.reply).toBe('')
    expect(finalStructuredOutput.reply).not.toContain('[MENTOR_ACTION:')
    expect(finalStructuredOutput.reply).not.toContain('[/MENTOR_ACTION]')
    expect(MentorChatStructuredOutputSchema.safeParse(finalStructuredOutput).success).toBe(true)
  })
})
