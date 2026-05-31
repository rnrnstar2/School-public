import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  validateBodyMock: vi.fn(),
  createClientMock: vi.fn(),
  classifyGoalDomainsMock: vi.fn(),
  normalizeGoalMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_READ: 'RL_READ',
  RL_WRITE: 'RL_WRITE',
  validateBody: mocks.validateBodyMock,
}))

vi.mock('@/lib/api/response', () => ({
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/planner/goal-first', () => ({
  classifyGoalDomains: mocks.classifyGoalDomainsMock,
  normalizeGoal: mocks.normalizeGoalMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

function buildValidatedBody(goal = 'ポートフォリオサイトを公開したい') {
  return {
    goal,
    tools: ['claude-code'],
    os: 'Mac',
    cliFamiliarity: 'basic',
    programmingExperience: '少し触ったことがある',
    aiExperience: 'Claude Code を使ったことがある',
    audience: '',
    deadline: '',
    learningStyle: null,
  }
}

function createMockClient(options?: {
  archiveErrorMessage?: string
  existingSignals?: Record<string, unknown> | null
}) {
  const archiveResult = Promise.resolve({
    error: options?.archiveErrorMessage ? { message: options.archiveErrorMessage } : null,
  })
  const archiveBuilder = {
    update: vi.fn(() => archiveBuilder),
    eq: vi.fn()
      .mockImplementationOnce(() => archiveBuilder)
      .mockImplementationOnce(() => archiveResult),
  }
  const insertBuilder = {
    insert: vi.fn(() => insertBuilder),
    select: vi.fn(() => insertBuilder),
    single: vi.fn().mockResolvedValue({ data: { id: 'goal-123' } }),
  }
  const domainsBuilder = {
    select: vi.fn(() => domainsBuilder),
    order: vi.fn().mockResolvedValue({ data: [] }),
  }
  const learnerStateBuilder: {
    upsert: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
  } = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn(() => learnerStateBuilder),
    eq: vi.fn(() => learnerStateBuilder),
    maybeSingle: vi.fn().mockResolvedValue({
      data:
        options?.existingSignals === undefined
          ? null
          : { signals: options.existingSignals },
    }),
  }
  const learnerProfileBuilder = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  let goalsCallCount = 0

  return {
    archiveBuilder,
    insertBuilder,
    learnerStateBuilder,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'domains') {
          return domainsBuilder
        }

        if (table === 'goals') {
          goalsCallCount += 1
          return goalsCallCount === 1 ? archiveBuilder : insertBuilder
        }

        if (table === 'learner_state') {
          return learnerStateBuilder
        }

        if (table === 'learner_profile') {
          return learnerProfileBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    },
  }
}

describe('POST /api/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({ data: buildValidatedBody() })
    mocks.normalizeGoalMock.mockReturnValue({
      language: 'ja',
      implied_domains: [],
      tool_mentions: ['claude-code'],
    })
    mocks.classifyGoalDomainsMock.mockReturnValue({
      primary: 'web-builder-ai',
      domains: [],
    })
  })

  it('archives active goals before inserting a new active goal', async () => {
    const { archiveBuilder, client, insertBuilder } = createMockClient()
    mocks.createClientMock.mockResolvedValue(client)

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'ポートフォリオサイトを公開したい' }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.data).toMatchObject({
      id: 'goal-123',
      goal: 'ポートフォリオサイトを公開したい',
      saved: true,
    })
    expect(archiveBuilder.update).toHaveBeenCalledWith({ status: 'abandoned' })
    expect(archiveBuilder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-123')
    expect(archiveBuilder.eq).toHaveBeenNthCalledWith(2, 'status', 'active')
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        outcome: 'ポートフォリオサイトを公開したい',
        status: 'active',
      }),
    )
  })

  it('deep-merges existing learner_state.signals with new audience/deadline', async () => {
    const { client, learnerStateBuilder } = createMockClient({
      existingSignals: {
        audience: '学生',
        has_node: true,
        has_git_repo: true,
      },
    })
    mocks.createClientMock.mockResolvedValue(client)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        ...buildValidatedBody(),
        audience: '社会人',
        deadline: '2026-07-01',
      },
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'ポートフォリオサイトを公開したい',
          audience: '社会人',
          deadline: '2026-07-01',
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(learnerStateBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        signals: {
          audience: '社会人',
          deadline: '2026-07-01',
          has_node: true,
          has_git_repo: true,
        },
      }),
      { onConflict: 'user_id' },
    )
  })

  it('keeps inserting the new goal when archiving existing goals fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { client, insertBuilder } = createMockClient({
        archiveErrorMessage: 'archive failed',
      })
      mocks.createClientMock.mockResolvedValue(client)

      const { POST } = await import('./route')
      const response = await POST(
        new Request('http://localhost:3000/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: 'ポートフォリオサイトを公開したい' }),
        }),
      )

      expect(response.status).toBe(201)
      expect(insertBuilder.insert).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        '[goals] failed to archive active goals before insert:',
        'archive failed',
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
