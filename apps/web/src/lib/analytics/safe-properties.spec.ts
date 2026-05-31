import { describe, expect, it } from 'vitest'
import {
  listDeniedKeys,
  sanitizeAnalyticsProperties,
} from './safe-properties'

describe('sanitizeAnalyticsProperties (TQ-120 §31)', () => {
  it('drops keys that look like PII', () => {
    const out = sanitizeAnalyticsProperties({
      email: 'alice@example.com',
      full_name: 'Alice Example',
      goal: 'ポートフォリオサイトを作りたい',
      goal_text: 'Webサイトを作りたい',
      revision_summary: '...',
      message_body: 'こんにちは',
      lesson_id: 'atom.ai-freelancer.x',
    })
    expect(out).toEqual({ lesson_id: 'atom.ai-freelancer.x' })
  })

  it('preserves safe scalar identifiers and counts', () => {
    const out = sanitizeAnalyticsProperties({
      lesson_id: 'atom.x',
      track_id: 'ai-content-creator',
      plan_id: 'plan-123',
      revision_number: 3,
      step_count: 5,
      source: 'client',
      from_recommendation: false,
    })
    expect(out).toMatchObject({
      lesson_id: 'atom.x',
      track_id: 'ai-content-creator',
      plan_id: 'plan-123',
      revision_number: 3,
      step_count: 5,
      source: 'client',
      from_recommendation: false,
    })
  })

  it('redacts long string values', () => {
    const long = 'x'.repeat(300)
    const out = sanitizeAnalyticsProperties({ custom_note: long })
    expect(out.custom_note).toMatch(/^<redacted:len=300>$/)
  })

  it('drops undefined values but keeps null and 0', () => {
    const out = sanitizeAnalyticsProperties({
      maybe: undefined,
      nada: null,
      zero: 0,
      flag: false,
    })
    expect(out).not.toHaveProperty('maybe')
    expect(out).toHaveProperty('nada', null)
    expect(out).toHaveProperty('zero', 0)
    expect(out).toHaveProperty('flag', false)
  })

  it('case-insensitive key matching', () => {
    const out = sanitizeAnalyticsProperties({
      UserEmail: 'x@y.z',
      GOAL_TEXT: '学習ゴール',
      Lesson_id: 'atom.x',
    })
    expect(out).not.toHaveProperty('UserEmail')
    expect(out).not.toHaveProperty('GOAL_TEXT')
    // `Lesson_id` doesn't hit any deny substring so it survives the filter
    // (case-insensitivity only matters for deny matching, not allow-listing).
    expect(out).toHaveProperty('Lesson_id', 'atom.x')
  })

  it('exposes a listDeniedKeys helper for diagnostics', () => {
    const denied = listDeniedKeys({
      email: 'x',
      lesson_id: 'y',
      revision_summary: 'z',
    })
    expect(denied.sort()).toEqual(['email', 'revision_summary'])
  })
})
