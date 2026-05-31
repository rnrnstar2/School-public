/**
 * TQ-269 / W50: unit tests for the per-user monthly budget cap helpers
 * exported from `mentor-metrics`.
 *
 * Scope (W50): test the pure helpers only. Conductor / sub-agent
 * dispatch wiring is owned by W47 and tested separately.
 */

import { describe, expect, it } from 'vitest'

import {
  BudgetCapError,
  DEFAULT_USER_MONTHLY_BUDGET_CAP_USD,
  assertUserBudgetCap,
  enforceUserBudgetCap,
  getConfiguredUserMonthlyBudgetCapUsd,
  getUserMonthlyBudgetUsd,
  type AgentRunRecord,
} from '@/lib/admin/mentor-metrics'

const NOW = new Date('2026-05-09T12:00:00.000Z')

function makeRun(
  startedAt: string,
  costUsd: number,
  overrides: Partial<AgentRunRecord> = {},
): AgentRunRecord {
  return {
    id: overrides.id ?? `run-${Math.random().toString(16).slice(2, 8)}`,
    agentType: overrides.agentType ?? 'claude',
    runStatus: overrides.runStatus ?? 'success',
    startedAt,
    finishedAt: overrides.finishedAt ?? null,
    metadata: { cost_usd: costUsd, ...(overrides.metadata ?? {}) },
  }
}

describe('getConfiguredUserMonthlyBudgetCapUsd', () => {
  it('returns the default when env override is missing', () => {
    expect(getConfiguredUserMonthlyBudgetCapUsd({})).toBe(
      DEFAULT_USER_MONTHLY_BUDGET_CAP_USD,
    )
  })

  it('parses a valid numeric env override', () => {
    expect(
      getConfiguredUserMonthlyBudgetCapUsd({
        MENTOR_USER_MONTHLY_BUDGET_CAP_USD: '12.5',
      }),
    ).toBe(12.5)
  })

  it('falls back to default for non-numeric env values', () => {
    expect(
      getConfiguredUserMonthlyBudgetCapUsd({
        MENTOR_USER_MONTHLY_BUDGET_CAP_USD: 'not-a-number',
      }),
    ).toBe(DEFAULT_USER_MONTHLY_BUDGET_CAP_USD)
  })

  it('falls back to default for non-positive env values', () => {
    expect(
      getConfiguredUserMonthlyBudgetCapUsd({
        MENTOR_USER_MONTHLY_BUDGET_CAP_USD: '0',
      }),
    ).toBe(DEFAULT_USER_MONTHLY_BUDGET_CAP_USD)
    expect(
      getConfiguredUserMonthlyBudgetCapUsd({
        MENTOR_USER_MONTHLY_BUDGET_CAP_USD: '-3.14',
      }),
    ).toBe(DEFAULT_USER_MONTHLY_BUDGET_CAP_USD)
  })
})

describe('getUserMonthlyBudgetUsd', () => {
  it('sums cost_usd across runs in the current UTC month', () => {
    const runs = [
      makeRun('2026-05-01T00:00:00.000Z', 1.25),
      makeRun('2026-05-08T11:00:00.000Z', 0.75),
      makeRun('2026-05-09T11:30:00.000Z', 2.5),
    ]
    expect(getUserMonthlyBudgetUsd(runs, { now: NOW })).toBe(4.5)
  })

  it('excludes runs from previous months', () => {
    const runs = [
      makeRun('2026-04-30T23:59:59.000Z', 100), // previous month — excluded
      makeRun('2026-05-01T00:00:00.000Z', 1),
    ]
    expect(getUserMonthlyBudgetUsd(runs, { now: NOW })).toBe(1)
  })

  it('returns 0 for empty input', () => {
    expect(getUserMonthlyBudgetUsd([], { now: NOW })).toBe(0)
  })

  it('ignores runs with non-numeric / missing cost_usd', () => {
    const runs: AgentRunRecord[] = [
      {
        id: 'r1',
        agentType: 'claude',
        runStatus: 'success',
        startedAt: '2026-05-08T00:00:00.000Z',
        finishedAt: null,
        metadata: null,
      },
      {
        id: 'r2',
        agentType: 'claude',
        runStatus: 'success',
        startedAt: '2026-05-08T00:00:00.000Z',
        finishedAt: null,
        metadata: { cost_usd: 'oops' },
      },
      makeRun('2026-05-08T00:00:00.000Z', 0.42),
    ]
    expect(getUserMonthlyBudgetUsd(runs, { now: NOW })).toBe(0.42)
  })
})

describe('enforceUserBudgetCap', () => {
  it('allows the call when projected total is under cap', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 1.0)]
    const result = enforceUserBudgetCap({
      userId: 'user-a',
      runs,
      estimateUsd: 0.5,
      capUsd: 5,
      now: NOW,
    })
    expect(result.allowed).toBe(true)
    expect(result.currentUsd).toBe(1)
    expect(result.estimateUsd).toBe(0.5)
    expect(result.capUsd).toBe(5)
    expect(result.remainingUsd).toBe(3.5)
  })

  it('denies the call at the threshold (strict over-cap fails)', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 4.5)]
    const result = enforceUserBudgetCap({
      userId: 'user-a',
      runs,
      estimateUsd: 1.0,
      capUsd: 5,
      now: NOW,
    })
    expect(result.allowed).toBe(false)
    expect(result.remainingUsd).toBe(0)
  })

  it('uses configured cap when caller omits capUsd', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 0.1)]
    const result = enforceUserBudgetCap({
      userId: 'user-a',
      runs,
      estimateUsd: 0.1,
      now: NOW,
    })
    expect(result.capUsd).toBe(DEFAULT_USER_MONTHLY_BUDGET_CAP_USD)
    expect(result.allowed).toBe(true)
  })

  it('treats negative or invalid estimates as 0', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 1.0)]
    const result = enforceUserBudgetCap({
      userId: 'user-a',
      runs,
      estimateUsd: -2,
      capUsd: 5,
      now: NOW,
    })
    expect(result.estimateUsd).toBe(0)
    expect(result.allowed).toBe(true)
  })
})

describe('assertUserBudgetCap', () => {
  it('returns the same shape as enforceUserBudgetCap on success', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 0.25)]
    const result = assertUserBudgetCap({
      userId: 'user-a',
      runs,
      estimateUsd: 0.25,
      capUsd: 5,
      now: NOW,
    })
    expect(result.allowed).toBe(true)
  })

  it('throws BudgetCapError when over cap', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 4.9)]
    expect(() =>
      assertUserBudgetCap({
        userId: 'user-a',
        runs,
        estimateUsd: 0.5,
        capUsd: 5,
        now: NOW,
      }),
    ).toThrow(BudgetCapError)
  })

  it('preserves cap context on the thrown error', () => {
    const runs = [makeRun('2026-05-08T00:00:00.000Z', 4.9)]
    try {
      assertUserBudgetCap({
        userId: 'user-a',
        runs,
        estimateUsd: 0.5,
        capUsd: 5,
        now: NOW,
      })
      expect.fail('expected BudgetCapError to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetCapError)
      const cap = error as BudgetCapError
      expect(cap.userId).toBe('user-a')
      expect(cap.currentUsd).toBe(4.9)
      expect(cap.estimateUsd).toBe(0.5)
      expect(cap.capUsd).toBe(5)
    }
  })
})
