import { describe, expect, it } from 'vitest'
import {
  buildMentorChatStructuredOutputFallback,
  coerceMentorChatStructuredOutput,
  extractStructuredReplyPreview,
  parseMentorChatStructuredOutput,
} from './structured-output'

describe('structured output helpers', () => {
  it('extracts the streamed reply field preview', () => {
    const preview = extractStructuredReplyPreview('{"reply":"次の一歩を決めましょう","decisions":[]}')
    expect(preview).toBe('次の一歩を決めましょう')
  })

  it('parses the common structured output schema', () => {
    const result = parseMentorChatStructuredOutput(
      '{"reply":"回答です","decisions":["方向性を決めた"],"open_questions":["素材があるか"],"next_question":"画像はありますか？","next_action":"画像を1枚用意する"}',
      'unit-test',
    )

    expect(result.usedFallback).toBe(false)
    expect(result.structuredOutput).toEqual({
      reply: '回答です',
      phase: 'coaching',
      actions: [],
      decisions: ['方向性を決めた'],
      open_questions: ['素材があるか'],
      next_question: '画像はありますか？',
      next_action: '画像を1枚用意する',
    })
  })

  it('preserves the full raw reply when the model returns plain text', () => {
    const rawText = 'JSON ではない返答です。'
    const result = parseMentorChatStructuredOutput(rawText, 'unit-test')

    expect(result.usedFallback).toBe(true)
    expect(result.structuredOutput).toEqual(buildMentorChatStructuredOutputFallback(rawText))
  })

  it('prefers accumulated plain-text reply when it was already streamed to the UI', () => {
    const result = parseMentorChatStructuredOutput(
      'JSON ではない返答です。',
      'unit-test',
      'ストリーミング済みの返答です。',
    )

    expect(result.usedFallback).toBe(true)
    expect(result.structuredOutput).toEqual({
      reply: 'ストリーミング済みの返答です。',
      phase: 'coaching',
      actions: [],
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })
  })

  it('uses accumulated streamed reply text when JSON parsing succeeds but the reply field is invalid', () => {
    const result = parseMentorChatStructuredOutput(
      '{"reply":123,"decisions":[]}',
      'unit-test',
      'ストリーミング済みの返答です。',
    )

    expect(result.usedFallback).toBe(true)
    expect(result.structuredOutput).toEqual({
      reply: 'ストリーミング済みの返答です。',
      phase: 'coaching',
      actions: [],
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })
  })

  it('uses accumulated streamed reply text when a JSON-like payload is truncated', () => {
    const result = parseMentorChatStructuredOutput(
      '{"reply":"ストリーム途中の回答","decisions":[',
      'unit-test',
      'ストリーム途中の回答',
    )

    expect(result.usedFallback).toBe(true)
    expect(result.structuredOutput).toEqual({
      reply: 'ストリーム途中の回答',
      phase: 'coaching',
      actions: [],
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })
  })

  it('uses the generic placeholder when only a raw JSON blob remains after fallback', () => {
    const result = parseMentorChatStructuredOutput(
      '{"reply":"回答です","decisions":[',
      'unit-test',
      '',
    )

    expect(result.usedFallback).toBe(true)
    expect(result.structuredOutput).toEqual({
      reply: '応答を表示できませんでした。',
      phase: 'coaching',
      actions: [],
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })
  })

  it('accepts an empty reply when coercing action-only done payload data', () => {
    expect(coerceMentorChatStructuredOutput({ reply: '' })).toEqual({
      reply: '',
      phase: 'coaching',
      actions: [],
      decisions: [],
      open_questions: [],
      next_question: null,
      next_action: null,
    })
  })
})
