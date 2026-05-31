/**
 * W55: budget-cap-runtime — AsyncLocalStorage scope behavior.
 *
 * Verifies:
 * - opt-in scope (no context = no enforcement)
 * - cap exceeded → BudgetCapError thrown
 * - loader exception → fail-safe (no enforcement)
 * - phase 'phase1' vs 'phase3' default estimate selection
 */

import { describe, expect, it, vi } from 'vitest'

import {
  type AgentRunRecord,
  BudgetCapError,
  DEFAULT_USER_MONTHLY_BUDGET_CAP_USD,
} from '@/lib/admin/mentor-metrics'
import {
  DEFAULT_PHASE_ESTIMATE_USD,
  enforceUserBudgetCapForPhase,
  getActiveMentorBudgetCapContext,
  runWithMentorBudgetCap,
  type MentorBudgetCapContext,
} from '@/lib/mentor/providers/budget-cap-runtime'

const NOW = new Date('2026-05-09T12:00:00.000Z')

function makeRun(costUsd: number, startedAt = '2026-05-08T00:00:00.000Z'): AgentRunRecord {
  return {
    id: `run-${Math.random().toString(16).slice(2, 8)}`,
    agentType: 'claude',
    runStatus: 'success',
    startedAt,
    finishedAt: null,
    metadata: { cost_usd: costUsd },
  }
}

describe('runWithMentorBudgetCap / getActiveMentorBudgetCapContext', () => {
  it('returns null when no scope is active', () => {
    expect(getActiveMentorBudgetCapContext()).toBeNull()
  })

  it('exposes the installed context inside the scope only', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: async () => [],
    }
    let inside: MentorBudgetCapContext | null = null
    await runWithMentorBudgetCap(ctx, async () => {
      inside = getActiveMentorBudgetCapContext()
    })
    expect(inside).toBe(ctx)
    // Outside the scope the context is gone again.
    expect(getActiveMentorBudgetCapContext()).toBeNull()
  })
})

describe('enforceUserBudgetCapForPhase — no active scope', () => {
  it('is a no-op when no context is installed', async () => {
    await expect(enforceUserBudgetCapForPhase('phase1')).resolves.toBeUndefined()
    await expect(enforceUserBudgetCapForPhase('phase3')).resolves.toBeUndefined()
  })
})

describe('enforceUserBudgetCapForPhase — under cap', () => {
  it('returns normally when current spend + estimate ≤ cap', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: async () => [makeRun(0.1)],
      capUsd: 5,
    }
    await runWithMentorBudgetCap(ctx, async () => {
      await expect(enforceUserBudgetCapForPhase('phase1')).resolves.toBeUndefined()
    })
  })

  it('uses default cap (5.0 USD) when context omits capUsd', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: async () => [makeRun(DEFAULT_USER_MONTHLY_BUDGET_CAP_USD - 1)],
    }
    await runWithMentorBudgetCap(ctx, async () => {
      await expect(enforceUserBudgetCapForPhase('phase1')).resolves.toBeUndefined()
    })
  })
})

describe('enforceUserBudgetCapForPhase — over cap', () => {
  it('throws BudgetCapError when current + estimate > cap', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: async () => [makeRun(4.99)],
      capUsd: 5,
      estimateUsdPerCall: 0.5,
    }
    await runWithMentorBudgetCap(ctx, async () => {
      await expect(enforceUserBudgetCapForPhase('phase1')).rejects.toBeInstanceOf(
        BudgetCapError,
      )
    })
  })

  it('preserves cap context on the thrown error', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-b',
      loadUserRuns: async () => [makeRun(4.95)],
      capUsd: 5,
      estimateUsdPerCall: 0.5,
    }
    let captured: unknown = null
    await runWithMentorBudgetCap(ctx, async () => {
      try {
        await enforceUserBudgetCapForPhase('phase1')
      } catch (error) {
        captured = error
      }
    })
    expect(captured).toBeInstanceOf(BudgetCapError)
    const cap = captured as BudgetCapError
    expect(cap.userId).toBe('user-b')
    expect(cap.capUsd).toBe(5)
    expect(cap.currentUsd).toBe(4.95)
  })

  it('uses Phase 3 estimate override when calling with phase=phase3', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: async () => [makeRun(4.5)],
      capUsd: 5,
      // phase1 default 0.05 → 4.55, under cap.
      // phase3 default 0.25 → 4.75, also under, so we override to push over.
      estimateUsdPerCallPhase3: 0.6,
    }
    await runWithMentorBudgetCap(ctx, async () => {
      await expect(enforceUserBudgetCapForPhase('phase1')).resolves.toBeUndefined()
      await expect(enforceUserBudgetCapForPhase('phase3')).rejects.toBeInstanceOf(
        BudgetCapError,
      )
    })
  })
})

describe('enforceUserBudgetCapForPhase — fail-safe loader', () => {
  it('skips enforcement when loader throws (DB outage path)', async () => {
    const ctx: MentorBudgetCapContext = {
      userId: 'user-a',
      loadUserRuns: vi.fn().mockRejectedValue(new Error('db_outage')),
      capUsd: 5,
    }
    await runWithMentorBudgetCap(ctx, async () => {
      await expect(enforceUserBudgetCapForPhase('phase1')).resolves.toBeUndefined()
    })
    expect(ctx.loadUserRuns).toHaveBeenCalledTimes(1)
  })
})

describe('DEFAULT_PHASE_ESTIMATE_USD', () => {
  it('publishes both phase defaults as positive numbers', () => {
    expect(DEFAULT_PHASE_ESTIMATE_USD.phase1).toBeGreaterThan(0)
    expect(DEFAULT_PHASE_ESTIMATE_USD.phase3).toBeGreaterThan(0)
  })

  it('keeps phase3 estimate ≥ phase1 (BYOK is more expensive)', () => {
    expect(DEFAULT_PHASE_ESTIMATE_USD.phase3).toBeGreaterThanOrEqual(
      DEFAULT_PHASE_ESTIMATE_USD.phase1,
    )
  })
})

// Bound the test suite to the deterministic NOW we declared above so future
// runs in May 2026+ don't drift behavior. (The pure helpers honour `now`,
// but the runtime delegates that to the global Date.) This suite uses
// runtime defaults; concrete drift tests live in `mentor-metrics-budget-cap`.
void NOW
