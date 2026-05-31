/**
 * P1-2: Plan determinism + seeding tests.
 *
 * Guards against the investigation finding: "Plans are regenerated
 * per request, no caching, no deterministic seed. Two sessions with
 * the same goal + inputs may produce different lesson orderings."
 */

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

import { buildAtomPlan } from '../plan-compiler'
import {
  canonicalizePlanSeedInput,
  computePlanSeed,
  computePlanSeedFromGoalInput,
} from '../plan-seed'

function makeAtom(
  overrides: Partial<AtomRecord> & Pick<AtomRecord, 'atomId' | 'title'>,
): AtomRecord {
  return {
    atomId: overrides.atomId,
    versionId: overrides.versionId ?? `version-${overrides.atomId}`,
    status: overrides.status ?? 'draft',
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
    deliverable:
      overrides.deliverable ?? { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
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

describe('buildAtomPlan — deterministic ordering', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('produces identical ordering across 3 consecutive runs with the same inputs', async () => {
    const atoms: AtomRecord[] = [
      makeAtom({
        atomId: 'atom.alpha',
        title: 'Alpha',
        goalTags: ['website-launch'],
        capabilityOutputs: ['goal-ready'],
      }),
      makeAtom({
        atomId: 'atom.beta',
        title: 'Beta',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.alpha'],
        capabilityOutputs: ['workspace-ready'],
      }),
      makeAtom({
        atomId: 'atom.gamma',
        title: 'Gamma',
        goalTags: ['website-launch'],
        hardPrerequisites: ['atom.alpha'],
        capabilityOutputs: ['deploy-ready'],
      }),
    ]

    // Return atoms in DIFFERENT orders across calls — this mirrors real
    // Supabase behavior where the driver does not guarantee row order
    // without an explicit ORDER BY. The compiler must be robust against
    // this source of flakiness.
    fetchCurrentAtomsMock
      .mockResolvedValueOnce([atoms[2], atoms[0], atoms[1]])
      .mockResolvedValueOnce([atoms[1], atoms[2], atoms[0]])
      .mockResolvedValueOnce([atoms[0], atoms[1], atoms[2]])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({ orderedAtomIds: ['atom.alpha', 'atom.beta', 'atom.gamma'] }),
    )

    const runs: string[][] = []
    for (let i = 0; i < 3; i += 1) {
      const plan = await buildAtomPlan({
        goal: 'サイトを公開する',
        goalTags: ['website-launch'],
        userPersonas: ['persona.web-builder'],
        completedAtomIds: [],
      })
      runs.push(plan.steps.map((step) => step.atomId))
    }

    expect(runs[0]).toEqual(runs[1])
    expect(runs[1]).toEqual(runs[2])
    expect(runs[0]).toEqual(['atom.alpha', 'atom.beta', 'atom.gamma'])
  })

  it('tie-breaks atoms with identical priority/minutes/title by atomId lexical order', async () => {
    // Two atoms with zero prerequisites, identical title, identical
    // estimatedMinutes, no anchor priority — the comparator's final
    // atomId tie-break must kick in.
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.z-second',
        title: 'Same Title',
        goalTags: ['website-launch'],
        estimatedMinutes: 15,
      }),
      makeAtom({
        atomId: 'atom.a-first',
        title: 'Same Title',
        goalTags: ['website-launch'],
        estimatedMinutes: 15,
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    const plan = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder'],
      completedAtomIds: [],
    })

    // Anchor absent -> topo path; both atoms are seeds with no hard
    // prereqs, so the topological queue sorts purely by the
    // comparator. atomId "atom.a-first" < "atom.z-second" lexically,
    // so it MUST come first.
    expect(plan.source).toBe('topo')
    expect(plan.steps.map((step) => step.atomId)).toEqual(['atom.a-first', 'atom.z-second'])
  })

  it('is unaffected by the order of userPersonas in the input', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.one',
        title: 'One',
        goalTags: ['website-launch'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({ orderedAtomIds: ['atom.one'] }),
    )

    const planA = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.web-builder', 'persona.automation'],
      completedAtomIds: [],
    })

    vi.clearAllMocks()
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.one',
        title: 'One',
        goalTags: ['website-launch'],
      }),
    ])
    fetchAnchorForPersonaMock.mockResolvedValue(
      makeAnchor({ orderedAtomIds: ['atom.one'] }),
    )

    const planB = await buildAtomPlan({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      userPersonas: ['persona.automation', 'persona.web-builder'],
      completedAtomIds: [],
    })

    expect(planA.steps.map((s) => s.atomId)).toEqual(planB.steps.map((s) => s.atomId))
  })
})

