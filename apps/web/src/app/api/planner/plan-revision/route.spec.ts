import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  validateBodyMock: vi.fn(),
  createClientMock: vi.fn(),
  createNotificationMock: vi.fn(),
  buildRevisionStepsMock: vi.fn(),
  calculateCoverageScoreMock: vi.fn(),
  getCompiledPlanRecordMock: vi.fn(),
  persistCompiledPlanSnapshotMock: vi.fn(),
  computePlanSeedMock: vi.fn(),
  emitTelemetryEventMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_WRITE: 'RL_WRITE',
  validateBody: mocks.validateBodyMock,
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-123',
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/notifications/create', () => ({
  createNotification: mocks.createNotificationMock,
}))

vi.mock('@/lib/compiled-plans', () => ({
  buildRevisionSteps: mocks.buildRevisionStepsMock,
  calculateCoverageScore: mocks.calculateCoverageScoreMock,
  getCompiledPlanRecord: mocks.getCompiledPlanRecordMock,
  persistCompiledPlanSnapshot: mocks.persistCompiledPlanSnapshotMock,
}))

vi.mock('@/lib/planner/goal-first', () => ({
  computePlanSeed: mocks.computePlanSeedMock,
}))

vi.mock('@/lib/telemetry', () => ({
  emitTelemetryEvent: mocks.emitTelemetryEventMock,
}))

type QueryLog = {
  kind: 'await' | 'maybeSingle'
  select: string
  filters: Record<string, unknown>
}

function createCompiledPlansBuilder(queryLog: QueryLog[]) {
  const state = {
    select: '',
    filters: {} as Record<string, unknown>,
  }
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn().mockImplementation((columns: string) => {
    state.select = columns
    return builder
  })
  builder.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
    state.filters[column] = value
    return builder
  })
  builder.maybeSingle = vi.fn().mockImplementation(async () => {
    queryLog.push({
      kind: 'maybeSingle',
      select: state.select,
      filters: { ...state.filters },
    })

    return {
      data: { parent_plan_id: null },
      error: null,
    }
  })
  builder.then = (
    resolve: (value: { data: Array<{ plan_id: string }>; error: null }) => void,
    reject?: (reason: unknown) => void,
  ) => {
    try {
      queryLog.push({
        kind: 'await',
        select: state.select,
        filters: { ...state.filters },
      })

      if (state.select === 'plan_id' && state.filters.status === 'active') {
        resolve({ data: [{ plan_id: 'plan-active' }], error: null })
        return
      }

      resolve({ data: [], error: null })
    } catch (error) {
      reject?.(error)
    }
  }

  return builder
}

const { POST } = await import('./route')

describe('POST /api/planner/plan-revision', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.buildRevisionStepsMock.mockReturnValue([
      { taskId: 'task-1', title: 'Revised task' },
    ])
    mocks.calculateCoverageScoreMock.mockReturnValue(100)
    mocks.computePlanSeedMock.mockReturnValue('seed-revised-plan')
    mocks.getCompiledPlanRecordMock.mockResolvedValue({
      planId: 'plan-archived',
      goal: '旧プラン',
      status: 'archived',
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-new',
      parentPlanId: 'plan-archived',
    })
    mocks.emitTelemetryEventMock.mockResolvedValue(undefined)
  })

  it('supersedes the current active compiled plan even when revising an archived plan', async () => {
    const queryLog: QueryLog[] = []

    mocks.validateBodyMock.mockResolvedValue({
      data: {
        planId: 'plan-archived',
        goal: '更新したゴール',
        title: '改訂プラン',
        revisedSteps: [{ title: 'Revised task' }],
        revisionRationale: '進め方を見直したい',
        revisionSummary: '最新の進め方に調整',
      },
    })
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
      from: vi.fn((table: string) => {
        expect(table).toBe('compiled_plans')
        return createCompiledPlansBuilder(queryLog)
      }),
    })

    const response = await POST(
      new Request('http://localhost:3000/api/planner/plan-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'plan-archived',
          goal: '更新したゴール',
          title: '改訂プラン',
          revisedSteps: [{ title: 'Revised task' }],
          revisionRationale: '進め方を見直したい',
          revisionSummary: '最新の進め方に調整',
        }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        parentPlanId: 'plan-archived',
        supersedePlanIds: ['plan-active'],
      }),
    )
    expect(queryLog).toContainEqual({
      kind: 'await',
      select: 'plan_id',
      filters: {
        user_id: 'user-123',
        status: 'active',
      },
    })
    expect(json).toMatchObject({
      data: {
        newPlanId: 'plan-new',
        parentPlanId: 'plan-archived',
      },
    })
  })
})
