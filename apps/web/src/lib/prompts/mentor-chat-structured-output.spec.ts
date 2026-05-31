import { describe, expect, it } from 'vitest'
import { buildMentorChatStructuredOutputPromptSection } from './mentor-chat-structured-output'

describe('buildMentorChatStructuredOutputPromptSection', () => {
  it('documents the 7-key JSON contract', () => {
    const section = buildMentorChatStructuredOutputPromptSection({
      nextActionLabel: 'このレッスンの練習タスク',
    })

    expect(section).toMatch(/## Structured output/)
    expect(section).toMatch(/`reply`, `phase`, `actions`, `decisions`, `open_questions`, `next_question`, `next_action`/)
    expect(section).toMatch(/このレッスンの練習タスク/)
    expect(section).toMatch(/Example 1/)
    expect(section).toMatch(/Example 2/)
  })
})
