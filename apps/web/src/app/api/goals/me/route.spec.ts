import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  listGoalsWithNodesForUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/supabase/decision-ledger', () => ({
  listGoalsWithNodesForUser: mocks.listGoalsWithNodesForUserMock,
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-goals-me',
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

const { GET } = await import('./route')

describe('GET /api/goals/me', () => {
  beforeEach(() => {
    mocks.createClientMock.mockReset()
    mocks.listGoalsWithNodesForUserMock.mockReset()
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

    const response = await GET(new Request('http://localhost:3000/api/goals/me'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toMatchObject({
      error: 'unauthorized',
    })
    expect(mocks.listGoalsWithNodesForUserMock).not.toHaveBeenCalled()
  })

  it('returns the authenticated user goal tree payload', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        }),
      },
    })
    mocks.listGoalsWithNodesForUserMock.mockResolvedValue({
      data: [
        {
          id: 'goal-1',
          title: 'Goal tree',
          status: 'active',
          created_at: '2026-04-18T00:00:00.000Z',
          deadline: null,
          nodes: [
            {
              id: 'node-1',
              parent_node_id: null,
              label: 'Objective',
              node_type: 'objective',
              status: 'in_progress',
              sort_order: 0,
              owner_type: 'ai',
              depends_on_node_ids: ['node-2'],
              fallback_node_id: 'node-3',
              selected_lesson: {
                lesson_id: 'atom.goal-tree.fixture',
                score: 0.91,
                rationale: 'fit',
              },
            },
          ],
        },
      ],
      error: null,
    })

    const response = await GET(new Request('http://localhost:3000/api/goals/me'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      goals: [
        {
          id: 'goal-1',
          title: 'Goal tree',
          status: 'active',
          created_at: '2026-04-18T00:00:00.000Z',
          deadline: null,
          nodes: [
            {
              id: 'node-1',
              parent_node_id: null,
              label: 'Objective',
              node_type: 'objective',
              status: 'in_progress',
              sort_order: 0,
              owner_type: 'ai',
              depends_on_node_ids: ['node-2'],
              fallback_node_id: 'node-3',
              selected_lesson: {
                lesson_id: 'atom.goal-tree.fixture',
                score: 0.91,
                rationale: 'fit',
              },
            },
          ],
        },
      ],
    })
    expect(mocks.listGoalsWithNodesForUserMock).toHaveBeenCalledWith('user-123')
  })

  it('returns an empty array when the user has no goals', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-empty' } },
          error: null,
        }),
      },
    })
    mocks.listGoalsWithNodesForUserMock.mockResolvedValue({
      data: [],
      error: null,
    })

    const response = await GET(new Request('http://localhost:3000/api/goals/me'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ goals: [] })
    expect(mocks.listGoalsWithNodesForUserMock).toHaveBeenCalledWith('user-empty')
  })

  it('returns a generic 500 response when goal loading fails', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-500' } },
          error: null,
        }),
      },
    })
    mocks.listGoalsWithNodesForUserMock.mockResolvedValue({
      data: null,
      error: 'database connection refused',
    })

    const response = await GET(new Request('http://localhost:3000/api/goals/me'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({
      error: 'internal_error',
      message: 'ゴールツリーの読み込みに失敗しました',
    })
    expect(JSON.stringify(json)).not.toContain('database connection refused')
  })
})
