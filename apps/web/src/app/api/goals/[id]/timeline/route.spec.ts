import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  listProgressTimelineForGoalMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_READ: 'RL_READ',
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-goal-timeline',
  jsonResponse: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/goals/progress-timeline', () => ({
  listProgressTimelineForGoal: mocks.listProgressTimelineForGoalMock,
}))

const { GET } = await import('./route')

describe('GET /api/goals/[id]/timeline', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockReset()
    mocks.createClientMock.mockReset()
    mocks.listProgressTimelineForGoalMock.mockReset()
    mocks.applyRateLimitMock.mockResolvedValue(null)
  })

  it('returns 400 when limit is outside the supported range', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/timeline?limit=99'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      error: 'invalid_limit',
    })
    expect(mocks.createClientMock).not.toHaveBeenCalled()
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/timeline'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toMatchObject({
      error: 'unauthorized',
    })
    expect(mocks.listProgressTimelineForGoalMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the goal does not exist', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.listProgressTimelineForGoalMock.mockResolvedValue({
      kind: 'not_found',
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/timeline?limit=25'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json).toMatchObject({
      error: 'not_found',
    })
    expect(mocks.listProgressTimelineForGoalMock).toHaveBeenCalledWith(
      'user-1',
      '15915915-9159-4159-8159-159159159159',
      { limit: 25 },
    )
  })

  it('returns 403 when the goal belongs to another user', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.listProgressTimelineForGoalMock.mockResolvedValue({
      kind: 'forbidden',
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/timeline'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toMatchObject({
      error: 'forbidden',
    })
  })

  it('returns the validated timeline payload', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.listProgressTimelineForGoalMock.mockResolvedValue({
      kind: 'ok',
      data: [
        {
          id: 'task_progress:tp-1',
          type: 'task_progress',
          actor: 'user',
          icon: '👤',
          label: 'Task completed',
          description: 'UI セクションを揃える',
          occurred_at: '2026-04-18T03:00:00.000Z',
        },
      ],
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/timeline'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json).toEqual([
      {
        id: 'task_progress:tp-1',
        type: 'task_progress',
        actor: 'user',
        icon: '👤',
        label: 'Task completed',
        description: 'UI セクションを揃える',
        occurred_at: '2026-04-18T03:00:00.000Z',
      },
    ])
  })
})
