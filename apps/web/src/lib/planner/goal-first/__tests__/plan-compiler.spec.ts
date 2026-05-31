import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LearnerProfile, LearnerState } from '@/types'
import type { AtomRecord, PersonaAnchorRecord } from '@/lib/atoms/atom-repository'
import type { DomainClassification, NormalizedGoal } from '../types'

const {
  fetchAnchorForPersonaMock,
  fetchCurrentAtomsMock,
  fetchUserPersonaIdsMock,
} = vi.hoisted(() => ({
  fetchAnchorForPersonaMock: vi.fn(),
  fetchCurrentAtomsMock: vi.fn(),
  fetchUserPersonaIdsMock: vi.fn(),
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchAnchorForPersona: fetchAnchorForPersonaMock,
  fetchCurrentAtoms: fetchCurrentAtomsMock,
  fetchUserPersonaIds: fetchUserPersonaIdsMock,
}))

import {
  buildAtomPlan,
  buildAtomPlanFromGoal,
  compilePlan,
  inferGoalTags,
  shouldRefreshPlanForLeanStart,
} from '../plan-compiler'

function makeAtom(overrides: Partial<AtomRecord> & Pick<AtomRecord, 'atomId' | 'title'>): AtomRecord {
  return {
    atomId: overrides.atomId,
    versionId: overrides.versionId ?? `version-${overrides.atomId}`,
    status: overrides.status ?? 'reviewed',
    yamlContent: overrides.yamlContent ?? {},
    bodyMarkdown: overrides.bodyMarkdown ?? null,
    metadata: overrides.metadata ?? {},
    title: overrides.title,
    personaTags: overrides.personaTags ?? ['web-builder'],
    goalTags: overrides.goalTags ?? [],
    capabilityInputs: overrides.capabilityInputs ?? [],
    capabilityOutputs: overrides.capabilityOutputs ?? [],
    hardPrerequisites: overrides.hardPrerequisites ?? [],
    softPrerequisites: overrides.softPrerequisites ?? [],
    estimatedMinutes: overrides.estimatedMinutes ?? 15,
    deliverable: overrides.deliverable ?? { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
    evidence: overrides.evidence ?? [],
    mediaSlots: overrides.mediaSlots ?? [],
  }
}

function makeAnchor(overrides: Partial<PersonaAnchorRecord> = {}): PersonaAnchorRecord {
  return {
    anchorId: overrides.anchorId ?? 'anchor.web-builder.default',
    personaId: overrides.personaId ?? 'persona.web-builder',
    orderedAtomIds: overrides.orderedAtomIds ?? [],
    requiredCapabilities: overrides.requiredCapabilities ?? [],
    description: overrides.description ?? 'default anchor',
  }
}

function makeGoal(overrides: Partial<NormalizedGoal> = {}): NormalizedGoal {
  return {
    raw: overrides.raw ?? 'サイトを公開したい',
    cleaned: overrides.cleaned ?? 'サイトを公開したい',
    language: overrides.language ?? 'ja',
    implied_domains: overrides.implied_domains ?? ['web'],
    tool_mentions: overrides.tool_mentions ?? [],
    outcome_summary: overrides.outcome_summary ?? 'サイトを公開する',
    supportStatus: overrides.supportStatus,
    supportMessage: overrides.supportMessage,
  }
}

function makeDomains(overrides: Partial<DomainClassification> = {}): DomainClassification {
  return {
    primary: overrides.primary ?? 'web',
    isMixed: overrides.isMixed ?? false,
    domains: overrides.domains ?? [{ slug: 'web', confidence: 0.9 }],
  }
}

function makeLearnerProfile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    user_id: overrides.user_id ?? 'user-1',
    display_name: overrides.display_name ?? 'Learner',
    locale: overrides.locale ?? 'ja',
    experience_summary: overrides.experience_summary ?? 'beginner',
    operating_system: overrides.operating_system ?? 'macOS',
    cli_familiarity: overrides.cli_familiarity ?? 'basic',
    available_ai_tools: overrides.available_ai_tools ?? ['Claude Code'],
    can_use_local_tools: overrides.can_use_local_tools ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-04-01T00:00:00Z',
  }
}

