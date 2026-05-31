import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  createAiDelegationBriefMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_AI: 'RL_AI',
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
  getRequestId: () => 'req-delegate',
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

vi.mock('@/lib/goals/ai-delegation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/goals/ai-delegation')>(
    '@/lib/goals/ai-delegation',
  )

  return {
    ...actual,
    createAiDelegationBrief: mocks.createAiDelegationBriefMock,
  }
})

const { POST } = await import('./route')

describe('POST /api/goals/[id]/nodes/[nodeId]/delegate', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockReset()
    mocks.createClientMock.mockReset()
    mocks.createAiDelegationBriefMock.mockReset()
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
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/nodes/26926926-9269-4269-8269-269269269269/delegate', {
        method: 'POST',
        body: JSON.stringify({ delegateKind: 'prompt' }),
      }),
      {
        params: Promise.resolve({
          id: '15915915-9159-4159-8159-159159159159',
          nodeId: '26926926-9269-4269-8269-269269269269',
        }),
      },
    )

    expect(response.status).toBe(401)
    expect(mocks.createAiDelegationBriefMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the node owner_type is not ai/both', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.createAiDelegationBriefMock.mockResolvedValue({
      kind: 'invalid_owner_type',
      ownerType: 'user',
    })

    const response = await POST(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/nodes/26926926-9269-4269-8269-269269269269/delegate', {
        method: 'POST',
        body: JSON.stringify({ delegateKind: 'prompt' }),
      }),
      {
        params: Promise.resolve({
          id: '15915915-9159-4159-8159-159159159159',
          nodeId: '26926926-9269-4269-8269-269269269269',
        }),
      },
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      error: 'invalid_owner_type',
      ownerType: 'user',
    })
  })

  it('accepts agent brief kinds and returns the generated payload on success', async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.createAiDelegationBriefMock.mockResolvedValue({
      kind: 'ok',
      brief: '[Codex CLI Brief] brief body',
      contextId: 'context-1',
    })

    const response = await POST(
      new Request('http://localhost:3000/api/goals/15915915-9159-4159-8159-159159159159/nodes/26926926-9269-4269-8269-269269269269/delegate', {
        method: 'POST',
        headers: {
          'x-ai-delegation-mode': 'mock',
        },
        body: JSON.stringify({ delegateKind: 'codex_cli_brief' }),
      }),
      {
        params: Promise.resolve({
          id: '15915915-9159-4159-8159-159159159159',
          nodeId: '26926926-9269-4269-8269-269269269269',
        }),
      },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json).toEqual({
      ok: true,
      brief: '[Codex CLI Brief] brief body',
      contextId: 'context-1',
    })
    expect(mocks.createAiDelegationBriefMock).toHaveBeenCalledWith({
      userId: 'user-1',
      goalId: '15915915-9159-4159-8159-159159159159',
      nodeId: '26926926-9269-4269-8269-269269269269',
      delegateKind: 'codex_cli_brief',
      mode: 'mock',
      requestId: 'req-delegate',
    })
  })
})
