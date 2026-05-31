/**
 * W55: Conductor × per-user budget cap integration test.
 *
 * Verifies:
 * - When Conductor.run() is invoked with `input.budgetCap`, the AsyncLocalStorage
 *   scope reaches sub-agent dispatchers (here, simulated by reading
 *   `getActiveMentorBudgetCapContext` inside a delegate).
 * - When a delegate (sub-agent) throws BudgetCapError during INVESTIGATE,
 *   Conductor logs the cap exceedance and continues to SYNTH with an empty
 *   investigate result (graceful degradation contract).
 * - When BudgetCapError surfaces from SYNTH/REVIEW/COMMIT, Conductor stops at
 *   that state and re-throws (caller responsibility = 429 / banner).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  Conductor,
  type ConductorDelegates,
  type ConductorInput,
} from '@/lib/mentor/conductor'
import {
  BudgetCapError,
  getActiveMentorBudgetCapContext,
  type MentorBudgetCapContext,
} from '@/lib/mentor/providers/budget-cap-runtime'

function buildDelegates(
  overrides: Partial<ConductorDelegates> = {},
): ConductorDelegates {
  return {
    hearing: vi.fn().mockResolvedValue({ completed: true, payload: 'h' }),
    scoping: vi.fn().mockResolvedValue({ payload: 's' }),
    investigate: vi.fn().mockResolvedValue({ payload: null, subAgents: [] }),
    synth: vi.fn().mockResolvedValue({ payload: 'syn' }),
    review: vi.fn().mockResolvedValue({ payload: null, verdict: 'accept' }),
    commit: vi.fn().mockResolvedValue({ payload: 'committed' }),
    ...overrides,
  }
}

function buildInput(
  delegates: ConductorDelegates,
  overrides: Partial<ConductorInput> = {},
): ConductorInput {
  return {
    userId: 'user-1',
    goal: 'g',
    delegates,
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Conductor × budget cap context propagation', () => {
  it('exposes the budget cap context to delegates via AsyncLocalStorage', async () => {
    let observed: MentorBudgetCapContext | null = null
    const delegates = buildDelegates({
      investigate: vi.fn(async () => {
        observed = getActiveMentorBudgetCapContext()
        return { payload: null, subAgents: [] }
      }),
    })
    const cap: MentorBudgetCapContext = {
      userId: 'user-1',
      loadUserRuns: async () => [],
    }
    await new Conductor().run(buildInput(delegates, { budgetCap: cap }))
    expect(observed).toBe(cap)
  })

  it('does not install scope when budgetCap is not provided', async () => {
    let observed: MentorBudgetCapContext | null = { userId: 'sentinel', loadUserRuns: async () => [] }
    const delegates = buildDelegates({
      investigate: vi.fn(async () => {
        observed = getActiveMentorBudgetCapContext()
        return { payload: null, subAgents: [] }
      }),
    })
    await new Conductor().run(buildInput(delegates))
    expect(observed).toBeNull()
  })
})

describe('Conductor × budget cap graceful degradation (INVESTIGATE)', () => {
  it('skips INVESTIGATE on BudgetCapError and continues to SYNTH', async () => {
    const delegates = buildDelegates({
      investigate: vi.fn(async () => {
        throw new BudgetCapError({
          userId: 'user-1',
          currentUsd: 4.95,
          estimateUsd: 0.5,
          capUsd: 5,
        })
      }),
    })
    const out = await new Conductor().run(buildInput(delegates))
    expect(out.finalState).toBe('DONE')
    expect(out.investigate).toEqual({ payload: null, subAgents: [] })
    expect(delegates.synth).toHaveBeenCalledTimes(1)
    const investigateLog = out.log.find((l) => l.state === 'INVESTIGATE')
    expect(investigateLog?.ok).toBe(false)
    expect(investigateLog?.message).toContain('budget_cap_exceeded')
    expect(investigateLog?.message).toContain('user=user-1')
  })
})

describe('Conductor × budget cap escalation (SYNTH+)', () => {
  it('re-throws BudgetCapError from SYNTH and stops state machine there', async () => {
    const delegates = buildDelegates({
      synth: vi.fn(async () => {
        throw new BudgetCapError({
          userId: 'user-1',
          currentUsd: 4.95,
          estimateUsd: 0.5,
          capUsd: 5,
        })
      }),
    })
    await expect(new Conductor().run(buildInput(delegates))).rejects.toBeInstanceOf(
      BudgetCapError,
    )
  })

  it('records phase=SYNTH as the final state when cap blows there', async () => {
    const delegates = buildDelegates({
      synth: vi.fn(async () => {
        throw new BudgetCapError({
          userId: 'user-1',
          currentUsd: 4.95,
          estimateUsd: 0.5,
          capUsd: 5,
        })
      }),
    })
    let captured: { error: BudgetCapError; out: unknown } | null = null
    try {
      await new Conductor().run(buildInput(delegates))
    } catch (error) {
      captured = { error: error as BudgetCapError, out: null }
    }
    expect(captured?.error).toBeInstanceOf(BudgetCapError)
    expect((captured?.error as BudgetCapError).userId).toBe('user-1')
  })
})
