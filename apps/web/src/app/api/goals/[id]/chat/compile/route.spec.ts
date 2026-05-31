import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  compileGoalChatOutputMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_WRITE: 'RL_WRITE',
  validateBody: async (request: Request, schema: { parse: (body: unknown) => unknown }) => {
    try {
      return {
        data: schema.parse(await request.json()),
      }
    } catch {
      return {
        error: new Response(JSON.stringify({ error: 'validation_error' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      }
    }
  },
}))

vi.mock('@/lib/api/response', () => ({
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

vi.mock('@/lib/goals/speak2action', () => ({
  compileGoalChatOutput: mocks.compileGoalChatOutputMock,
}))

const { POST } = await import('./route')

describe('POST /api/goals/[id]/chat/compile', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockReset()
    mocks.createClientMock.mockReset()
    mocks.compileGoalChatOutputMock.mockReset()
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

    const response = await POST(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/chat/compile', {
        method: 'POST',
        body: JSON.stringify({
          structuredOutput: {
            reply: 'reply',
            decisions: [],
            open_questions: [],
            next_question: null,
            next_action: null,
          },
        }),
      }),
      {
        params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }),
      },
    )

    expect(response.status).toBe(401)
    expect(mocks.compileGoalChatOutputMock).not.toHaveBeenCalled()
  })

  it('returns compile results with no-store headers', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.compileGoalChatOutputMock.mockResolvedValue({
      kind: 'ok',
      ok: false,
      inserted: {
        decisions: 0,
        openQuestions: 0,
        taskNodeId: 'task-1',
      },
      error: ['decision "x": fail'],
    })

    const response = await POST(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/chat/compile', {
        method: 'POST',
        body: JSON.stringify({
          structuredOutput: {
            reply: 'reply',
            decisions: ['x'],
            open_questions: [],
            next_question: null,
            next_action: 'task',
          },
          chatContext: {
            nodeId: '26926926-9269-4269-8269-269269269269',
            source: 'lesson_chat:/lessons/atom.goal-tree.fixture',
          },
        }),
      }),
      {
        params: Promise.resolve({ id: '15915915-9159-4159-8159-159159159159' }),
      },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json).toEqual({
      ok: false,
      inserted: {
        decisions: 0,
        openQuestions: 0,
        taskNodeId: 'task-1',
      },
      error: ['decision "x": fail'],
    })
    expect(mocks.compileGoalChatOutputMock).toHaveBeenCalledWith({
      goalId: '15915915-9159-4159-8159-159159159159',
      userId: 'user-1',
      structuredOutput: {
        reply: 'reply',
        phase: 'coaching',
        actions: [],
        decisions: ['x'],
        open_questions: [],
        next_question: null,
        next_action: 'task',
      },
      chatContext: {
        nodeId: '26926926-9269-4269-8269-269269269269',
        source: 'lesson_chat:/lessons/atom.goal-tree.fixture',
      },
    })
  })
})
