import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockApplyRateLimit,
  mockCreateClient,
  mockEmitTelemetryEvent,
  mockGetLatestActiveCompiledPlan,
} = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn(),
  mockCreateClient: vi.fn(),
  mockEmitTelemetryEvent: vi.fn(),
  mockGetLatestActiveCompiledPlan: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mockApplyRateLimit,
  RL_WRITE: { limit: 10, windowMs: 60000 },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/telemetry', () => ({
  emitTelemetryEvent: mockEmitTelemetryEvent,
}))

vi.mock('@/lib/compiled-plans', () => ({
  getLatestActiveCompiledPlan: mockGetLatestActiveCompiledPlan,
}))

type ActivePlanFixture = {
  planId: string
  userId: string
  steps: unknown[]
}

function createCompiledPlansClient(plan: ActivePlanFixture | null) {
  const state = {
    plan: plan
      ? {
          planId: plan.planId,
          userId: plan.userId,
          steps: structuredClone(plan.steps),
        }
      : null,
    updateCalls: 0,
  }

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: state.plan ? { id: state.plan.userId } : { id: 'user-123' },
        },
        error: null,
      }),
    },
    from(table: string) {
      expect(table).toBe('compiled_plans')

      const filters: Record<string, unknown> = {}

      const builder = {
        select() {
          return builder
        },
        eq(field: string, value: unknown) {
          filters[field] = value
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle: async () => {
          if (!state.plan) {
            return { data: null, error: null }
          }

          if (filters.user_id !== state.plan.userId || filters.status !== 'active') {
            return { data: null, error: null }
          }

          return {
            data: {
              plan_id: state.plan.planId,
              steps: structuredClone(state.plan.steps),
            },
            error: null,
          }
        },
        update(payload: Record<string, unknown>) {
          const updateFilters: Record<string, unknown> = {}

          const updateBuilder = {
            eq(field: string, value: unknown) {
              updateFilters[field] = value
              return updateBuilder
            },
            then(resolve: (value: { data: null; error: Error | null }) => void) {
              if (
                state.plan &&
                updateFilters.plan_id === state.plan.planId &&
                updateFilters.user_id === state.plan.userId
              ) {
                state.plan.steps = structuredClone(payload.steps as unknown[])
                state.updateCalls += 1
                resolve({ data: null, error: null })
                return
              }

              resolve({ data: null, error: new Error('update filter mismatch') })
            },
          }

          return updateBuilder
        },
      }

      return builder
    },
  }

  return {
    client,
    getUpdateCalls() {
      return state.updateCalls
    },
  }
}

function buildRequest(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': 'req-123',
      ...init?.headers,
    },
  })
}

describe('POST /api/lessons/[id]/complete', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockApplyRateLimit.mockResolvedValue(null)
    mockEmitTelemetryEvent.mockResolvedValue(undefined)
    mockGetLatestActiveCompiledPlan.mockResolvedValue({
      planId: 'plan-1',
      goal: 'Ship a site',
      personaId: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the next atom and emits lesson/evidence telemetry when an artifact is supplied', async () => {
    const fixture = createCompiledPlansClient({
      planId: 'plan-1',
      userId: 'user-123',
      steps: [
        { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
        { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: null },
        { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-1', completed_at: null },
      ],
    })
    mockCreateClient.mockResolvedValue(fixture.client)

    const { POST } = await import('./route')
    const response = await POST(
      buildRequest('/api/lessons/atom-2/complete', {
        method: 'POST',
        body: JSON.stringify({ artifact: { type: 'link' } }),
      }),
      {
        params: Promise.resolve({ id: 'atom-2' }),
      },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      ok: true,
      next: {
        kind: 'next',
        nextAtomId: 'atom-3',
        nextAtomTitle: 'Atom 3',
        milestoneId: 'ms-1',
        progress: { completed: 2, total: 3 },
      },
    })
    expect(fixture.getUpdateCalls()).toBe(1)
    expect(mockEmitTelemetryEvent).toHaveBeenCalledTimes(2)
    expect(mockEmitTelemetryEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'lesson_completed',
        atomId: 'atom-2',
        planId: 'plan-1',
        requestId: 'req-123',
      }),
    )
    expect(mockEmitTelemetryEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'evidence_passed',
        atomId: 'atom-2',
        planId: 'plan-1',
        requestId: 'req-123',
      }),
    )
  })

  it('keeps the main path running when telemetry emission fails', async () => {
    const fixture = createCompiledPlansClient({
      planId: 'plan-1',
      userId: 'user-123',
      steps: [
        { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: null },
      ],
    })
    mockCreateClient.mockResolvedValue(fixture.client)
    mockEmitTelemetryEvent.mockRejectedValueOnce(new Error('telemetry down'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('./route')
    const response = await POST(
      buildRequest('/api/lessons/atom-1/complete', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: 'atom-1' }),
      },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      ok: true,
      next: {
        kind: 'plan_complete',
        milestoneId: 'ms-1',
        progress: { completed: 1, total: 1 },
      },
    })
    expect(fixture.getUpdateCalls()).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith('lesson_completed telemetry failed', expect.any(Error))
  })
})
