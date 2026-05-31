import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  afterMock: vi.fn((callback: () => void | Promise<void>) => callback()),
  applyRateLimitMock: vi.fn(),
  validateBodyMock: vi.fn(),
  createClientMock: vi.fn(),
  fetchPlannerMentorMemoryBulletsMock: vi.fn(),
  buildAtomPlanFromGoalCachedMock: vi.fn(),
  buildAtomPlanFromGoalWithAIMock: vi.fn(),
  computePlanSeedFromGoalInputMock: vi.fn(),
  getLatestActiveCompiledPlanMock: vi.fn(),
  persistCompiledPlanSnapshotMock: vi.fn(),
  emitTelemetryEventMock: vi.fn(),
  runGoalTreeShadowWriteMock: vi.fn(),
  captureMessageMock: vi.fn(),
}))

const originalShadowWriteFlag = process.env.G2A_SHADOW_WRITE_ENABLED

vi.mock('next/server', () => ({
  after: mocks.afterMock,
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.captureMessageMock,
}))

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_AI: 'RL_AI',
  validateBody: mocks.validateBodyMock,
}))

vi.mock('@/lib/api/response', () => ({
  getRequestId: () => 'req-123',
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/planner/mentor-memory-query', () => ({
  fetchPlannerMentorMemoryBullets: mocks.fetchPlannerMentorMemoryBulletsMock,
}))

vi.mock('@/lib/planner/goal-first', () => ({
  buildAtomPlanFromGoalCached: mocks.buildAtomPlanFromGoalCachedMock,
  buildAtomPlanFromGoalWithAI: mocks.buildAtomPlanFromGoalWithAIMock,
  computePlanSeedFromGoalInput: mocks.computePlanSeedFromGoalInputMock,
}))

vi.mock('@/lib/planner/goal-tree-shadow', () => ({
  formatGoalTreeShadowError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  isG2AShadowWriteEnabled: () =>
    process.env.G2A_SHADOW_WRITE_ENABLED !== 'off',
  runGoalTreeShadowWrite: mocks.runGoalTreeShadowWriteMock,
}))

vi.mock('@/lib/compiled-plans', () => ({
  getLatestActiveCompiledPlan: mocks.getLatestActiveCompiledPlanMock,
  persistCompiledPlanSnapshot: mocks.persistCompiledPlanSnapshotMock,
}))

vi.mock('@/lib/telemetry', () => ({
  emitTelemetryEvent: mocks.emitTelemetryEventMock,
}))