function makeLearnerState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    user_id: overrides.user_id ?? 'user-1',
    target_outcome: overrides.target_outcome ?? 'サイトを公開する',
    skill_level: overrides.skill_level ?? 'beginner',
    active_track_id: overrides.active_track_id ?? null,
    active_task_id: overrides.active_task_id ?? null,
    existing_materials: overrides.existing_materials ?? null,
    blockers: overrides.blockers ?? [],
    signals: overrides.signals ?? {},
    created_at: overrides.created_at ?? '2026-04-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-04-01T00:00:00Z',
  }
}

describe('buildAtomPlan', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps anchor order and appends goal-matched atoms around the spine', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.goal',
        title: 'Goal',
        goalTags: ['website-launch'],
        capabilityOutputs: ['goal-ready'],
      }),
      makeAtom({
        atomId: 'atom.setup',
        title: 'Setup',
        goalTags: ['setup-environment'],
        hardPrerequisites: ['atom.goal'],
        capabilityOutputs: ['workspace-ready'],
      }),
      makeAtom({
        atomId: 'atom.publish',
        title: 'Publish',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.setup'],
        capabilityOutputs: ['deploy-ready'],
      }),
      makeAtom({
        atomId: 'atom.extra',
        title: 'Extra',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.setup'],
        capabilityOutputs: ['quality-check'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        orderedAtomIds: ['atom.goal', 'atom.setup', 'atom.publish'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.map((step) => step.atomId)).toEqual([
      'atom.goal',
      'atom.setup',
      'atom.publish',
      'atom.extra',
    ])
  })

  it('excludes completed atoms and keeps unsupported capabilities that remain unmet', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.goal',
        title: 'Goal',
        goalTags: ['website-launch'],
        capabilityOutputs: ['goal-ready'],
      }),
      makeAtom({
        atomId: 'atom.publish',
        title: 'Publish',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.goal'],
        capabilityOutputs: ['deploy-ready'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        orderedAtomIds: ['atom.goal', 'atom.publish'],
        requiredCapabilities: ['goal-ready', 'client-signoff'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: ['atom.goal'],
    })

    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.publish'])
    expect(plan.steps[0]?.prerequisiteAtomIds).toEqual([])
    expect(plan.unsupportedCapabilities).toEqual(['client-signoff'])
  })

  it('builds a topological path when no anchor exists', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.goal',
        title: 'Goal',
        goalTags: ['website-launch'],
        capabilityOutputs: ['goal-ready'],
      }),
      makeAtom({
        atomId: 'atom.setup',
        title: 'Setup',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.goal'],
        capabilityOutputs: ['workspace-ready'],
      }),
      makeAtom({
        atomId: 'atom.other',
        title: 'Other',
        goalTags: ['crm-launch'],
        capabilityOutputs: ['crm-ready'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('topo')
    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.goal', 'atom.setup'])
    expect(plan.coverageScore).toBe(1)
  })

  it('calculates partial coverage from goal tag overlap', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.goal',
        title: 'Goal',
        goalTags: ['website-launch'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch', 'deploy-ready'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.coverageScore).toBe(0.5)
    expect(plan.coverageScore).toBeGreaterThanOrEqual(0)
    expect(plan.coverageScore).toBeLessThanOrEqual(1)
  })

  it('does not fall back to all scoped atoms when goalMatchedAtoms is empty', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.a', title: 'A', goalTags: ['crm-launch'] }),
      makeAtom({ atomId: 'atom.b', title: 'B', goalTags: ['crm-launch'] }),
      makeAtom({ atomId: 'atom.c', title: 'C', goalTags: ['crm-launch'] }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('topo')
    expect(plan.steps).toHaveLength(0)
  })

  it('caps initial plan atoms to a lean default', async () => {
    const atoms = Array.from({ length: 30 }, (_, i) =>
      makeAtom({
        atomId: `atom.${String(i).padStart(3, '0')}`,
        title: `Atom ${i}`,
        goalTags: ['website-launch'],
      }),
    )
    fetchCurrentAtomsMock.mockResolvedValue(atoms)
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.steps.length).toBeLessThanOrEqual(10)
  })

  it('drops meta and polish atoms from the initial plan', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.web-builder.what-you-will-build', title: 'What You Will Build', goalTags: ['website-launch'] }),
      makeAtom({ atomId: 'atom.web-builder.create-homepage', title: 'Create Homepage', goalTags: ['website-launch'] }),
      makeAtom({ atomId: 'atom.web-builder.custom-domain', title: 'Custom Domain', goalTags: ['website-launch'] }),
      makeAtom({ atomId: 'atom.web-builder.analytics', title: 'Analytics', goalTags: ['website-launch'] }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.web-builder.create-homepage'])
    expect(plan.steps[0]?.rationale).not.toMatch(/アンカー順序|対応タグ|atom\./)
  })

  it('does not pull Next.js or Supabase atoms into a static-site start', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.web-builder.html-css-page', title: 'HTML CSS Page', goalTags: ['portfolio-site'] }),
      makeAtom({ atomId: 'atom.web-builder.nextjs-setup', title: 'Next.js Setup', goalTags: ['portfolio-site'] }),
      makeAtom({ atomId: 'atom.web-builder.supabase-setup', title: 'Supabase Setup', goalTags: ['portfolio-site'] }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'ポートフォリオサイトを作る',
      goalTags: ['portfolio-site'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
      learnerState: {
        signals: {
          project_complexity: 'static-site',
          wants_static_site: true,
        },
      },
    })

    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.web-builder.html-css-page'])
  })

  it('only includes anchor atoms that are goal-matched', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.matched', title: 'Matched', goalTags: ['website-launch'] }),
      makeAtom({ atomId: 'atom.unmatched', title: 'Unmatched', goalTags: ['crm-launch'] }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({ orderedAtomIds: ['atom.matched', 'atom.unmatched'] }),
    )

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.map((s) => s.atomId)).toEqual(['atom.matched'])
    expect(plan.steps.map((s) => s.atomId)).not.toContain('atom.unmatched')
  })

  it('includes telemetry in the plan result', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.a', title: 'A', goalTags: ['website-launch'] }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.telemetry).toEqual({
      scoped_count: 1,
      goal_match_count: 1,
      selected_count: 1,
      source: 'topo',
    })
  })

  it('records soft prerequisites on steps without enforcing them in ordering', async () => {
    // Soft prereqs are pedagogical hints — the toposort must ignore them
    // entirely (so an atom can ship before a dependent even if declared as
    // a soft prereq), while still being carried through on the step for
    // the UI to show "recommended before this lesson" hints.
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.hard-prereq',
        title: 'Hard prereq',
        goalTags: ['website-launch'],
        capabilityOutputs: ['hard-ready'],
      }),
      makeAtom({
        atomId: 'atom.soft-prereq',
        title: 'Soft prereq',
        goalTags: ['website-launch'],
        capabilityOutputs: ['soft-hint'],
      }),
      makeAtom({
        atomId: 'atom.dependent',
        title: 'Dependent',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.hard-prereq'],
        softPrerequisites: ['atom.soft-prereq'],
        capabilityOutputs: ['deploy-ready'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    const stepIds = plan.steps.map((step) => step.atomId)
    const dependentIndex = stepIds.indexOf('atom.dependent')
    const hardIndex = stepIds.indexOf('atom.hard-prereq')
    const softIndex = stepIds.indexOf('atom.soft-prereq')

    expect(hardIndex).toBeGreaterThanOrEqual(0)
    expect(dependentIndex).toBeGreaterThanOrEqual(0)
    expect(softIndex).toBeGreaterThanOrEqual(0)
    // Hard prereq MUST come strictly before its dependent.
    expect(hardIndex).toBeLessThan(dependentIndex)

    // Soft prereq is surfaced on the dependent step but not enforced.
    const dependentStep = plan.steps.find((step) => step.atomId === 'atom.dependent')
    expect(dependentStep?.prerequisiteAtomIds).toEqual(['atom.hard-prereq'])
    expect(dependentStep?.softPrerequisiteAtomIds).toEqual(['atom.soft-prereq'])
  })

  it('allows a soft prerequisite to appear after its dependent in the plan order', async () => {
    // With only a soft prereq linking the two atoms, the toposort is free
    // to place them in any order (here we force an ordering via goal tags
    // + anchor spine). Assert that the plan still compiles and the soft
    // prereq is recorded even though the atom was placed AFTER its
    // dependent.
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.dependent',
        title: 'Dependent (ships first)',
        goalTags: ['website-launch'],
        softPrerequisites: ['atom.optional-hint'],
        capabilityOutputs: ['deploy-ready'],
      }),
      makeAtom({
        atomId: 'atom.optional-hint',
        title: 'Optional hint (ships last)',
        goalTags: ['website-launch'],
        capabilityOutputs: ['extra-hint'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        // Deliberately place the soft-prereq atom AFTER its dependent in
        // the anchor spine to prove the soft prereq does not force reordering.
        orderedAtomIds: ['atom.dependent', 'atom.optional-hint'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    const stepIds = plan.steps.map((step) => step.atomId)
    expect(stepIds).toEqual(['atom.dependent', 'atom.optional-hint'])

    const dependentStep = plan.steps.find((step) => step.atomId === 'atom.dependent')
    expect(dependentStep?.prerequisiteAtomIds).toEqual([])
    expect(dependentStep?.softPrerequisiteAtomIds).toEqual(['atom.optional-hint'])
  })

  it('filters completed atoms out of softPrerequisiteAtomIds', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.soft-done',
        title: 'Soft done',
        goalTags: ['website-launch'],
      }),
      makeAtom({
        atomId: 'atom.dependent',
        title: 'Dependent',
        goalTags: ['website-launch'],
        softPrerequisites: ['atom.soft-done'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: ['atom.soft-done'],
    })

    const dependentStep = plan.steps.find((step) => step.atomId === 'atom.dependent')
    expect(dependentStep?.softPrerequisiteAtomIds).toEqual([])
  })

  it('throws when hard prerequisites contain a cycle', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.a',
        title: 'A',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.b'],
      }),
      makeAtom({
        atomId: 'atom.b',
        title: 'B',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.a'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    await expect(
      buildAtomPlan({
        goal: 'サイトを公開する',
        goalTags: ['website-launch'],
        userPersonas: ['persona.web-builder'],
        completedAtomIds: [],
      }),
    ).rejects.toThrow('cyclic')
  })

  it('filters blocker-matched atoms out of the seed when unblocked alternatives exist', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.web-builder.ai-code-review',
        title: 'AI Code Review',
        goalTags: ['website-launch'],
      }),
      makeAtom({
        atomId: 'atom.web-builder.create-homepage',
        title: 'Create Homepage',
        goalTags: ['website-launch'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
      learnerState: {
        blockers: ['ai-code-review'],
      },
    })

    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.web-builder.create-homepage'])
  })

  it('keeps blocker-matched atoms when every candidate would otherwise be filtered out', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.web-builder.ai-code-review',
        title: 'AI Code Review',
        goalTags: ['website-launch'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
      learnerState: {
        blockers: ['ai-code-review'],
      },
    })

    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.web-builder.ai-code-review'])
  })

  it('propagates atom catalog fetch failures instead of building an empty plan', async () => {
    fetchCurrentAtomsMock.mockRejectedValue(new Error('atom catalog unavailable'))

    await expect(
      buildAtomPlan({
        goal: 'サイトを公開する',
        goalTags: ['website-launch'],
        userPersonas: ['persona.web-builder'],
        completedAtomIds: [],
      }),
    ).rejects.toThrow('atom catalog unavailable')
    expect(fetchAnchorForPersonaMock).not.toHaveBeenCalled()
  })
})

