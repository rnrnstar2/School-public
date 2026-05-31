import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_READ: 'RL_READ',
}))

vi.mock('@/lib/api/response', () => ({
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

type TelemetryRow = {
  event_name: string
  plan_id: string | null
  occurred_at: string
  user_id: string
}

type CompiledPlanRow = {
  plan_id: string
  user_id: string
  persona_id: string | null
}

function createResolvedBuilder<T extends Record<string, unknown>>(rows: T[]) {
  const filters: Record<string, unknown> = {}
  let inFilterField: string | null = null
  let inFilterValues: unknown[] | null = null

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockImplementation((field: string, value: unknown) => {
    filters[field] = value
    return builder
  })
  builder.gte = vi.fn().mockImplementation((field: string, value: unknown) => {
    filters[`gte:${field}`] = value
    return builder
  })
  builder.lte = vi.fn().mockImplementation((field: string, value: unknown) => {
    filters[`lte:${field}`] = value
    return builder
  })
  builder.order = vi.fn().mockReturnValue(builder)
  builder.in = vi.fn().mockImplementation((field: string, values: unknown[]) => {
    inFilterField = field
    inFilterValues = values
    return builder
  })
  builder.then = (
    resolve: (value: { data: T[]; error: null }) => void,
    reject?: (reason: unknown) => void,
  ) => {
    try {
      const result = rows.filter((row) => {
        for (const [field, value] of Object.entries(filters)) {
          if (field.startsWith('gte:')) {
            const actualField = field.replace('gte:', '')
            if (String(row[actualField]) < String(value)) return false
            continue
          }

          if (field.startsWith('lte:')) {
            const actualField = field.replace('lte:', '')
            if (String(row[actualField]) > String(value)) return false
            continue
          }

          if (row[field] !== value) return false
        }

        if (inFilterField && inFilterValues) {
          return inFilterValues.includes(row[inFilterField])
        }

        return true
      })

      resolve({ data: result, error: null })
    } catch (error) {
      reject?.(error)
    }
  }

  return builder
}

describe('GET /api/analytics/funnel', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockReset()
  })

  it('returns the 8-stage funnel in the agreed order', async () => {
    const telemetryRows: TelemetryRow[] = [
      { event_name: 'lesson_started', plan_id: 'plan-a', occurred_at: '2026-04-01T00:00:00.000Z', user_id: 'user-123' },
      { event_name: 'lesson_completed', plan_id: 'plan-a', occurred_at: '2026-04-01T01:00:00.000Z', user_id: 'user-123' },
      { event_name: 'stuck_reported', plan_id: 'plan-a', occurred_at: '2026-04-01T02:00:00.000Z', user_id: 'user-123' },
      { event_name: 'artifact_submitted', plan_id: 'plan-a', occurred_at: '2026-04-01T03:00:00.000Z', user_id: 'user-123' },
      { event_name: 'evidence_passed', plan_id: 'plan-a', occurred_at: '2026-04-01T04:00:00.000Z', user_id: 'user-123' },
      { event_name: 'plan_revised', plan_id: 'plan-a', occurred_at: '2026-04-01T05:00:00.000Z', user_id: 'user-123' },
      { event_name: 'lesson_skipped', plan_id: 'plan-a', occurred_at: '2026-04-01T06:00:00.000Z', user_id: 'user-123' },
      { event_name: 'unsupported_goal_detected', plan_id: 'plan-a', occurred_at: '2026-04-01T07:00:00.000Z', user_id: 'user-123' },
    ]

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'telemetry_events') {
          return createResolvedBuilder(telemetryRows)
        }

        if (table === 'compiled_plans') {
          return createResolvedBuilder<CompiledPlanRow>([])
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { GET } = await import('./route')
    const response = await GET(
      new Request('http://localhost:3000/api/analytics/funnel?from=2026-04-01T00:00:00.000Z&to=2026-04-02T00:00:00.000Z'),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.stages.map((stage: { key: string }) => stage.key)).toEqual([
      'lesson_started',
      'lesson_completed',
      'stuck_reported',
      'artifact_submitted',
      'evidence_passed',
      'plan_revised',
      'lesson_skipped',
      'unsupported_goal_detected',
    ])
    expect(json.stages[0].count).toBe(1)
    expect(json.stages[7].count).toBe(1)
  })

  it('filters funnel counts by personaId through compiled_plans', async () => {
    const telemetryRows: TelemetryRow[] = [
      { event_name: 'lesson_started', plan_id: 'plan-a', occurred_at: '2026-04-01T00:00:00.000Z', user_id: 'user-123' },
      { event_name: 'lesson_started', plan_id: 'plan-b', occurred_at: '2026-04-01T00:30:00.000Z', user_id: 'user-123' },
      { event_name: 'lesson_completed', plan_id: 'plan-a', occurred_at: '2026-04-01T01:00:00.000Z', user_id: 'user-123' },
      { event_name: 'artifact_submitted', plan_id: 'plan-b', occurred_at: '2026-04-01T02:00:00.000Z', user_id: 'user-123' },
    ]
    const compiledPlanRows: CompiledPlanRow[] = [
      { plan_id: 'plan-a', user_id: 'user-123', persona_id: 'persona-web' },
      { plan_id: 'plan-b', user_id: 'user-123', persona_id: 'persona-mobile' },
    ]

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'telemetry_events') {
          return createResolvedBuilder(telemetryRows)
        }

        if (table === 'compiled_plans') {
          return createResolvedBuilder(compiledPlanRows)
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { GET } = await import('./route')
    const response = await GET(
      new Request('http://localhost:3000/api/analytics/funnel?personaId=persona-web&from=2026-04-01T00:00:00.000Z&to=2026-04-02T00:00:00.000Z'),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.filters.persona_id).toBe('persona-web')
    expect(json.stages.find((stage: { key: string }) => stage.key === 'lesson_started')?.count).toBe(1)
    expect(json.stages.find((stage: { key: string }) => stage.key === 'artifact_submitted')?.count).toBe(0)
  })
})
