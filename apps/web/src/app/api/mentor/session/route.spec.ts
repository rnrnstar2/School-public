import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  validateBodyMock: vi.fn(),
  createClientMock: vi.fn(),
  getExternalPlannerConfigMock: vi.fn(),
  createEmptyMentorSessionMock: vi.fn(),
  getMentorSessionByGoalMock: vi.fn(),
  getMentorSessionByIdMock: vi.fn(),
  upsertMentorSessionMock: vi.fn(),
  resetMentorSessionMock: vi.fn(),
  advanceHearingSessionStreamMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/guard')>('@/lib/api/guard')
  return {
    ...actual,
    applyRateLimit: mocks.applyRateLimitMock,
    validateBody: mocks.validateBodyMock,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/planner/zai', () => ({
  getExternalPlannerConfig: mocks.getExternalPlannerConfigMock,
}))

vi.mock('@/lib/supabase/mentor-sessions', () => ({
  createEmptyMentorSession: mocks.createEmptyMentorSessionMock,
  getMentorSessionByGoal: mocks.getMentorSessionByGoalMock,
  getMentorSessionById: mocks.getMentorSessionByIdMock,
  upsertMentorSession: mocks.upsertMentorSessionMock,
  resetMentorSession: mocks.resetMentorSessionMock,
}))

vi.mock('@/lib/planner/live-hearing-service', () => ({
  advanceHearingSessionStream: mocks.advanceHearingSessionStreamMock,
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-mentor-session',
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  sseResponse: (stream: ReadableStream<Uint8Array>) =>
    new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
}))

const { POST } = await import('./route')

describe('POST /api/mentor/session', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'AIでポートフォリオやホームページを作りたい',
        message: null,
        sessionId: null,
        uiContext: { surface: 'onboarding' },
      },
    })
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
        }),
      },
    })
    mocks.getExternalPlannerConfigMock.mockReturnValue({
      available: true,
      endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
      apiKey: 'test-key',
      model: 'glm-5.1',
    })
    mocks.getMentorSessionByIdMock.mockResolvedValue(null)
    mocks.getMentorSessionByGoalMock.mockResolvedValue(null)
    mocks.createEmptyMentorSessionMock.mockReturnValue({
      id: null,
      goal: 'AIでポートフォリオやホームページを作りたい',
      canonicalGoalKey: 'aiでポートフォリオやホームページを作りたい',
      messages: [],
      historySummary: null,
      phase: 'discovering',
      answers: {},
      insights: {},
      lastQuestionId: null,
      transport: {
        status: 'live',
        label: 'AIメンター',
        message: 'Unified mentor session',
      },
      completedAt: null,
      summaryKeyPoints: [],
      personaIds: [],
      activePlanId: null,
      currentLessonId: null,
      createdAt: null,
      updatedAt: null,
    })
    mocks.advanceHearingSessionStreamMock.mockResolvedValue({
      session: {
        answers: {},
        insights: {},
        messages: [
          { id: 'goal', role: 'user', content: '目標: AIでポートフォリオやホームページを作りたい' },
          { id: 'assistant-1', role: 'assistant', content: '必要な前提が揃いました。ここまでの内容でプランを作成します。' },
        ],
        lastQuestionId: null,
        transport: {
          status: 'live',
          label: 'ZAI coding plan',
          message: 'live',
          model: 'glm-5.1',
        },
        completedAt: null,
        summaryKeyPoints: [],
        personaIds: [],
      },
      completed: true,
      structuredOutput: {
        reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
        phase: 'coaching',
        actions: [],
        decisions: [],
        open_questions: [],
        next_question: null,
        next_action: 'ヒアリング内容を確認してプランを作成する',
      },
    })
    mocks.upsertMentorSessionMock.mockImplementation(async (_client, _userId, session) => ({
      ...session,
      id: 'mentor-session-1',
    }))
  })

  it('passes null currentSession to hearing engine for a brand-new onboarding session', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオやホームページを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )

    expect(response.status).toBe(200)
    await response.text()
    expect(mocks.advanceHearingSessionStreamMock).toHaveBeenCalledWith(
      'AIでポートフォリオやホームページを作りたい',
      null,
      null,
      expect.any(Function),
      null,
      { allowFallback: false, appRequestId: 'req-mentor-session' },
    )
  })

  it('emits a diagnostic event with the app request id before hearing tokens', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオやホームページを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )

    const body = await response.text()

    expect(body).toContain('event: diagnostic')
    expect(body).toContain('"requestId":"req-mentor-session"')
    expect(body).toContain('"surface":"onboarding"')
    expect(body).toContain('"transport":"live-hearing"')
  })
})