describe('compilePlan', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns candidates_unavailable when atom planning finds no steps', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([])
    fetchUserPersonaIdsMock.mockResolvedValue([])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await compilePlan({
      goal: makeGoal(),
      domains: makeDomains(),
      learnerProfile: makeLearnerProfile(),
      learnerState: makeLearnerState(),
      completedLessonIds: [],
    })

    expect(plan.status).toBe('candidates_unavailable')
    expect(plan.nodes).toHaveLength(0)
    expect(plan.summary).toContain('準備中')
  })
})

describe('inferGoalTags', () => {
  it('infers portfolio intent from hearing key points even when the goal text is generic', () => {
    const tags = inferGoalTags(
      makeGoal({
        raw: 'AI でサイトを作りたい',
        cleaned: 'AI でサイトを作りたい',
        outcome_summary: 'AI でサイトを作る',
      }),
      makeDomains(),
      {
        hearingKeyPoints: ['作品や実績を載せるポートフォリオにしたい'],
      },
    )

    expect(tags).toContain('portfolio-site')
  })

  // W15 B1 (audit G5): root cause regression for `step_count: 0` on
  // persona.ai-content-creator + 「動画コンテンツ毎週投稿」 input.
  // 旧 inference は `コンテンツ` で blog-site を吐き、video-creator atom
  // (goal_tags=['video-production','content']) を goal-scope で全件落としていた。
  it('infers video-production (not blog-site) for video keyword inputs', () => {
    const tags = inferGoalTags(
      makeGoal({
        raw: '動画コンテンツ毎週投稿',
        cleaned: '動画コンテンツ毎週投稿',
        outcome_summary: '動画コンテンツを毎週投稿する',
        implied_domains: ['content'],
      }),
      makeDomains({ primary: 'content', domains: [{ slug: 'content', confidence: 0.9 }] }),
    )

    expect(tags).toContain('video-production')
    // `コンテンツ` 単独で blog-site が付くと video-creator atom が落ちる回帰になる。
    expect(tags).not.toContain('blog-site')
  })

  it('infers video-production for English video keywords (YouTube, Shorts, TikTok)', () => {
    for (const goalText of [
      'Post YouTube shorts every week',
      'Make TikTok videos with AI',
      'Build a vlog channel',
    ]) {
      const tags = inferGoalTags(
        makeGoal({
          raw: goalText,
          cleaned: goalText,
          outcome_summary: goalText,
          implied_domains: ['content'],
        }),
        makeDomains({ primary: 'content', domains: [{ slug: 'content', confidence: 0.9 }] }),
      )

      expect(tags, `goal=${goalText}`).toContain('video-production')
    }
  })

  it('still infers blog-site for genuine blog keywords without video signal', () => {
    const tags = inferGoalTags(
      makeGoal({
        raw: 'AI でブログ記事を毎週書きたい',
        cleaned: 'AI でブログ記事を毎週書きたい',
        outcome_summary: 'ブログ記事を継続的に書く',
        implied_domains: ['content'],
      }),
      makeDomains({ primary: 'content', domains: [{ slug: 'content', confidence: 0.9 }] }),
    )

    expect(tags).toContain('blog-site')
    expect(tags).not.toContain('video-production')
  })
})

