import { describe, expect, it } from 'vitest'

import {
  LESSON_AI_COMPLIANCE_MESSAGE,
  validateLessonAiCompliance,
} from './lesson-validation'

describe('validateLessonAiCompliance', () => {
  it('accepts lessons when tags include one of the required AI markers', () => {
    const result = validateLessonAiCompliance({
      tags: ['setup', 'ai-topic'],
    })

    expect(result.valid).toBe(true)
    expect(result.matchedTags).toEqual(['ai-topic'])
    expect(result.message).toBeNull()
  })

  it('accepts lessons when content_tags include a required AI marker object', () => {
    const result = validateLessonAiCompliance({
      tags: ['setup'],
      content_tags: [{ slug: 'ai-adjacent' }],
    })

    expect(result.valid).toBe(true)
    expect(result.matchedTags).toEqual(['ai-adjacent'])
  })

  it('rejects lessons when neither tags nor content_tags contain an AI marker', () => {
    const result = validateLessonAiCompliance({
      tags: ['setup', 'browser-first'],
      content_tags: [{ slug: 'portfolio' }],
    })

    expect(result.valid).toBe(false)
    expect(result.message).toBe(LESSON_AI_COMPLIANCE_MESSAGE)
  })
})
