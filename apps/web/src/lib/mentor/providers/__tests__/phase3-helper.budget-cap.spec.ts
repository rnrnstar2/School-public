/**
 * W55: Phase 3 helper × per-user budget cap integration test.
 *
 * Verifies that `maybeRunPhase3ProviderCall`:
 * - throws BudgetCapError when invoked inside a `runWithMentorBudgetCap`
 *   scope whose user is over cap (does **not** swallow it as null).
 * - succeeds (returns ProviderCallResult) when under cap.
 * - skips dispatch (returns null, no enforcement) when Phase 3 env is OFF.
 *
 * dispatchProviderCall is mocked at the module boundary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type AgentRunRecord,
  BudgetCapError,
} from '@/lib/admin/mentor-metrics'
import { maybeRunPhase3ProviderCall } from '@/lib/mentor/providers/phase3-helper'
import { runWithMentorBudgetCap } from '@/lib/mentor/providers/budget-cap-runtime'

vi.mock('@/lib/mentor/providers/provider-dispatch', () => ({
  dispatchProviderCall: vi.fn(async () => ({
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4-6',
    text: '{"ok":true}',
    raw: {},
  })),
}))

function makeRun(costUsd: number): AgentRunRecord {
  return {
    id: `run-${Math.random().toString(16).slice(2, 8)}`,
    agentType: 'claude',
    runStatus: 'success',
    startedAt: '2026-05-08T00:00:00.000Z',
    finishedAt: null,
    metadata: { cost_usd: costUsd },
  }
}

const ENV_BACKUP = { ...process.env }

beforeEach(() => {
  process.env.MENTOR_PROVIDER_PHASE3 = '1'
})

afterEach(() => {
  process.env = { ...ENV_BACKUP }
  vi.clearAllMocks()
})

const ANTHROPIC_MODEL = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-6',
}

describe('maybeRunPhase3ProviderCall — Phase 3 OFF', () => {
  it('returns null without enforcement when env is unset', async () => {
    delete process.env.MENTOR_PROVIDER_PHASE3
    const out = await runWithMentorBudgetCap(
      {
        userId: 'user-a',
        loadUserRuns: async () => [makeRun(99)], // would be over any cap
        capUsd: 5,
      },
      () =>
        maybeRunPhase3ProviderCall({
          getApiKey: async () => 'fake-key',
          model: ANTHROPIC_MODEL,
          messages: [{ role: 'user', content: 'hi' }],
        }),
    )
    expect(out).toBeNull()
  })
})

describe('maybeRunPhase3ProviderCall — Phase 3 ON, no scope', () => {
  it('proceeds normally when no budget context is installed', async () => {
    const out = await maybeRunPhase3ProviderCall({
      getApiKey: async () => 'fake-key',
      model: ANTHROPIC_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(out).not.toBeNull()
    expect(out?.text).toBe('{"ok":true}')
  })
})

describe('maybeRunPhase3ProviderCall — Phase 3 ON + scope, under cap', () => {
  it('returns the ProviderCallResult', async () => {
    const out = await runWithMentorBudgetCap(
      {
        userId: 'user-a',
        loadUserRuns: async () => [makeRun(0.5)],
        capUsd: 5,
      },
      () =>
        maybeRunPhase3ProviderCall({
          getApiKey: async () => 'fake-key',
          model: ANTHROPIC_MODEL,
          messages: [{ role: 'user', content: 'hi' }],
        }),
    )
    expect(out?.text).toBe('{"ok":true}')
  })
})

describe('maybeRunPhase3ProviderCall — Phase 3 ON + scope, OVER cap', () => {
  it('throws BudgetCapError before resolving the BYOK key', async () => {
    const getApiKey = vi.fn(async () => 'fake-key')
    await expect(
      runWithMentorBudgetCap(
        {
          userId: 'user-a',
          loadUserRuns: async () => [makeRun(4.95)],
          capUsd: 5,
          estimateUsdPerCallPhase3: 0.5,
        },
        () =>
          maybeRunPhase3ProviderCall({
            getApiKey,
            model: ANTHROPIC_MODEL,
            messages: [{ role: 'user', content: 'hi' }],
          }),
      ),
    ).rejects.toBeInstanceOf(BudgetCapError)
    // BYOK key fetch must NOT be invoked when budget gate trips.
    expect(getApiKey).not.toHaveBeenCalled()
  })

  it('does not invoke dispatchProviderCall when over cap', async () => {
    const dispatchModule = await import('@/lib/mentor/providers/provider-dispatch')
    const spy = dispatchModule.dispatchProviderCall as unknown as ReturnType<
      typeof vi.fn
    >
    spy.mockClear()

    await expect(
      runWithMentorBudgetCap(
        {
          userId: 'user-a',
          loadUserRuns: async () => [makeRun(4.95)],
          capUsd: 5,
          estimateUsdPerCallPhase3: 0.5,
        },
        () =>
          maybeRunPhase3ProviderCall({
            getApiKey: async () => 'fake-key',
            model: ANTHROPIC_MODEL,
            messages: [{ role: 'user', content: 'hi' }],
          }),
      ),
    ).rejects.toBeInstanceOf(BudgetCapError)

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('maybeRunPhase3ProviderCall — ZAI provider short-circuit unaffected', () => {
  it('returns null for ZAI provider without enforcing cap', async () => {
    const out = await runWithMentorBudgetCap(
      {
        userId: 'user-a',
        loadUserRuns: async () => [makeRun(99)],
        capUsd: 5,
      },
      () =>
        maybeRunPhase3ProviderCall({
          getApiKey: async () => 'fake-key',
          model: { provider: 'zai', model: 'glm-5.1' },
          messages: [{ role: 'user', content: 'hi' }],
        }),
    )
    // ZAI is short-circuited above the budget gate per existing helper
    // contract — Phase 1 ZAI path takes that traffic instead.
    expect(out).toBeNull()
  })
})