describe('computePlanSeed', () => {
  it('is stable across multiple calls with identical inputs', () => {
    const input = {
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      personaIds: ['persona.web-builder'],
      completedAtomIds: ['atom.goal'],
      tools: ['Claude Code'],
      learnerState: {
        skillLevel: 'beginner',
        blockers: [],
      },
    }

    const seed1 = computePlanSeed(input)
    const seed2 = computePlanSeed(input)
    const seed3 = computePlanSeed(input)

    expect(seed1).toEqual(seed2)
    expect(seed2).toEqual(seed3)
    expect(seed1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces the same seed regardless of array input order (normalized)', () => {
    const seedA = computePlanSeed({
      goal: 'サイトを公開する',
      goalTags: ['website-launch', 'setup-environment'],
      completedAtomIds: ['atom.a', 'atom.b'],
      tools: ['Claude Code', 'Cursor'],
    })

    const seedB = computePlanSeed({
      goal: 'サイトを公開する',
      goalTags: ['setup-environment', 'website-launch'],
      completedAtomIds: ['atom.b', 'atom.a'],
      tools: ['Cursor', 'Claude Code'],
    })

    expect(seedA).toEqual(seedB)
  })

  it('produces a different seed when the goal differs slightly', () => {
    const seedA = computePlanSeed({
      goal: 'サイトを公開する',
    })

    const seedB = computePlanSeed({
      goal: 'サイトを公開したい', // different wording
    })

    expect(seedA).not.toEqual(seedB)
  })

  it('produces a different seed when tools differ', () => {
    const base = {
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
    }

    const seedA = computePlanSeed({ ...base, tools: ['Claude Code'] })
    const seedB = computePlanSeed({ ...base, tools: ['Cursor'] })

    expect(seedA).not.toEqual(seedB)
  })

  it('produces a different seed when completedAtomIds differ', () => {
    const base = {
      goal: 'サイトを公開する',
    }

    const seedA = computePlanSeed({ ...base, completedAtomIds: [] })
    const seedB = computePlanSeed({ ...base, completedAtomIds: ['atom.goal'] })

    expect(seedA).not.toEqual(seedB)
  })

  it('treats undefined vs missing keys identically (canonical form)', () => {
    const seedA = computePlanSeed({
      goal: 'サイトを公開する',
      goalTags: undefined,
      personaIds: undefined,
    })

    const seedB = computePlanSeed({
      goal: 'サイトを公開する',
    })

    expect(seedA).toEqual(seedB)
  })

  it('canonicalizePlanSeedInput emits a sorted string-array JSON payload', () => {
    const canonical = canonicalizePlanSeedInput({
      goal: '  サイトを公開する  ', // intentional whitespace
      goalTags: ['c', 'a', 'b', 'a'],
    })

    const parsed = JSON.parse(canonical) as {
      goal: string
      goalTags: string[]
      tools: string[]
    }
    expect(parsed.goal).toBe('サイトを公開する')
    expect(parsed.goalTags).toEqual(['a', 'b', 'c']) // deduped + sorted
    expect(parsed.tools).toEqual([])
  })
})

describe('computePlanSeedFromGoalInput', () => {
  it('is stable and matches computePlanSeed for equivalent inputs', () => {
    const seed1 = computePlanSeedFromGoalInput({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      personaIds: ['persona.web-builder'],
      completedAtomIds: [],
    })

    const seed2 = computePlanSeed({
      goal: 'サイトを公開する',
      goalTags: ['website-launch'],
      personaIds: ['persona.web-builder'],
      completedAtomIds: [],
    })

    expect(seed1).toEqual(seed2)
  })
})
