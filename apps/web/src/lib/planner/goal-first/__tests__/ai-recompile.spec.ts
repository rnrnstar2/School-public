import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCompiledPlanRecordMock: vi.fn(),
  getLatestActiveCompiledPlanMock: vi.fn(),
  persistCompiledPlanSnapshotMock: vi.fn(),
  emitTelemetryEventMock: vi.fn(),
  buildAtomPlanFromGoalCachedMock: vi.fn(),
}))

vi.mock('@/lib/compiled-plans', () => ({
  getCompiledPlanRecord: mocks.getCompiledPlanRecordMock,
  getLatestActiveCompiledPlan: mocks.getLatestActiveCompiledPlanMock,
  persistCompiledPlanSnapshot: mocks.persistCompiledPlanSnapshotMock,
}))

vi.mock('@/lib/telemetry', () => ({
  emitTelemetryEvent: mocks.emitTelemetryEventMock,
}))

vi.mock('../plan-cache', () => ({
  buildAtomPlanFromGoalCached: mocks.buildAtomPlanFromGoalCachedMock,
}))

describe('resolvePlanningDomainSlugsFromGoalRow', () => {
  it('places primary_domain first and preserves implied domain order', async () => {
    const { resolvePlanningDomainSlugsFromGoalRow } = await import('../ai-recompile')

    const result = resolvePlanningDomainSlugsFromGoalRow({
      goalRow: {
        structured_intent: {
          primary_domain: 'web',
          implied_domains: ['automation', 'web'],
        },
      },
      domains: [],
    })

    expect(result).toEqual(['web', 'automation'])
  })
})

describe('recompilePlanWithAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rebuilds the atom plan, supersedes the previous compiled plan, and emits telemetry', async () => {
    mocks.getCompiledPlanRecordMock.mockResolvedValue({
      planId: 'plan-old',
      goal: '旧ゴール',
      personaId: 'persona.web-builder',
      parentPlanId: null,
      status: 'active',
      coverageScore: 0.5,
      unsupportedCapabilities: [],
      rationale: '旧 plan',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      stepsRaw: [],
      plan: {
        goal: '旧ゴール',
        goalTags: ['website-launch'],
        steps: [
          {
            atomId: 'atom.old.one',
            title: '旧 atom 1',
            rationale: 'old',
            estimatedMinutes: 10,
            milestoneId: 'ms-001',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: '2026-04-08T00:00:00.000Z',
          },
          {
            atomId: 'atom.old.two',
            title: '旧 atom 2',
            rationale: 'old',
            estimatedMinutes: 20,
            milestoneId: 'ms-001',
            prerequisiteAtomIds: ['atom.old.one'],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [
          {
            id: 'ms-001',
            title: '旧 milestone',
            description: 'old',
            atomIds: ['atom.old.one', 'atom.old.two'],
          },
        ],
        coverageScore: 0.5,
        unsupportedCapabilities: [],
        rationale: 'old rationale',
        source: 'anchor',
      },
    })
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: '新ゴール',
        goalTags: ['website-launch'],
        steps: [
          {
            atomId: 'atom.old.one',
            title: '旧 atom 1',
            rationale: 'carry over',
            estimatedMinutes: 10,
            milestoneId: 'ms-001',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
          {
            atomId: 'atom.new.three',
            title: '新 atom 3',
            rationale: 'new',
            estimatedMinutes: 15,
            milestoneId: 'ms-002',
            prerequisiteAtomIds: ['atom.old.one'],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
        milestones: [
          {
            id: 'ms-001',
            title: '基礎',
            description: 'basic',
            atomIds: ['atom.old.one'],
          },
          {
            id: 'ms-002',
            title: '次の一歩',
            description: 'next',
            atomIds: ['atom.new.three'],
          },
        ],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: '新しい順序に組み替えました。',
        source: 'anchor',
      },
      seed: 'seed-recompile',
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

    const { recompilePlanWithAI } = await import('../ai-recompile')
    const result = await recompilePlanWithAI({
      client: {} as never,
      userId: 'user-123',
      currentPlanId: 'plan-old',
      goal: '新ゴール',
      requestId: 'req-123',
      trigger: {
        reason: 'manual',
        context: {
          blockedNodeIds: ['atom.old.two'],
          userMessage: '難しいので組み替えたい',
        },
      },
    })

    expect(mocks.buildAtomPlanFromGoalCachedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '新ゴール',
        personaIds: ['persona.web-builder'],
        completedAtomIds: ['atom.old.one'],
      }),
    )
    expect(mocks.persistCompiledPlanSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '新ゴール',
        parentPlanId: 'plan-old',
        supersedePlanIds: ['plan-old'],
        // planSeed must be threaded from the cached builder result so the
        // revised plan stays eligible for cache hits on identical re-requests.
        planSeed: 'seed-recompile',
      }),
    )
    expect(mocks.emitTelemetryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'plan_revised',
        planId: 'plan-new',
      }),
    )
    expect(result).toMatchObject({
      planId: 'plan-new',
      parentPlanId: 'plan-old',
      changes: {
        removedNodeIds: ['atom.old.two'],
        addedNodeIds: ['atom.new.three'],
        reorderedNodeIds: [],
      },
    })
  })
})

