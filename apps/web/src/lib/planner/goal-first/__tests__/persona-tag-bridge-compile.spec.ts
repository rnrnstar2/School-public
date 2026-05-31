// W58 (2026-05-09) — Integration test: persona slug ↔ atom personaTags bridge.
//
// Audit G3 で発見された step_count: 0 issue (Wave 11 G2 §8.2) を回帰防止する。
// 4 persona (`persona.ai-automation` / `persona.ai-content-creator` /
// `persona.noneng-webapp` / `persona.ai-app-builder`) で `buildAtomPlan` が
// step_count >= 1 を返すことを mock atom + mock anchor で確認する。

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AtomRecord, PersonaAnchorRecord } from '@/lib/atoms/atom-repository'

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

import { buildAtomPlan, buildAtomPlanFromGoal } from '../plan-compiler'

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
    anchorId: overrides.anchorId ?? 'anchor.test.default',
    personaId: overrides.personaId ?? 'persona.web-builder',
    orderedAtomIds: overrides.orderedAtomIds ?? [],
    requiredCapabilities: overrides.requiredCapabilities ?? [],
    description: overrides.description ?? 'test anchor',
  }
}

describe('persona-tag-bridge integration with buildAtomPlan', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('persona.ai-automation: produces step_count >= 1 with office-automator atoms (Audit G3 fix)', async () => {
    // Audit G3 で再現していたケース: anchor は `atom.office-automator.*` を指すが
    // 旧 toPersonaTag('persona.ai-automation') = 'ai-automation' が DB tag
    // (`office-automator`) と合わず step_count: 0 になっていた。
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.office-automator.spreadsheet-formula-ai',
        title: 'Spreadsheet Formula AI',
        personaTags: ['office-automator', 'ai-first-learner'],
        goalTags: ['business-automation', 'productivity'],
      }),
      makeAtom({
        atomId: 'atom.office-automator.daily-report-automation',
        title: 'Daily Report Automation',
        personaTags: ['office-automator', 'ai-first-learner'],
        goalTags: ['business-automation', 'productivity'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        personaId: 'persona.ai-automation',
        orderedAtomIds: [
          'atom.office-automator.spreadsheet-formula-ai',
          'atom.office-automator.daily-report-automation',
        ],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'Excel 自動化',
      goalTags: ['business-automation'],
      userPersonas: ['persona.ai-automation'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('persona.ai-content-creator: produces step_count >= 1 with video-creator atoms', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.video-creator.generate-video-ideas',
        title: 'Generate Video Ideas',
        personaTags: ['video-creator', 'ai-first-learner'],
        goalTags: ['video-production', 'content'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        personaId: 'persona.ai-content-creator',
        orderedAtomIds: ['atom.video-creator.generate-video-ideas'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: '動画コンテンツ毎週投稿',
      goalTags: ['video-production'],
      userPersonas: ['persona.ai-content-creator'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('persona.ai-app-builder: produces step_count >= 1 with web-builder atoms', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.web-builder.choose-project-goal',
        title: 'Choose Project Goal',
        personaTags: ['web-builder', 'ai-first-learner'],
        goalTags: ['saas-mvp', 'any-web-project'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        personaId: 'persona.ai-app-builder',
        orderedAtomIds: ['atom.web-builder.choose-project-goal'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'AI アプリ作る',
      goalTags: ['saas-mvp'],
      userPersonas: ['persona.ai-app-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('persona.noneng-webapp: produces step_count >= 1 with p-noneng-webapp atoms', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.common.scaffold-with-bolt',
        title: 'Scaffold with Bolt',
        personaTags: ['p-noneng-webapp', 'ai-first-learner'],
        goalTags: ['any-web-project'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        personaId: 'persona.noneng-webapp',
        orderedAtomIds: ['atom.common.scaffold-with-bolt'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'Web アプリ作る',
      goalTags: ['any-web-project'],
      userPersonas: ['persona.noneng-webapp'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('persona.web-builder still works (regression check)', async () => {
    // 旧 toPersonaTag で動いていた persona.web-builder が壊れないことを確認。
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.web-builder.deploy-with-vercel-cli',
        title: 'Deploy with Vercel CLI',
        personaTags: ['web-builder', 'ai-first-learner'],
        goalTags: ['any-web-project'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        personaId: 'persona.web-builder',
        orderedAtomIds: ['atom.web-builder.deploy-with-vercel-cli'],
      }),
    )

    const plan = await buildAtomPlan({
      goal: 'Web サイト公開',
      goalTags: ['any-web-project'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  // W15 B1 (audit G5): root cause regression — `/api/plans/compile` で
  // 「動画コンテンツ毎週投稿」入力時、旧 inferGoalTags が `blog-site` を出して
  // video-creator atom (goal_tags=['video-production','content']) を goal-scope で
  // 全件落とし、Wave 13 raw `compile-ai-content-creator.json` で
  // `goal_match_count: 0 / step_count: 0` となっていた。
  // buildAtomPlanFromGoal (inferGoalTags 経由) で video atom が拾われることを確認する。
  it('persona.ai-content-creator + video input infers video-production and produces step_count >= 1', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.video-creator.generate-video-ideas',
        title: 'Generate Video Ideas',
        personaTags: ['video-creator', 'ai-first-learner'],
        goalTags: ['video-production', 'content'],
      }),
      makeAtom({
        atomId: 'atom.video-creator.batch-produce-short-scripts',
        title: 'Batch Produce Short Scripts',
        personaTags: ['video-creator', 'ai-first-learner'],
        goalTags: ['video-production', 'content', 'efficiency'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({
        anchorId: 'anchor.ai-content-creator.start',
        personaId: 'persona.ai-content-creator',
        orderedAtomIds: [
          'atom.video-creator.generate-video-ideas',
          'atom.video-creator.batch-produce-short-scripts',
        ],
      }),
    )

    // goalTags は明示しない (= /api/plans/compile preview path と同じ条件)。
    // 旧実装ではここで inferGoalTags が ['blog-site'] を返し step_count: 0 だった。
    const plan = await buildAtomPlanFromGoal({
      goal: '動画コンテンツ毎週投稿',
      personaIds: ['persona.ai-content-creator'],
    })

    expect(plan.source).toBe('anchor')
    expect(plan.goalTags).toContain('video-production')
    expect(plan.goalTags).not.toContain('blog-site')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT match cross-persona atoms when persona-tag mismatch (no over-broad match)', async () => {
    // bridge を入れた結果として「全 atom を match させてしまう」regression が
    // 起きていないことを確認。persona.ai-freelancer は ai-freelancer のみで、
    // office-automator atom は match しない。
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.office-automator.alpha',
        title: 'Office Automator Alpha',
        personaTags: ['office-automator', 'ai-first-learner'],
        goalTags: ['business-automation'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'side income',
      goalTags: ['business-automation'],
      userPersonas: ['persona.ai-freelancer'],
      completedAtomIds: [],
    })

    expect(plan.source).toBe('topo')
    expect(plan.steps).toHaveLength(0)
  })
})