describe('POST /api/plans/compile', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.afterMock.mockImplementation((callback: () => void | Promise<void>) => callback())
    mocks.fetchPlannerMentorMemoryBulletsMock.mockResolvedValue([])
    process.env.G2A_SHADOW_WRITE_ENABLED = 'on'
    mocks.emitTelemetryEventMock.mockResolvedValue(undefined)
  })

  afterAll(() => {
    if (originalShadowWriteFlag === undefined) {
      delete process.env.G2A_SHADOW_WRITE_ENABLED
      return
    }

    process.env.G2A_SHADOW_WRITE_ENABLED = originalShadowWriteFlag
  })

  it('returns an in-memory atom plan in preview mode', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'MVP のサイトを作りたい',
        goalTags: ['website-launch'],
      },
    })
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'MVP のサイトを作りたい',
        goalTags: ['website-launch'],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: ['website-launch'],
        rationale: 'preview',
        source: 'topo',
      },
      seed: 'seed-preview',
      fromCache: false,
      cachedPlanId: null,
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'MVP のサイトを作りたい' }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.preview).toBe(true)
    expect(json.data.planId).toBeNull()
    expect(json.data.plan).toMatchObject({
      goal: 'MVP のサイトを作りたい',
      source: 'topo',
    })
    expect(mocks.afterMock).not.toHaveBeenCalled()
    expect(mocks.persistCompiledPlanSnapshotMock).not.toHaveBeenCalled()
    expect(mocks.runGoalTreeShadowWriteMock).not.toHaveBeenCalled()
    expect(mocks.emitTelemetryEventMock).not.toHaveBeenCalled()
  })

  it('does not schedule shadow writes for anonymous preview requests', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'ログイン前に試したい',
      },
    })
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'ログイン前に試したい',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'preview',
        source: 'topo',
      },
      seed: 'seed-anon-preview',
      fromCache: false,
      cachedPlanId: null,
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'ログイン前に試したい' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.afterMock).not.toHaveBeenCalled()
    expect(mocks.runGoalTreeShadowWriteMock).not.toHaveBeenCalled()
    expect(mocks.captureMessageMock).not.toHaveBeenCalled()
  })

  it('persists the atom plan and emits plan_generated for authenticated users', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'ポートフォリオを公開したい',
        goalTags: ['website-launch'],
        personaIds: ['persona.web-builder'],
        learnerState: {
          skillLevel: 'beginner',
          blockers: ['deploy'],
          signals: { source: 'test' },
        },
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-old',
      goal: '旧プラン',
      personaId: 'persona.web-builder',
    })
    // AI path returns null so we fall through to the cache-aware path.
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'ポートフォリオを公開したい',
        goalTags: ['website-launch'],
        steps: [
          {
            atomId: 'atom.web.goal',
            title: 'ゴール整理',
            rationale: '最初の atom',
            estimatedMinutes: 15,
            milestoneId: 'ms-001',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [
          {
            id: 'ms-001',
            title: '基礎セット',
            description: '最初の atom 群です。',
            atomIds: ['atom.web.goal'],
          },
        ],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: 'rationale',
        source: 'anchor',
      },
      seed: 'seed-auth',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-new',
      parentPlanId: 'plan-old',
    })
    mocks.emitTelemetryEventMock.mockResolvedValue(undefined)

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'ポートフォリオを公開したい' }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        goal: 'ポートフォリオを公開したい',
        parentPlanId: 'plan-old',
        supersedePlanIds: ['plan-old'],
        // planSeed must be threaded through from the cache wrapper so
        // subsequent identical requests can short-circuit via compiled_plans.
        planSeed: 'seed-auth',
      }),
    )
    await Promise.resolve()
    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.runGoalTreeShadowWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        goal: 'ポートフォリオを公開したい',
        planId: 'plan-new',
        planSeed: 'seed-auth',
      }),
    )
    expect(mocks.emitTelemetryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'plan_generated',
        planId: 'plan-new',
      }),
    )
    expect(json.data.planId).toBe('plan-new')
    expect(json.data.plan).toMatchObject({
      goal: 'ポートフォリオを公開したい',
      source: 'anchor',
    })
  })

  it('returns 500 and skips persistence when deterministic plan compilation fails', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: '障害時でも作業中プランを壊したくない',
        goalTags: ['website-launch'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-build-fail' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-existing',
      goal: '既存プラン',
      personaId: 'persona.web-builder',
    })
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockRejectedValue(
      new Error('atom catalog unavailable'),
    )

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: '障害時でも作業中プランを壊したくない' }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({
      error: 'plan_compile_failed',
      message: 'プランの生成に失敗しました。',
    })
    expect(mocks.persistCompiledPlanSnapshotMock).not.toHaveBeenCalled()
    expect(mocks.afterMock).not.toHaveBeenCalled()
    expect(mocks.emitTelemetryEventMock).not.toHaveBeenCalled()
  })

  it('persists the AI-generated plan with planSeed computed from goal input', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'AI で自動化したい',
        goalTags: ['automation'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-ai' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue(null)
    // AI path succeeds — cache wrapper should NOT be called.
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue({
      goal: 'AI で自動化したい',
      goalTags: ['automation'],
      steps: [
        {
          atomId: 'atom.ai.goal',
          title: 'AI の目的を整理',
          rationale: 'AI 生成',
          estimatedMinutes: 10,
          milestoneId: 'ms-ai',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
        },
      ],
      milestones: [
        {
          id: 'ms-ai',
          title: 'AI 準備',
          description: '最初の一歩',
          atomIds: ['atom.ai.goal'],
        },
      ],
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: 'ai rationale',
      source: 'ai',
    })
    mocks.computePlanSeedFromGoalInputMock.mockReturnValue('seed-ai-computed')
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-ai',
      parentPlanId: null,
    })
    mocks.emitTelemetryEventMock.mockResolvedValue(undefined)

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'AI で自動化したい' }),
      }),
    )

    expect(response.status).toBe(200)
    // AI path must NOT go through the cache builder.
    expect(mocks.buildAtomPlanFromGoalCachedMock).not.toHaveBeenCalled()
    // computePlanSeedFromGoalInput must be called so the AI-generated plan
    // still persists a seed and the next identical request cache-hits.
    expect(mocks.computePlanSeedFromGoalInputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'AI で自動化したい',
        userId: 'user-ai',
      }),
    )
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-ai',
        goal: 'AI で自動化したい',
        planSeed: 'seed-ai-computed',
      }),
    )
    await Promise.resolve()
    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.runGoalTreeShadowWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-ai',
        goal: 'AI で自動化したい',
        planId: 'plan-ai',
        planSeed: 'seed-ai-computed',
      }),
    )
  })

  it('skips shadow writes when G2A_SHADOW_WRITE_ENABLED=off', async () => {
    process.env.G2A_SHADOW_WRITE_ENABLED = 'off'

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'Shadow を止めたい',
        goalTags: ['website-launch'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-off' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'Shadow を止めたい',
        goalTags: ['website-launch'],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'flag off',
        source: 'topo',
      },
      seed: 'seed-off',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-off',
      parentPlanId: null,
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'Shadow を止めたい' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.afterMock).not.toHaveBeenCalled()
    expect(mocks.runGoalTreeShadowWriteMock).not.toHaveBeenCalled()
    expect(mocks.captureMessageMock).not.toHaveBeenCalled()
  })

  it('W47 CR-1: reuses active plan when Conductor recently persisted same goal/persona', async () => {
    // CRITICAL: Conductor (mentor session) が SYNTH/COMMIT で persist した
    // plan を、直後の onboarding confirm の `/api/plans/compile` で再 compile
    // + supersedePlanIds で上書きする CR-1 バグの回帰防止。
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'Conductor が出した plan を保持したい',
        personaIds: ['persona.web-builder'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-conductor' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    // 1 分前に Conductor が persist した plan を返す。
    const conductorPlan = {
      goal: 'Conductor が出した plan を保持したい',
      goalTags: ['website-launch'],
      steps: [
        {
          atomId: 'atom.conductor.goal',
          title: 'Conductor が選んだ atom',
          rationale: 'Conductor 経由で生成',
          estimatedMinutes: 15,
          milestoneId: 'ms-conductor',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
        },
      ],
      milestones: [
        {
          id: 'ms-conductor',
          title: 'Conductor milestone',
          description: 'd',
          atomIds: ['atom.conductor.goal'],
        },
      ],
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: 'Conductor rationale',
      source: 'ai',
    }
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-conductor',
      goal: 'Conductor が出した plan を保持したい',
      personaId: 'persona.web-builder',
      planSeed: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      plan: conductorPlan,
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Conductor が出した plan を保持したい',
          personaIds: ['persona.web-builder'],
        }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.reused).toBe(true)
    expect(json.data.planId).toBe('plan-conductor')
    expect(json.data.plan).toMatchObject({
      goal: 'Conductor が出した plan を保持したい',
      source: 'ai',
    })
    // Skip path: compile / persist / shadow write は呼ばれない。
    expect(mocks.buildAtomPlanFromGoalWithAIMock).not.toHaveBeenCalled()
    expect(mocks.buildAtomPlanFromGoalCachedMock).not.toHaveBeenCalled()
    expect(mocks.persistCompiledPlanSnapshotMock).not.toHaveBeenCalled()
    expect(mocks.afterMock).not.toHaveBeenCalled()
    expect(mocks.runGoalTreeShadowWriteMock).not.toHaveBeenCalled()
  })

  it('W53 CR-1 部分破綻 fix: does NOT reuse active plan when activePlan.personaId is null but request supplies persona', async () => {
    // W53 (Audit B2): pre-fix では Conductor COMMIT が persona_id=null で
    // persist し、onboarding confirm が personaIds=['persona.web-builder']
    // で来ると persona mismatch で skip 経路に乗らず、Conductor 出力が
    // 上書きされていた。本テストはその「persona mismatch だと skip しない」
    // 境界を回帰防止として固定する。
    //   - Conductor が正しく persona を persist するようになると活用される
    //     skip 経路 (line 525 'reuses active plan ...' テスト) と対になる。
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'persona mismatch のため reuse しない',
        personaIds: ['persona.web-builder'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-cr1-broken' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-conductor-broken',
      goal: 'persona mismatch のため reuse しない',
      // Pre-W53: Conductor が persona を書かずに persist していた状態の再現。
      personaId: null,
      planSeed: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      plan: {
        goal: 'persona mismatch のため reuse しない',
        goalTags: [],
        steps: [
          {
            atomId: 'a',
            title: 't',
            rationale: 'r',
            estimatedMinutes: 1,
            milestoneId: 'm',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [{ id: 'm', title: 'm', description: 'd', atomIds: ['a'] }],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: 'r',
        source: 'ai',
      },
    })
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'persona mismatch のため reuse しない',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'fresh',
        source: 'topo',
      },
      seed: 'seed-fresh',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-fresh',
      parentPlanId: 'plan-conductor-broken',
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'persona mismatch のため reuse しない',
          personaIds: ['persona.web-builder'],
        }),
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data?.reused).not.toBe(true)
    // persona mismatch (null vs 'persona.web-builder') → 通常 compile path。
    expect(mocks.buildAtomPlanFromGoalWithAIMock).toHaveBeenCalled()
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalled()
  })

  it('W47 CR-1: does NOT reuse active plan when goal differs', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: '別のゴール',
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-x' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-old',
      goal: '元のゴール',
      personaId: null,
      planSeed: null,
      createdAt: new Date().toISOString(),
      plan: {
        goal: '元のゴール',
        goalTags: [],
        steps: [
          {
            atomId: 'a',
            title: 't',
            rationale: 'r',
            estimatedMinutes: 1,
            milestoneId: 'm',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [{ id: 'm', title: 'm', description: 'd', atomIds: ['a'] }],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: 'r',
        source: 'ai',
      },
    })
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: '別のゴール',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'normal',
        source: 'topo',
      },
      seed: 'seed-x',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-new',
      parentPlanId: 'plan-old',
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: '別のゴール' }),
      }),
    )

    expect(response.status).toBe(200)
    // Goal mismatch → normal compile path（reuse skip しない）。
    expect(mocks.buildAtomPlanFromGoalWithAIMock).toHaveBeenCalled()
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalled()
  })

  it('W47 CR-1: does NOT reuse active plan when older than reuse window', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: '保持したい古いプラン',
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-old' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    // 1 時間前 → reuse window (10 min) の外。
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-stale',
      goal: '保持したい古いプラン',
      personaId: null,
      planSeed: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      plan: {
        goal: '保持したい古いプラン',
        goalTags: [],
        steps: [
          {
            atomId: 'a',
            title: 't',
            rationale: 'r',
            estimatedMinutes: 1,
            milestoneId: 'm',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [{ id: 'm', title: 'm', description: 'd', atomIds: ['a'] }],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: 'old',
        source: 'ai',
      },
    })
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: '保持したい古いプラン',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'fresh',
        source: 'topo',
      },
      seed: 'seed-old',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-fresh',
      parentPlanId: 'plan-stale',
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: '保持したい古いプラン' }),
      }),
    )

    expect(response.status).toBe(200)
    // Stale active plan → normal compile path で plan を更新。
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalled()
  })

  it('keeps the UI response unchanged when shadow writes fail', async () => {
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'Shadow が失敗しても進めたい',
        goalTags: ['automation'],
      },
    })
    const learnerStateBuilder = {
      select: vi.fn(() => learnerStateBuilder),
      eq: vi.fn(() => learnerStateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { skill_level: 'beginner', blockers: [], signals: {} },
      }),
    }

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-shadow-fail' } } }),
      },
      from: vi.fn(() => learnerStateBuilder),
    })
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'Shadow が失敗しても進めたい',
        goalTags: ['automation'],
        steps: [],
        milestones: [],
        coverageScore: 0,
        unsupportedCapabilities: [],
        rationale: 'shadow failure',
        source: 'topo',
      },
      seed: 'seed-shadow-fail',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-shadow-fail',
      parentPlanId: null,
    })
    mocks.runGoalTreeShadowWriteMock.mockRejectedValue(
      new Error('shadow insert failed'),
    )

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost:3000/api/plans/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'Shadow が失敗しても進めたい' }),
      }),
    )
    const json = await response.json()

    await Promise.resolve()
    expect(response.status).toBe(200)
    expect(json.data.planId).toBe('plan-shadow-fail')
    expect(json.data.plan).toMatchObject({
      goal: 'Shadow が失敗しても進めたい',
      source: 'topo',
    })
    expect(mocks.captureMessageMock).toHaveBeenCalledWith(
      'G2A shadow write failed',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          user_id: 'user-shadow-fail',
          plan_id: 'plan-shadow-fail',
          error: 'shadow insert failed',
        }),
      }),
    )
  })
})
