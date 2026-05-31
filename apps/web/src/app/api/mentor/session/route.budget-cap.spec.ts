/**
 * W59 (Audit A3 W12-NEW-1): /api/mentor/session × budget cap install.
 *
 * 検証範囲:
 * - `MENTOR_CONDUCTOR_ENABLED=1` 経路で Conductor.run() を呼ぶときに、
 *   route handler が `budgetCap` フィールドを構築して渡している。
 * - service-role client が利用不可 (env 未設定) の場合は `budgetCap` 未指定
 *   で fallback (= legacy 互換 / no-op enforcement) する。
 * - 構築した `budgetCap.loadUserRuns` は当月分のみを返す (metadata->>user_id
 *   filter + started_at >= UTC month start) ことを Mock Supabase で確認する。
 *
 * 設計メモ:
 * - SSE end-to-end ではなく Conductor を mock して input を capture する
 *   integration trace に絞る。Phase 1 ZAI helper の実発火は別 .spec で確認
 *   済み (phase1-zai-helper.budget-cap.spec.ts)。本 spec は **route → Conductor**
 *   までの配線のみ責任を持つ。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  validateBodyMock: vi.fn(),
  createClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  getExternalPlannerConfigMock: vi.fn(),
  createEmptyMentorSessionMock: vi.fn(),
  getMentorSessionByGoalMock: vi.fn(),
  getMentorSessionByIdMock: vi.fn(),
  upsertMentorSessionMock: vi.fn(),
  resetMentorSessionMock: vi.fn(),
  advanceHearingSessionStreamMock: vi.fn(),
  conductorRunMock: vi.fn(),
  // mentorConductorEnabled flag の override
  mentorConductorEnabledMock: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/api/guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/guard')>(
    '@/lib/api/guard',
  )
  return {
    ...actual,
    applyRateLimit: mocks.applyRateLimitMock,
    validateBody: mocks.validateBodyMock,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
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
  getRequestId: () => 'req-budget-cap',
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

vi.mock('@/lib/env', () => ({
  serverEnv: {
    get mentorConductorEnabled() {
      return mocks.mentorConductorEnabledMock()
    },
  },
}))

// Conductor を mock して input を capture。out は legacy compat な空 result。
vi.mock('@/lib/mentor/conductor', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mentor/conductor')>(
    '@/lib/mentor/conductor',
  )
  return {
    ...actual,
    Conductor: class {
      async run(input: unknown) {
        return mocks.conductorRunMock(input)
      }
    },
  }
})

const { POST } = await import('./route')

describe('POST /api/mentor/session × budget cap install (W59)', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        ;(mock as ReturnType<typeof vi.fn>).mockReset()
      }
    }

    mocks.mentorConductorEnabledMock.mockReturnValue(true)
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'AIで業務自動化したい',
        message: null,
        sessionId: null,
        uiContext: { surface: 'onboarding' },
      },
    })
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-w59' } },
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
      goal: 'AIで業務自動化したい',
      canonicalGoalKey: 'aiで業務自動化したい',
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

    // Conductor mock: hearing delegate を 1 回呼んで早期離脱した想定の output。
    mocks.conductorRunMock.mockImplementation(async (input: unknown) => {
      const typed = input as {
        delegates: {
          hearing: (ctx: unknown) => Promise<unknown>
        }
        requestId?: string | null
        userId: string
        goal: string
      }
      // hearing delegate を呼ばないと captured が null のまま runHearingTurn が
      // throw してしまう。delegate を 1 回だけ起動する。
      await typed.delegates.hearing({
        state: 'HEARING',
        role: 'goal_tree',
        model: { provider: 'zai', model: 'glm-5.1' },
        requestId: typed.requestId ?? null,
        userId: typed.userId,
        goal: typed.goal,
        log: [],
      })
      return {
        finalState: 'HEARING',
        log: [],
        hearing: { completed: false, payload: null },
        earlyExitOnHearing: true,
        scoping: null,
        investigate: null,
        synth: null,
        review: null,
        commit: null,
      }
    })

    mocks.advanceHearingSessionStreamMock.mockResolvedValue({
      session: {
        answers: {},
        insights: {},
        messages: [],
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
      completed: false,
      structuredOutput: null,
    })
    mocks.upsertMentorSessionMock.mockImplementation(
      async (_client: unknown, _userId: string, session: unknown) => ({
        ...(session as Record<string, unknown>),
        id: 'mentor-session-1',
      }),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function buildLedgerStub(captures: { lastUserId?: string; lastSinceIso?: string }) {
    return {
      schema: (_name: string) => ({
        from: (_table: string) => ({
          select: (_cols: string) => ({
            eq: (_col: string, val: string) => {
              captures.lastUserId = val
              return {
                gte: (_dateCol: string, since: string) => {
                  captures.lastSinceIso = since
                  return {
                    order: (_orderCol: string, _opts: { ascending: boolean }) => ({
                      limit: async (_n: number) => ({
                        data: [
                          {
                            id: 'run-1',
                            agent_type: 'phase1_zai',
                            run_status: 'success',
                            started_at: new Date().toISOString(),
                            finished_at: new Date().toISOString(),
                            metadata: {
                              user_id: 'user-w59',
                              cost_usd: 0.12,
                              model: 'zai:glm-5.1',
                            },
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }
                },
              }
            },
          }),
        }),
      }),
    }
  }

  it('passes budgetCap to Conductor.run when service client is available', async () => {
    const captures: { lastUserId?: string; lastSinceIso?: string } = {}
    mocks.createServiceClientMock.mockReturnValue(buildLedgerStub(captures))

    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIで業務自動化したい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    expect(response.status).toBe(200)
    await response.text()

    expect(mocks.conductorRunMock).toHaveBeenCalledTimes(1)
    const conductorInput = mocks.conductorRunMock.mock.calls[0]?.[0]
    expect(conductorInput?.budgetCap).toBeDefined()
    expect(conductorInput?.budgetCap?.userId).toBe('user-w59')
    expect(typeof conductorInput?.budgetCap?.loadUserRuns).toBe('function')

    // loadUserRuns を実際に呼んで filter / range を確認
    const runs = await conductorInput?.budgetCap?.loadUserRuns()
    expect(runs).toHaveLength(1)
    expect(captures.lastUserId).toBe('user-w59')
    // monthStart は UTC 月初
    const sinceDate = new Date(captures.lastSinceIso ?? '')
    expect(sinceDate.getUTCDate()).toBe(1)
    expect(sinceDate.getUTCHours()).toBe(0)
    expect(sinceDate.getUTCMinutes()).toBe(0)
  })

  it('omits budgetCap when service client is unavailable (graceful)', async () => {
    mocks.createServiceClientMock.mockReturnValue(null)

    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIで業務自動化したい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    expect(response.status).toBe(200)
    await response.text()

    expect(mocks.conductorRunMock).toHaveBeenCalledTimes(1)
    const conductorInput = mocks.conductorRunMock.mock.calls[0]?.[0]
    // service unavailable のときは undefined / 未設定 (legacy 互換)
    expect(conductorInput?.budgetCap).toBeUndefined()
  })
})
