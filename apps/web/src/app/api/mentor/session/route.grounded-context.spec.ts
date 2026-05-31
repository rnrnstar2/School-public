/**
 * W66 (Audit A4 W13-NEW-1): route SCOPING/INVESTIGATE delegate grounded
 * context wiring test.
 *
 * Verifies that POST /api/mentor/session with `MENTOR_CONDUCTOR_ENABLED=1`
 * builds a `MentorGroundedContext` once per request and passes the populated
 * fields to GoalTree / FrictionCritic / TechScout / ToolScout / Judge
 * sub-agents (8 sub-agent grounded context coverage).
 *
 * The test asserts that **at least one** field is populated from real data
 * (not empty arrays / nulls), proving the route layer no longer leaves the
 * sub-agent input schema empty.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
  buildMentorGroundedContextMock: vi.fn(),
  retrieveCandidateAtomsForGoalMock: vi.fn(),
  fetchPlannerMentorMemoryBulletsMock: vi.fn(),
  buildAtomPlanFromGoalWithAIMock: vi.fn(),
  persistCompiledPlanSnapshotMock: vi.fn(),
  // sub-agent run() spies
  goalTreeRunMock: vi.fn(),
  frictionCriticRunMock: vi.fn(),
  lessonMatcherRunMock: vi.fn(),
  memoryRecallRunMock: vi.fn(),
  pathPlannerRunMock: vi.fn(),
  techScoutRunMock: vi.fn(),
  toolScoutRunMock: vi.fn(),
  judgeRunMock: vi.fn(),
  tieBreakerRunMock: vi.fn(),
  detectConflictingReportsMock: vi.fn(),
  persistSubAgentReportsMock: vi.fn(),
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

vi.mock('@/lib/mentor/context/populate-context', () => ({
  buildMentorGroundedContext: mocks.buildMentorGroundedContextMock,
}))

vi.mock('@/lib/lessons/atom-retrieval', () => ({
  retrieveCandidateAtomsForGoal: mocks.retrieveCandidateAtomsForGoalMock,
}))

vi.mock('@/lib/planner/mentor-memory-query', () => ({
  fetchPlannerMentorMemoryBullets: mocks.fetchPlannerMentorMemoryBulletsMock,
}))

vi.mock('@/lib/planner/goal-first/ai-atom-compiler', () => ({
  buildAtomPlanFromGoalWithAI: mocks.buildAtomPlanFromGoalWithAIMock,
}))

vi.mock('@/lib/compiled-plans', () => ({
  persistCompiledPlanSnapshot: mocks.persistCompiledPlanSnapshotMock,
}))

vi.mock('@/lib/mentor/sub-agents/goal-tree', () => ({
  GoalTreeSubAgent: class {
    run = mocks.goalTreeRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/friction-critic', () => ({
  FrictionCriticSubAgent: class {
    run = mocks.frictionCriticRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/lesson-matcher', () => ({
  LessonMatcherSubAgent: class {
    run = mocks.lessonMatcherRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/memory-recall', () => ({
  MemoryRecallSubAgent: class {
    run = mocks.memoryRecallRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/path-planner', () => ({
  ShortestPathPlannerSubAgent: class {
    run = mocks.pathPlannerRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/tech-scout', () => ({
  TechStackScoutSubAgent: class {
    run = mocks.techScoutRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/tool-scout', () => ({
  AiToolCatalogScoutSubAgent: class {
    run = mocks.toolScoutRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/judge', () => ({
  JudgeSubAgent: class {
    run = mocks.judgeRunMock
  },
}))

vi.mock('@/lib/mentor/sub-agents/tie-breaker', () => ({
  TieBreakerSubAgent: class {
    run = mocks.tieBreakerRunMock
  },
  detectConflictingReports: mocks.detectConflictingReportsMock,
}))

vi.mock('@/lib/mentor/sub-agents/persist', () => ({
  persistSubAgentReports: mocks.persistSubAgentReportsMock,
}))

// Force MENTOR_CONDUCTOR_ENABLED=1 so route runs SCOPING/INVESTIGATE delegates.
const originalConductorEnv = process.env.MENTOR_CONDUCTOR_ENABLED
process.env.MENTOR_CONDUCTOR_ENABLED = '1'

const { POST } = await import('./route')

afterAll(() => {
  if (originalConductorEnv === undefined) {
    delete process.env.MENTOR_CONDUCTOR_ENABLED
  } else {
    process.env.MENTOR_CONDUCTOR_ENABLED = originalConductorEnv
  }
})

describe('POST /api/mentor/session — W66 grounded context wiring', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.validateBodyMock.mockResolvedValue({
      data: {
        goal: 'AIでポートフォリオサイトを作りたい',
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
    mocks.createServiceClientMock.mockReturnValue(null) // skip budget cap context
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
      goal: 'AIでポートフォリオサイトを作りたい',
      canonicalGoalKey: 'aiでポートフォリオサイトを作りたい',
      messages: [],
      historySummary: null,
      phase: 'discovering',
      answers: {},
      insights: {},
      lastQuestionId: null,
      transport: {
        status: 'live',
        label: 'AIメンター',
        message: 'live',
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
          { id: 'goal', role: 'user', content: '目標: AIでポートフォリオサイトを作りたい' },
        ],
        lastQuestionId: null,
        transport: {
          status: 'live',
          label: 'ZAI coding plan',
          message: 'live',
          model: 'glm-5.1',
        },
        completedAt: '2026-05-08T00:00:00Z', // hearing 完了 → SCOPING/INVESTIGATE 起動
        summaryKeyPoints: ['キーポイント1'],
        personaIds: ['persona.noneng-webapp'],
      },
      completed: true,
      structuredOutput: {
        reply: 'プランを作成します。',
        phase: 'coaching',
        actions: [],
        decisions: [],
        open_questions: [],
        next_question: null,
        next_action: 'ヒアリング内容を確認する',
      },
    })
    mocks.upsertMentorSessionMock.mockImplementation(async (_client, _userId, session) => ({
      ...session,
      id: 'mentor-session-1',
    }))

    // grounded context — populated values
    mocks.buildMentorGroundedContextMock.mockResolvedValue({
      learnerProfile: {
        cliFamiliarity: 'basic',
        availableAiTools: ['cursor', 'v0'],
        experienceSummary: '初めてのWeb制作',
      },
      pastFrictionSnippets: ['前回 OAuth で詰まった'],
      planStepBriefs: [
        {
          stepId: 'step-1',
          title: 'Next.js プロジェクト初期化',
          rationale: 'テンプレで土台を作る',
          recommendedTool: 'v0',
        },
      ],
      personaProfile: {
        cliFamiliarity: 'basic',
        personaTags: ['persona.noneng-webapp'],
        availableAiTools: ['cursor', 'v0'],
        experienceSummary: '初めてのWeb制作',
        skillLevel: null,
      },
      completionCriteria: [
        'Vercel に deploy したアプリの URL (url_pattern: "^https://.*\\.vercel\\.app/.*")',
      ],
    })

    // sub-agent stubs — minimum-viable outputs that make the fan-out happy.
    mocks.goalTreeRunMock.mockResolvedValue({
      tree: {
        goal_summary: 'AIでポートフォリオサイトを作りたい',
        objectives: [
          {
            id: 'obj-1',
            title: 'ゴール',
            milestones: [
              {
                id: 'ms-1',
                title: 'ms',
                leafTasks: [
                  {
                    id: 'leaf-1',
                    title: 'leaf-1',
                    human_judgment_required: false,
                    automation_potential: 'high',
                  },
                ],
              },
            ],
          },
        ],
      },
      summary: { model: 'zai:glm-5.1', latencyMs: 1, ok: true, leafCount: 1 },
    })
    mocks.frictionCriticRunMock.mockResolvedValue({
      frictions: [],
      non_eng_score: 100,
      summary: {
        model: 'zai:glm-5.1',
        latencyMs: 1,
        ok: true,
        leafCount: 1,
        blockCount: 0,
        warnCount: 0,
        infoCount: 0,
        mode: 'heuristic',
      },
    })
    mocks.lessonMatcherRunMock.mockResolvedValue({
      matches: [],
      gaps: [],
      estimatedMinutesByLeafId: {},
      summary: {
        model: 'zai:glm-5.1',
        latencyMs: 1,
        ok: true,
        leafCount: 1,
        matchCount: 0,
        gapCount: 1,
        candidateCount: 0,
        mode: 'deterministic',
      },
    })
    mocks.memoryRecallRunMock.mockResolvedValue({
      avoid_patterns: [],
      reinforce_patterns: [],
      suggested_pacing: 'normal',
      summary: {
        model: 'zai:glm-5.1',
        latencyMs: 1,
        ok: true,
        memoryCount: 0,
        negativeCount: 0,
        blockerCount: 0,
        mode: 'heuristic',
      },
    })
    mocks.pathPlannerRunMock.mockResolvedValue({
      critical_path: ['leaf-1'],
      parallelizable_groups: [],
      optional_polish: [],
      total_hours_estimate: 0.5,
      summary: {
        model: 'haiku:test',
        latencyMs: 1,
        leafCount: 1,
        unestimatedLeafCount: 0,
      },
    })
    mocks.techScoutRunMock.mockResolvedValue({
      id: 'tech_scout',
      role: 'tech_scout',
      status: 'ok',
      payload: {},
      summary: 'tech-scout ok',
      model: 'gemini:test',
      latencyMs: 1,
      startedAt: 0,
      finishedAt: 1,
    })
    mocks.toolScoutRunMock.mockResolvedValue({
      id: 'tool_scout',
      role: 'tool_scout',
      status: 'ok',
      payload: {},
      summary: 'tool-scout ok',
      model: 'gemini:test',
      latencyMs: 1,
      startedAt: 0,
      finishedAt: 1,
    })
    mocks.judgeRunMock.mockResolvedValue({
      verdicts: [],
      samples: [],
      overallScore: 7,
      recommendAction: 'commit',
      summary: {
        model: 'haiku:test',
        latencyMs: 1,
        n: 1,
        ok: true,
        mode: 'mock',
        rubric: 'plan-quality-v1',
      },
    })
    mocks.detectConflictingReportsMock.mockReturnValue([])
    mocks.persistSubAgentReportsMock.mockResolvedValue(undefined)

    mocks.retrieveCandidateAtomsForGoalMock.mockResolvedValue({
      candidateAtoms: [],
      retrievalMethod: 'mock',
    })
    mocks.fetchPlannerMentorMemoryBulletsMock.mockResolvedValue([])
    mocks.buildAtomPlanFromGoalWithAIMock.mockResolvedValue({
      goal: 'AIでポートフォリオサイトを作りたい',
      goalTags: [],
      steps: [],
      milestones: [],
      coverageScore: 0,
      unsupportedCapabilities: [],
      rationale: '',
      source: 'topo',
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      planId: 'plan-1',
      synced: true,
    })
  })

  it('passes populated grounded context to GoalTreeSubAgent (SCOPING)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text() // drain stream

    expect(mocks.goalTreeRunMock).toHaveBeenCalledTimes(1)
    const call = mocks.goalTreeRunMock.mock.calls[0]?.[0]
    expect(call.learnerProfile.cli_familiarity).toBe('basic')
    expect(call.learnerProfile.available_ai_tools).toEqual(['cursor', 'v0'])
    expect(call.learnerProfile.experience_summary).toBe('初めてのWeb制作')
  })

  it('passes populated grounded context to FrictionCriticSubAgent (INVESTIGATE)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text()

    expect(mocks.frictionCriticRunMock).toHaveBeenCalledTimes(1)
    const call = mocks.frictionCriticRunMock.mock.calls[0]?.[0]

    expect(call.learnerProfile.cli_familiarity).toBe('basic')
    expect(call.learnerProfile.available_ai_tools).toEqual(['cursor', 'v0'])
    expect(call.learnerProfile.experience_summary).toBe('初めてのWeb制作')
    expect(call.pastFrictionSnippets).toEqual(['前回 OAuth で詰まった'])
    expect(Array.isArray(call.planDraft?.stepBriefs)).toBe(true)
    expect(call.planDraft.stepBriefs.length).toBeGreaterThan(0)
    expect(call.planDraft.stepBriefs[0]).toMatchObject({
      stepId: 'step-1',
      title: 'Next.js プロジェクト初期化',
      rationale: 'テンプレで土台を作る',
      recommendedTool: 'v0',
    })
  })

  it('passes goal + planSteps to TechScoutSubAgent (INVESTIGATE)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text()

    expect(mocks.techScoutRunMock).toHaveBeenCalledTimes(1)
    const call = mocks.techScoutRunMock.mock.calls[0]?.[0]
    expect(call.goal).toBe('AIでポートフォリオサイトを作りたい')
    expect(Array.isArray(call.planSteps)).toBe(true)
    expect(call.planSteps.length).toBeGreaterThan(0)
  })

  it('passes goal + cliFamiliarity + planSteps to ToolScoutSubAgent (INVESTIGATE)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text()

    expect(mocks.toolScoutRunMock).toHaveBeenCalledTimes(1)
    const call = mocks.toolScoutRunMock.mock.calls[0]?.[0]
    expect(call.learnerOSAndCli.cliFamiliarity).toBe('basic')
    expect(call.goal).toBe('AIでポートフォリオサイトを作りたい')
    expect(Array.isArray(call.planSteps)).toBe(true)
    expect(call.planSteps.length).toBeGreaterThan(0)
  })

  it('passes personaProfile + completionCriteria to JudgeSubAgent (INVESTIGATE)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text()

    expect(mocks.judgeRunMock).toHaveBeenCalledTimes(1)
    const call = mocks.judgeRunMock.mock.calls[0]?.[0]
    expect(call.personaProfile).toBeDefined()
    expect(call.personaProfile.personaTags).toEqual(['persona.noneng-webapp'])
    expect(call.personaProfile.cli_familiarity).toBe('basic')
    expect(call.personaProfile.available_ai_tools).toEqual(['cursor', 'v0'])
    expect(call.personaProfile.experience_summary).toBe('初めてのWeb制作')
    expect(call.completionCriteria.length).toBeGreaterThan(0)
    expect(call.completionCriteria[0]).toContain('Vercel')
  })

  it('builds grounded context only once per request (memoization)', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/mentor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'AIでポートフォリオサイトを作りたい',
          message: null,
          uiContext: { surface: 'onboarding' },
        }),
      }),
    )
    await response.text()

    // SCOPING (goal-tree) + INVESTIGATE (5 sub-agents) はすべて同じ ground を共有。
    // build is called exactly once thanks to in-route memoization.
    expect(mocks.buildMentorGroundedContextMock).toHaveBeenCalledTimes(1)
  })
})
