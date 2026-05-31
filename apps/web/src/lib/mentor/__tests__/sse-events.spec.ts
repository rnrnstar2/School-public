/**
 * W69: parseMentorSseErrorEvent unit tests.
 *
 * `/api/mentor/session` SSE が emit する `event: error` payload を client が
 * 構造化された MentorBudgetCapEvent / MentorGenericErrorEvent に分類できることを
 * 保証する。
 */

import { describe, expect, it } from 'vitest'

import {
  computeNextMonthResetIso,
  parseMentorSseErrorEvent,
  MENTOR_BUDGET_CAP_ERROR_CODE,
  MENTOR_SESSION_FAILED_ERROR_CODE,
} from '@/lib/mentor/sse-events'

describe('parseMentorSseErrorEvent', () => {
  it('classifies mentor_budget_cap_exceeded with full cap fields', () => {
    const now = new Date('2026-05-09T12:00:00.000Z')
    const result = parseMentorSseErrorEvent(
      {
        error: MENTOR_BUDGET_CAP_ERROR_CODE,
        message: '今月のメンター利用上限に達しました。',
        cap: {
          userId: 'user-w69',
          currentUsd: 4.83,
          estimateUsd: 0.25,
          capUsd: 5,
        },
      },
      { now },
    )

    expect(result.kind).toBe('budget_cap')
    if (result.kind !== 'budget_cap') return // type narrow
    expect(result.userId).toBe('user-w69')
    expect(result.usedUsd).toBe(4.83)
    expect(result.capUsd).toBe(5)
    // projected = used + estimate, rounded to 2dp.
    expect(result.projectedUsd).toBe(5.08)
    // 2026-05 → reset 2026-06-01T00:00:00.000Z
    expect(result.resetAtIso).toBe('2026-06-01T00:00:00.000Z')
    expect(result.message).toContain('上限')
  })

  it('falls back to projected=null when estimateUsd is absent (legacy payload)', () => {
    const result = parseMentorSseErrorEvent(
      {
        error: MENTOR_BUDGET_CAP_ERROR_CODE,
        cap: {
          userId: 'user-legacy',
          currentUsd: 3.2,
          capUsd: 5,
        },
      },
      { now: new Date('2026-05-09T00:00:00.000Z') },
    )

    expect(result.kind).toBe('budget_cap')
    if (result.kind !== 'budget_cap') return
    expect(result.usedUsd).toBe(3.2)
    expect(result.capUsd).toBe(5)
    expect(result.projectedUsd).toBeNull()
  })

  it('uses fallback message when budget_cap payload omits message', () => {
    const result = parseMentorSseErrorEvent(
      {
        error: MENTOR_BUDGET_CAP_ERROR_CODE,
        cap: { userId: 'u', currentUsd: 1, capUsd: 5 },
      },
      { now: new Date('2026-05-09T00:00:00.000Z') },
    )

    if (result.kind !== 'budget_cap') throw new Error('expected budget_cap')
    expect(result.message).toMatch(/上限/)
  })

  it('classifies mentor_session_failed as generic error', () => {
    const result = parseMentorSseErrorEvent({
      error: MENTOR_SESSION_FAILED_ERROR_CODE,
      message: 'AI が応答しません',
    })

    expect(result).toEqual({
      kind: 'generic',
      message: 'AI が応答しません',
    })
  })

  it('returns generic fallback for unknown error code', () => {
    const result = parseMentorSseErrorEvent({
      error: 'something_else',
      message: 'unknown failure',
    })

    expect(result.kind).toBe('generic')
  })

  it('returns generic fallback for non-object payload', () => {
    expect(parseMentorSseErrorEvent(null).kind).toBe('generic')
    expect(parseMentorSseErrorEvent('boom').kind).toBe('generic')
    expect(parseMentorSseErrorEvent(undefined).kind).toBe('generic')
  })

  it('handles malformed cap.currentUsd (negative / NaN) by treating as 0', () => {
    const result = parseMentorSseErrorEvent(
      {
        error: MENTOR_BUDGET_CAP_ERROR_CODE,
        cap: { userId: 'u', currentUsd: -1, capUsd: 5 },
      },
      { now: new Date('2026-05-09T00:00:00.000Z') },
    )

    if (result.kind !== 'budget_cap') throw new Error('expected budget_cap')
    expect(result.usedUsd).toBe(0)
  })
})

describe('computeNextMonthResetIso', () => {
  it('rolls May to June 1', () => {
    expect(computeNextMonthResetIso(new Date('2026-05-09T15:00:00.000Z'))).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('rolls December to next-year January 1', () => {
    expect(computeNextMonthResetIso(new Date('2026-12-31T23:59:59.000Z'))).toBe(
      '2027-01-01T00:00:00.000Z',
    )
  })

  it('uses UTC boundaries regardless of input local offset', () => {
    // Construct a Date at end-of-month UTC.
    const lastDayUtc = new Date(Date.UTC(2026, 4, 31, 23, 30, 0))
    expect(computeNextMonthResetIso(lastDayUtc)).toBe('2026-06-01T00:00:00.000Z')
  })
})
