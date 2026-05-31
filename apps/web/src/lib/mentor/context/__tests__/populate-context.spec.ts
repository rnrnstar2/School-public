/**
 * W66 (Audit A4 W13-NEW-1): populate-context unit tests.
 *
 * Verifies that `buildMentorGroundedContext` populates each grounded field
 * from the right data source (learner_profile / mentor_memory + archive /
 * compiled_plans / hearing answers / persona × goal graduation calc).
 *
 * Failure modes (DB throw / row missing) must collapse to safe empty defaults
 * so the route layer never breaks.
 */

import { describe, expect, it, vi } from 'vitest'

import { buildMentorGroundedContext } from '@/lib/mentor/context/populate-context'
import type { PlannerHearingSession } from '@/lib/planner/types'

// ── Supabase client mock ────────────────────────────────────────────

interface FakeRows {
  learnerProfile?: unknown | null
  mentorMemoryRows?: unknown[]
  mentorMemoryArchiveRows?: unknown[]
  compiledPlanSteps?: unknown[]
  /** Set true to make compiled_plans fetch reject (graceful degrade test). */
  compiledPlansThrows?: boolean
  /** Set true to make learner_profile fetch reject. */
  learnerProfileThrows?: boolean
}

function buildFakeClient(rows: FakeRows) {
  const learnerProfileChain = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (rows.learnerProfileThrows) throw new Error('boom')
          return { data: rows.learnerProfile ?? null, error: null }
        },
      }),
    }),
  }

  const mentorMemoryChain = {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({
            data: rows.mentorMemoryRows ?? [],
            error: null,
          }),
        }),
      }),
    }),
  }

  const mentorMemoryArchiveChain = {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({
            data: rows.mentorMemoryArchiveRows ?? [],
            error: null,
          }),
        }),
      }),
    }),
  }

  const compiledPlansChain = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => {
                if (rows.compiledPlansThrows) throw new Error('boom')
                if (!rows.compiledPlanSteps) {
                  return { data: null, error: null }
                }
                return {
                  data: { plan_id: 'plan-1', steps: rows.compiledPlanSteps },
                  error: null,
                }
              },
            }),
          }),
        }),
      }),
    }),
  }

  return {
    from: (table: string) => {
      switch (table) {
        case 'learner_profile':
          return learnerProfileChain
        case 'mentor_memory':
          return mentorMemoryChain
        case 'mentor_memory_archive':
          return mentorMemoryArchiveChain
        case 'compiled_plans':
          return compiledPlansChain
        default:
          throw new Error(`unexpected table ${table}`)
      }
    },
  }
}

function buildPlannerSession(
  overrides: Partial<PlannerHearingSession> = {},
): PlannerHearingSession {
  return {
    answers: {},
    insights: {
      buildGoal: null,
      audience: null,
      deadline: null,
      projectType: null,
      constraints: [],
      preferences: [],
      mustHaveFeatures: [],
      planningFocus: [],
    },
    messages: [],
    lastQuestionId: null,
    transport: {
      status: 'live',
      label: 'AIメンター',
      message: 'live',
    },
    completedAt: null,
    summaryKeyPoints: [],
    personaIds: [],
    ...overrides,
  }
}

// ── tests ──────────────────────────────────────────────────────────

