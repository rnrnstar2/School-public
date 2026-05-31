import { describe, expect, it } from 'vitest'
import { isActionOnlyStructuredOutput } from './mentor-chat'

describe('isActionOnlyStructuredOutput', () => {
  it('returns true when reply and structured sections are all empty', () => {
    expect(isActionOnlyStructuredOutput({
      reply: '',
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })).toBe(true)
  })

  it('returns false when any structured section still has content', () => {
    expect(isActionOnlyStructuredOutput({
      reply: '',
      decisions: ['進め方を決めた'],
      open_questions: [],
      next_question: null,
      next_action: null,
    })).toBe(false)
  })
})
