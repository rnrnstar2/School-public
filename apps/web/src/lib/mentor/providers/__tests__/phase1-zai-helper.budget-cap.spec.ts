/**
 * W55: Phase 1 ZAI helper × per-user budget cap integration test.
 *
 * Verifies that `maybeRunPhase1ZaiCall`:
 * - throws BudgetCapError when invoked inside a `runWithMentorBudgetCap`
 *   scope whose user is over cap (and **does not** swallow it as null).
 * - succeeds when under cap (returns a parsed Phase1ZaiCallResult).
 * - is unchanged when no scope is installed (legacy path stays green).
 *
 * fetchWithRetry is mocked at the module boundary so we never make a real
 * network call. ZAI env vars are stubbed inline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type AgentRunRecord,
  BudgetCapError,
} from '@/lib/admin/mentor-metrics'
import {
  maybeRunPhase1ZaiCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers/phase1-zai-helper'
import { runWithMentorBudgetCap } from '@/lib/mentor/providers/budget-cap-runtime'

// fetchWithRetry mock — return a fake ZAI completion JSON.
vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ),
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
  process.env.ZAI_PLANNER_API_KEY = 'test-zai-key'
  process.env.ZAI_PLANNER_API_URL = 'https://api.z.ai/api/coding/paas/v4'
  delete process.env.MENTOR_PROVIDER_PHASE3
})

afterEach(() => {
  process.env = { ...ENV_BACKUP }
  vi.clearAllMocks()
})

describe('maybeRunPhase1ZaiCall — no budget cap scope (legacy path)', () => {
  it('returns the parsed result without enforcement', async () => {
    const out = await maybeRunPhase1ZaiCall({
      system: 'sys',
      userMessage: '{"q":1}',
    })
    expect(out).not.toBeNull()
    expect(out?.provider).toBe('zai')
    expect(out?.text).toBe('{"ok":true}')
  })
})

describe('maybeRunPhase1ZaiCall — budget cap scope, under cap', () => {
  it('proceeds normally', async () => {
    const out = await runWithMentorBudgetCap(
      {
        userId: 'user-a',
        loadUserRuns: async () => [makeRun(1.0)],
        capUsd: 5,
      },
      () =>
        maybeRunPhase1ZaiCall({
          system: 'sys',
          userMessage: '{"q":1}',
        }),
    )
    expect(out).not.toBeNull()
    expect(out?.text).toBe('{"ok":true}')
  })
})

describe('maybeRunPhase1ZaiCall — budget cap scope, OVER cap', () => {
  it('throws BudgetCapError (does not swallow as null)', async () => {
    await expect(
      runWithMentorBudgetCap(
        {
          userId: 'user-a',
          loadUserRuns: async () => [makeRun(4.99)],
          capUsd: 5,
          estimateUsdPerCall: 0.5,
        },
        () =>
          maybeRunPhase1ZaiCall({
            system: 'sys',
            userMessage: '{"q":1}',
          }),
      ),
    ).rejects.toBeInstanceOf(BudgetCapError)
  })

  it('does not POST to ZAI when over cap', async () => {
    const fetchModule = await import('@/lib/api/fetch-with-retry')
    const spy = fetchModule.fetchWithRetry as unknown as ReturnType<typeof vi.fn>
    spy.mockClear()

    await expect(
      runWithMentorBudgetCap(
        {
          userId: 'user-a',
          loadUserRuns: async () => [makeRun(4.99)],
          capUsd: 5,
          estimateUsdPerCall: 0.5,
        },
        () =>
          maybeRunPhase1ZaiCall({
            system: 'sys',
            userMessage: '{"q":1}',
          }),
      ),
    ).rejects.toBeInstanceOf(BudgetCapError)

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('shouldRunPhase1ZaiCall', () => {
  it('returns true when MENTOR_PROVIDER_PHASE3 is unset', () => {
    delete process.env.MENTOR_PROVIDER_PHASE3
    expect(shouldRunPhase1ZaiCall()).toBe(true)
  })

  it('returns false when MENTOR_PROVIDER_PHASE3=1', () => {
    process.env.MENTOR_PROVIDER_PHASE3 = '1'
    expect(shouldRunPhase1ZaiCall()).toBe(false)
  })
})