describe('buildAtomPlanFromGoal', () => {
  // TQ-217 (2026-05-09): web-builder anchor の textbook 順序
  // (terminal-basics → node-pnpm → git-cli → create-next-app → ...) を解体し、
  // no-code-first (atom.common.scaffold-with-v0 を 1 step 目) へ刷新した。
  // 旧 contract では本テストが [choose-project-goal, terminal-basics] を
  // expect 値として教科書順序を固定化していた (Inv-3 主要発見 #2/#3)。
  // 新 contract では:
  //   1) anchor の 1 step 目は「画面に何か出る」no-code scaffold atom
  //   2) terminal-basics などの CLI 系は anchor.web-builder.start からは外す
  //      (anchor.web-builder.cli へ退避済み)
  // よって本テストは新 anchor を mock し、scaffold-with-v0 が先頭に来ることを assert する。
  it('uses the persona anchor order when explicit personaIds are provided (no-code-first)', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.common.scaffold-with-v0',
        title: 'Scaffold with v0',
        goalTags: ['portfolio-site', 'any-web-project'],
        capabilityOutputs: ['scaffold-ui-with-v0'],
      }),
      makeAtom({
        atomId: 'atom.web-builder.choose-project-goal',
        title: 'Choose Project Goal',
        goalTags: ['portfolio-site', 'any-web-project'],
      }),
      makeAtom({
        atomId: 'atom.web-builder.let-claude-build-everything',
        title: 'Let Claude build everything',
        goalTags: ['portfolio-site', 'any-web-project'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        anchorId: 'anchor.web-builder.start',
        personaId: 'persona.web-builder',
        orderedAtomIds: [
          'atom.common.scaffold-with-v0',
          'atom.web-builder.choose-project-goal',
          'atom.web-builder.let-claude-build-everything',
        ],
      }),
    )

    const plan = await buildAtomPlanFromGoal({
      goal: 'AI でサイトを作りたい',
      personaIds: ['persona.web-builder'],
      hearingSummary: {
        keyPoints: ['作品や実績を載せるポートフォリオにしたい'],
      },
    })

    expect(plan.source).toBe('anchor')
    // 新 contract: 1 step 目は「画面に何か出る」no-code scaffold atom
    expect(plan.steps[0]?.atomId).toBe('atom.common.scaffold-with-v0')
    // 新 contract: 教科書順序 (terminal-basics 先頭) は禁止
    expect(plan.steps[0]?.atomId).not.toBe('atom.web-builder.terminal-basics')
    expect(plan.steps[0]?.atomId).not.toBe('atom.web-builder.node-pnpm-setup')
    expect(plan.steps[0]?.atomId).not.toBe('atom.web-builder.git-github-cli')
    expect(plan.steps.map((step) => step.atomId)).toContain(
      'atom.web-builder.choose-project-goal',
    )
  })

  // TQ-217 negative-assertion: terminal-basics が anchor 先頭に現れたら fail。
  // 旧 contract が再起しないように regression テストとして残す。
  it('does not place terminal-basics or other CLI prerequisites first when web-builder anchor is loaded', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.web-builder.terminal-basics',
        title: 'Terminal Basics',
        goalTags: ['portfolio-site', 'any-web-project'],
      }),
      makeAtom({
        atomId: 'atom.web-builder.node-pnpm-setup',
        title: 'Node + pnpm setup',
        goalTags: ['portfolio-site', 'any-web-project'],
      }),
      makeAtom({
        atomId: 'atom.common.scaffold-with-v0',
        title: 'Scaffold with v0',
        goalTags: ['portfolio-site', 'any-web-project'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        anchorId: 'anchor.web-builder.start',
        personaId: 'persona.web-builder',
        // Real (post-TQ-217) anchor: scaffold-with-v0 first, no CLI prerequisites.
        orderedAtomIds: ['atom.common.scaffold-with-v0'],
      }),
    )

    const plan = await buildAtomPlanFromGoal({
      goal: 'AI でサイトを作りたい',
      personaIds: ['persona.web-builder'],
      hearingSummary: {
        keyPoints: ['作品や実績を載せるポートフォリオにしたい'],
      },
    })

    const firstStep = plan.steps[0]?.atomId
    // Owner Vision: 1 step 目に画面に何か出る atom 以外が現れたら NG。
    const forbiddenFirstAtomIds = [
      'atom.web-builder.terminal-basics',
      'atom.web-builder.node-pnpm-setup',
      'atom.web-builder.git-github-cli',
      'atom.web-builder.create-next-app',
      'atom.web-builder.install-shadcn',
    ]
    expect(forbiddenFirstAtomIds).not.toContain(firstStep)
  })

  it('marks old verbose cached plans for refresh', () => {
    const staleSteps = Array.from({ length: 11 }, (_, index) => ({
      atomId: `atom.${index}`,
      title: `Atom ${index}`,
      rationale: index === 0 ? '対応タグ: website-launch。前提: atom.setup' : 'old rationale',
      estimatedMinutes: 15,
      milestoneId: null,
      prerequisiteAtomIds: [],
      softPrerequisiteAtomIds: [],
      completedAt: null,
    }))

    expect(shouldRefreshPlanForLeanStart({ steps: staleSteps })).toBe(true)
  })
})
