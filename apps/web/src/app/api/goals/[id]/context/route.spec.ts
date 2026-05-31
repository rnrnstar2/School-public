import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  fetchGoalContextForUserMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_READ: 'RL_READ',
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-goal-context',
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

vi.mock('@/lib/goals/goal-context', () => ({
  fetchGoalContextForUser: mocks.fetchGoalContextForUserMock,
}))

const { GET } = await import('./route')

describe('GET /api/goals/[id]/context', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockReset()
    mocks.createClientMock.mockReset()
    mocks.fetchGoalContextForUserMock.mockReset()
    mocks.applyRateLimitMock.mockResolvedValue(null)
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
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/context'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toMatchObject({
      error: 'unauthorized',
    })
    expect(mocks.fetchGoalContextForUserMock).not.toHaveBeenCalled()
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
    mocks.fetchGoalContextForUserMock.mockResolvedValue({
      kind: 'not_found',
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/context'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json).toMatchObject({
      error: 'not_found',
    })
    expect(mocks.fetchGoalContextForUserMock).toHaveBeenCalledWith(
      'user-1',
      '15915915-9159-4159-8159-159159159159',
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
    mocks.fetchGoalContextForUserMock.mockResolvedValue({
      kind: 'forbidden',
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/context'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toMatchObject({
      error: 'forbidden',
    })
  })

  it('returns the aggregated goal context payload', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.fetchGoalContextForUserMock.mockResolvedValue({
      kind: 'ok',
      data: {
        goal: {
          id: 'goal-1',
          title: '公開する',
          description: null,
          status: 'active',
          deadline: null,
          created_at: '2026-04-18T00:00:00.000Z',
        },
        nodes: [
          {
            id: 'node-1',
            label: '理由を決める',
            owner_type: 'user',
            status: 'in_progress',
            next_action_preview: null,
          },
        ],
        profile: null,
        state: {
          capabilities: ['Node.js 環境あり'],
          assessments_top5: [],
          blockers: ['deploy'],
          deadline_text: null,
          target_outcome: '公開する',
          skill_level: 'beginner',
        },
        mentor_memories: [],
        goal_contexts: [],
        recent_chat_updates: [],
        artifacts: [],
        decisions: [],
        next_action: null,
      },
    })

    const response = await GET(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/context'),
      { params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json).toEqual({
      goal: {
        id: 'goal-1',
        title: '公開する',
        description: null,
        status: 'active',
        deadline: null,
        created_at: '2026-04-18T00:00:00.000Z',
      },
      nodes: [
        {
          id: 'node-1',
          label: '理由を決める',
          owner_type: 'user',
          status: 'in_progress',
          next_action_preview: null,
        },
      ],
      profile: null,
      state: {
        capabilities: ['Node.js 環境あり'],
        assessments_top5: [],
        blockers: ['deploy'],
        deadline_text: null,
        target_outcome: '公開する',
        skill_level: 'beginner',
      },
      mentor_memories: [],
      goal_contexts: [],
      recent_chat_updates: [],
      artifacts: [],
      decisions: [],
      next_action: null,
    })
  })
})
