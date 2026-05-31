import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  requireAdminRouteUserMock: vi.fn(),
  probeZaiHearingHealthMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/guard')>('@/lib/api/guard')
  return {
    ...actual,
    applyRateLimit: mocks.applyRateLimitMock,
  }
})

vi.mock('@/app/api/admin/atom-versions/_server', () => ({
  requireAdminRouteUser: mocks.requireAdminRouteUserMock,
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-zai-health',
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/planner/live-hearing-service', () => ({
  probeZaiHearingHealth: mocks.probeZaiHearingHealthMock,
}))

const { GET } = await import('./route')

describe('GET /api/debug/zai-health', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.requireAdminRouteUserMock.mockResolvedValue({ id: 'owner-1' })
    mocks.probeZaiHearingHealthMock.mockResolvedValue({
      ok: true,
      available: true,
      status: 200,
      latencyMs: 123,
      bodySnippet: '{"ok":true}',
      model: 'glm-5.1',
      responseFormat: 'json_object',
      stream: false,
      parsed: true,
      zaiRequestId: 'zai-req-123',
      error: null,
    })
  })

  it('returns app and upstream request ids for correlation', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/debug/zai-health?response_format=json_object'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      requestId: 'req-zai-health',
      zaiRequestId: 'zai-req-123',
      responseFormat: 'json_object',
      stream: false,
      parsed: true,
    })
  })
})