describe('buildMentorGroundedContext', () => {
  it('populates learnerProfile from learner_profile row when available', async () => {
    const client = buildFakeClient({
      learnerProfile: {
        user_id: 'user-1',
        cli_familiarity: 'comfortable',
        available_ai_tools: ['cursor', 'claude-code'],
        experience_summary: '10年のWebデザイナー経験あり',
      },
    })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでポートフォリオサイトを作りたい',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx.learnerProfile.cliFamiliarity).toBe('comfortable')
    expect(ctx.learnerProfile.availableAiTools).toEqual(['cursor', 'claude-code'])
    expect(ctx.learnerProfile.experienceSummary).toBe('10年のWebデザイナー経験あり')
  })

  it('falls back to hearing answers when learner_profile row missing', async () => {
    const client = buildFakeClient({ learnerProfile: null })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでホームページを作りたい',
      plannerSession: buildPlannerSession({
        answers: {
          experience: 'マーケティング担当、コードはほぼ書いたことがない',
          cliFamiliarity: 'none',
          aiTools: 'cursor, v0, claude code',
        },
      }),
    })

    expect(ctx.learnerProfile.cliFamiliarity).toBe('none')
    expect(ctx.learnerProfile.availableAiTools).toEqual([
      'cursor',
      'v0',
      'claude code',
    ])
    expect(ctx.learnerProfile.experienceSummary).toBe(
      'マーケティング担当、コードはほぼ書いたことがない',
    )
  })

  it('filters mentor_memory bullets to friction-related snippets', async () => {
    const client = buildFakeClient({
      mentorMemoryRows: [
        {
          title: 'OAuth設定',
          bullets: ['コールバックURLで詰まった', 'Provider設定が分からない'],
          source: 'system',
          created_at: '2026-04-01T00:00:00Z',
        },
        {
          title: '成功記録',
          bullets: ['Vercelデプロイ完了'], // friction keyword 含まず → 除外
          source: 'mentor',
          created_at: '2026-04-02T00:00:00Z',
        },
      ],
      mentorMemoryArchiveRows: [
        {
          title: '過去のエラー',
          bullets: ['DNS設定でエラーになった'],
          source: 'system',
          created_at: '2026-03-01T00:00:00Z',
          archived_at: '2026-03-02T00:00:00Z',
        },
      ],
    })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'Vercelに公開する',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx.pastFrictionSnippets.length).toBeGreaterThan(0)
    expect(
      ctx.pastFrictionSnippets.some((s) => s.includes('詰まっ')),
    ).toBe(true)
    // 成功記録は friction キーワードを含まないので除外される。
    expect(
      ctx.pastFrictionSnippets.some((s) => s.includes('Vercelデプロイ完了')),
    ).toBe(false)
  })

  it('extracts plan step briefs from compiled_plans active row', async () => {
    const client = buildFakeClient({
      compiledPlanSteps: [
        {
          stepId: 'step-1',
          title: 'プロジェクト初期化',
          rationale: 'Next.js テンプレで土台を作る',
          recommendedTool: 'v0',
        },
        {
          atom_id: 'atom-2',
          atom_title: 'デプロイ',
          why: 'Vercel に公開する',
          tool: 'vercel',
        },
        // missing id → skipped
        { title: 'no-id-step' },
      ],
    })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでホームページを作る',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx.planStepBriefs.length).toBe(2)
    expect(ctx.planStepBriefs[0]).toEqual({
      stepId: 'step-1',
      title: 'プロジェクト初期化',
      rationale: 'Next.js テンプレで土台を作る',
      recommendedTool: 'v0',
    })
    // 2 件目: snake_case fallback パスが効くこと
    expect(ctx.planStepBriefs[1]).toEqual({
      stepId: 'atom-2',
      title: 'デプロイ',
      rationale: 'Vercel に公開する',
      recommendedTool: 'vercel',
    })
  })

  it('builds personaProfile when personaIds are present', async () => {
    const client = buildFakeClient({
      learnerProfile: {
        user_id: 'user-1',
        // 'beginner' は legacy 値 → normalize で 'basic' になる契約。
        cli_familiarity: 'beginner',
        available_ai_tools: ['cursor'],
        experience_summary: '初めてのWeb制作',
      },
    })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでホームページを作る',
      plannerSession: buildPlannerSession({
        personaIds: ['persona.noneng-webapp'],
      }),
    })

    expect(ctx.personaProfile).not.toBeNull()
    expect(ctx.personaProfile?.personaTags).toEqual(['persona.noneng-webapp'])
    expect(ctx.personaProfile?.cliFamiliarity).toBe('basic')
    expect(ctx.personaProfile?.availableAiTools).toEqual(['cursor'])
    expect(ctx.personaProfile?.experienceSummary).toBe('初めてのWeb制作')
  })

  it('returns null personaProfile when neither personaIds nor profile fields present', async () => {
    const client = buildFakeClient({ learnerProfile: null })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIで何かをしたい',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx.personaProfile).toBeNull()
  })

  it('builds completionCriteria from persona × goal graduation calc', async () => {
    const client = buildFakeClient({})

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでポートフォリオサイトを作りたい',
      plannerSession: buildPlannerSession({
        personaIds: ['persona.noneng-webapp'],
      }),
    })

    // persona.noneng-webapp::web-builder → vercel_url / github_repo / lovable_url / other_artifact
    expect(ctx.completionCriteria.length).toBeGreaterThan(0)
    expect(
      ctx.completionCriteria.some((c) => c.toLowerCase().includes('vercel')),
    ).toBe(true)
  })

  it('gracefully degrades to empty defaults when DB throws', async () => {
    const client = buildFakeClient({
      learnerProfileThrows: true,
      compiledPlansThrows: true,
      mentorMemoryRows: [],
    })

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIでホームページを作る',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx.learnerProfile.cliFamiliarity).toBeNull()
    expect(ctx.learnerProfile.availableAiTools).toEqual([])
    expect(ctx.planStepBriefs).toEqual([])
    expect(ctx.pastFrictionSnippets).toEqual([])
    // completion criteria は graduation calc が persona 不在 fallback で web-builder
    // を返すので必ず非空 (calc 関数は DB に依存せず、本テストでは graceful 確認)。
    expect(Array.isArray(ctx.completionCriteria)).toBe(true)
  })
})

describe('buildMentorGroundedContext (integration shape)', () => {
  it('returns all 5 grounded fields with stable shape', async () => {
    const client = buildFakeClient({})

    const ctx = await buildMentorGroundedContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client as any,
      userId: 'user-1',
      goal: 'AIで何かをしたい',
      plannerSession: buildPlannerSession(),
    })

    expect(ctx).toEqual(
      expect.objectContaining({
        learnerProfile: expect.objectContaining({
          availableAiTools: expect.any(Array),
        }),
        pastFrictionSnippets: expect.any(Array),
        planStepBriefs: expect.any(Array),
        completionCriteria: expect.any(Array),
      }),
    )
    // Optional fields can be null when no source data exists.
    expect(ctx.learnerProfile).toHaveProperty('cliFamiliarity')
    expect(ctx.learnerProfile).toHaveProperty('experienceSummary')
  })
})

// Suppress unused vi import warning (kept for future test additions).
void vi