describe('checkAndTriggerBlockersRecompile', () => {
  function createClientWithBlockedCount(count: number) {
    const rows = Array.from({ length: count }, (_, index) => ({
      task_id: `task-${index + 1}`,
    }))

    const builder: Record<string, unknown> = {}
    builder.select = vi.fn().mockReturnValue(builder)
    builder.eq = vi.fn().mockReturnValue(builder)
    builder.gte = vi.fn().mockResolvedValue({ data: rows, error: null })
    const from = vi.fn().mockReturnValue(builder)

    return { client: { from } as never, from, builder }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when there is no active compiled plan', async () => {
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue(null)

    const { client } = createClientWithBlockedCount(5)
    const { checkAndTriggerBlockersRecompile } = await import('../ai-recompile')

    const result = await checkAndTriggerBlockersRecompile({
      client,
      userId: 'user-123',
      requestId: 'req-1',
    })

    expect(result).toBeNull()
    expect(mocks.buildAtomPlanFromGoalCachedMock).not.toHaveBeenCalled()
  })

  it('returns null when blocked count is below threshold', async () => {
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-active',
      goal: 'ゴール',
      personaId: null,
      planSeed: null,
    })

    const { client } = createClientWithBlockedCount(2)
    const { checkAndTriggerBlockersRecompile } = await import('../ai-recompile')

    const result = await checkAndTriggerBlockersRecompile({
      client,
      userId: 'user-123',
      requestId: 'req-1',
    })

    expect(result).toBeNull()
    expect(mocks.buildAtomPlanFromGoalCachedMock).not.toHaveBeenCalled()
  })

  it('invokes recompilePlanWithAI with reason=blockers_accumulated when threshold reached', async () => {
    mocks.getLatestActiveCompiledPlanMock.mockResolvedValue({
      planId: 'plan-active',
      goal: 'ゴール',
      personaId: 'persona.web-builder',
      planSeed: null,
    })
    mocks.getCompiledPlanRecordMock.mockResolvedValue({
      planId: 'plan-active',
      goal: 'ゴール',
      personaId: 'persona.web-builder',
      parentPlanId: null,
      status: 'active',
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: '',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
      stepsRaw: [],
      plan: {
        goal: 'ゴール',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: '',
        source: 'anchor',
      },
    })
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: {
        goal: 'ゴール',
        goalTags: [],
        steps: [],
        milestones: [],
        coverageScore: 1,
        unsupportedCapabilities: [],
        rationale: 'rebuilt',
        source: 'anchor',
      },
      seed: 'seed-blockers',
      fromCache: false,
      cachedPlanId: null,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-next',
      parentPlanId: 'plan-active',
    })
    mocks.emitTelemetryEventMock.mockResolvedValue(undefined)

    const { client } = createClientWithBlockedCount(3)
    const { checkAndTriggerBlockersRecompile } = await import('../ai-recompile')

    const result = await checkAndTriggerBlockersRecompile({
      client,
      userId: 'user-123',
      requestId: 'req-1',
    })

    expect(mocks.buildAtomPlanFromGoalCachedMock).toHaveBeenCalledTimes(1)
    expect(mocks.emitTelemetryEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'plan_revised',
        properties: expect.objectContaining({ reason: 'blockers_accumulated' }),
      }),
    )
    expect(result).toMatchObject({ planId: 'plan-next' })
  })
})
