/**
 * TQ-257 / TQ-258 wiring tests.
 *
 * - TQ-257: when the caller supplies `precomputedGoalTree`, the AI
 *   compiler must skip Mode A entirely (1 fetchWithRetry call total
 *   instead of 2). Auditor 2 C19 — Goal Tree decomposer that already ran
 *   in the SCOPING phase must not be re-run inside SYNTH.
 * - TQ-258: when `userId` is supplied, the compiler must call
 *   `fetchAtomsForUserPersonas` and pass the persona-curated atoms to
 *   Mode B as `persona_candidate_atoms`. Auditor 2 C20 — function
 *   existed but was unwired.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtomRecord } from '@/lib/atoms/atom-repository'

const {
  fetchCurrentAtomsMock,
  fetchUserPersonaIdsMock,
  fetchAnchorForPersonaMock,
  fetchAtomsForUserPersonasMock,
} = vi.hoisted(() => ({
  fetchCurrentAtomsMock: vi.fn(),
  fetchUserPersonaIdsMock: vi.fn(),
  fetchAnchorForPersonaMock: vi.fn(),
  fetchAtomsForUserPersonasMock: vi.fn(),
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchCurrentAtoms: fetchCurrentAtomsMock,
  fetchUserPersonaIds: fetchUserPersonaIdsMock,
  fetchAnchorForPersona: fetchAnchorForPersonaMock,
  fetchAtomsForUserPersonas: fetchAtomsForUserPersonasMock,
}))

const fetchWithRetryMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: fetchWithRetryMock,
}))

const getExternalPlannerConfigMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/planner/zai', () => ({
  getExternalPlannerConfig: getExternalPlannerConfigMock,
}))

import { buildAtomPlanFromGoalWithAI } from '../ai-atom-compiler'

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
    goalTags: overrides.goalTags ?? ['any-web-project'],
    capabilityInputs: overrides.capabilityInputs ?? [],
    capabilityOutputs: overrides.capabilityOutputs ?? [],
    hardPrerequisites: overrides.hardPrerequisites ?? [],
    softPrerequisites: overrides.softPrerequisites ?? [],
    estimatedMinutes: overrides.estimatedMinutes ?? 15,
    deliverable: overrides.deliverable ?? {
      type: 'markdown_doc',
      validation: 'basic_manual_check_v1',
    },
    evidence: overrides.evidence ?? [],
    mediaSlots: overrides.mediaSlots ?? [],
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const SAMPLE_GOAL_TREE = {
  goal_summary: 'LP を作って公開する',
  objectives: [
    {
      id: 'obj-000',
      title: 'LP の見た目を組む',
      summary: 'まず画面を出す',
      milestones: [
        {
          id: 'ms-000',
          title: '1 ページ目を作る',
          summary: 'ヒーローと CTA',
          leafTasks: [
            {
              id: 'leaf-000',
              title: 'LP を AI で初期生成する',
              summary: 'v0 で 1 ページ作る',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
          ],
        },
      ],
    },
  ],
}

describe('TQ-257: precomputedGoalTree skips Mode A', () => {
  let originalLegacyFlag: string | undefined

  beforeEach(() => {
    originalLegacyFlag = process.env.LEGACY_SINGLE_MODE
    delete process.env.LEGACY_SINGLE_MODE
    fetchUserPersonaIdsMock.mockResolvedValue(['persona.web-builder'])
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    fetchAtomsForUserPersonasMock.mockResolvedValue({ atoms: [], anchors: [] })
    getExternalPlannerConfigMock.mockReturnValue({
      available: true,
      endpoint: 'https://api.example.test/v1/chat',
      apiKey: 'test-key',
      model: 'test-model',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (originalLegacyFlag === undefined) {
      delete process.env.LEGACY_SINGLE_MODE
    } else {
      process.env.LEGACY_SINGLE_MODE = originalLegacyFlag
    }
  })

  it('skips Mode A and calls AI exactly once (Mode B only) when precomputedGoalTree is supplied', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.deploy.vercel', title: 'Vercel deploy' }),
    ])

    // Only Mode B is queued — supplying a 2nd response would prove the
    // implementation re-ran Mode A on top of the precomputed tree.
    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        assignments: [
          {
            leaf_task_id: 'leaf-000',
            matched_atom_id: null,
            recommended_tool: 'v0',
            delegation_brief: 'do',
            selection_reason: 'r',
          },
        ],
        overall_rationale: 'r',
      }),
    )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      precomputedGoalTree: SAMPLE_GOAL_TREE,
    })

    expect(plan).not.toBeNull()
    // Only Mode B was invoked — Mode A was skipped.
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1)

    // Verify the single fetch call was Mode B (it carries goal_tree).
    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload).toHaveProperty('goal_tree')
    expect(userPayload).toHaveProperty('atom_catalog')
    // Mode B prompt receives the supplied tree verbatim.
    expect((userPayload.goal_tree as { goal_summary?: string }).goal_summary).toBe(
      'LP を作って公開する',
    )
  })

  it('falls back to Mode A when precomputedGoalTree is null/missing', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.deploy.vercel', title: 'Vercel deploy' }),
    ])

    // Mode A then Mode B — 2 fetches expected when no precomputed tree.
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            {
              leaf_task_id: 'leaf-000',
              matched_atom_id: null,
              recommended_tool: 'v0',
              delegation_brief: 'do',
              selection_reason: 'r',
            },
          ],
          overall_rationale: 'r',
        }),
      )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      // precomputedGoalTree intentionally omitted
    })

    expect(fetchWithRetryMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to Mode A when precomputedGoalTree fails the type guard', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.deploy.vercel', title: 'Vercel deploy' }),
    ])

    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            {
              leaf_task_id: 'leaf-000',
              matched_atom_id: null,
              recommended_tool: 'v0',
              delegation_brief: 'do',
              selection_reason: 'r',
            },
          ],
          overall_rationale: 'r',
        }),
      )

    // Malformed payload (missing objectives) — type guard rejects, Mode A runs.
    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      precomputedGoalTree: { not: 'a tree' },
    })

    expect(fetchWithRetryMock).toHaveBeenCalledTimes(2)
  })
})

describe('TQ-258: fetchAtomsForUserPersonas wired into Mode B', () => {
  let originalLegacyFlag: string | undefined

  beforeEach(() => {
    originalLegacyFlag = process.env.LEGACY_SINGLE_MODE
    delete process.env.LEGACY_SINGLE_MODE
    fetchUserPersonaIdsMock.mockResolvedValue(['persona.web-builder'])
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    getExternalPlannerConfigMock.mockReturnValue({
      available: true,
      endpoint: 'https://api.example.test/v1/chat',
      apiKey: 'test-key',
      model: 'test-model',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (originalLegacyFlag === undefined) {
      delete process.env.LEGACY_SINGLE_MODE
    } else {
      process.env.LEGACY_SINGLE_MODE = originalLegacyFlag
    }
  })

  it('calls fetchAtomsForUserPersonas with userId and surfaces result to Mode B prompt', async () => {
    const personaCandidate = makeAtom({
      atomId: 'atom.web-builder.scaffold',
      title: 'Persona-curated scaffold atom',
    })
    fetchCurrentAtomsMock.mockResolvedValue([
      personaCandidate,
      makeAtom({ atomId: 'atom.unrelated', title: 'Unrelated' }),
    ])
    fetchAtomsForUserPersonasMock.mockResolvedValue({
      atoms: [personaCandidate],
      anchors: [],
    })

    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        assignments: [
          {
            leaf_task_id: 'leaf-000',
            matched_atom_id: null,
            recommended_tool: 'v0',
            delegation_brief: 'd',
            selection_reason: 'r',
          },
        ],
        overall_rationale: 'r',
      }),
    )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: 'user-42',
      personaIds: ['persona.web-builder'],
      precomputedGoalTree: SAMPLE_GOAL_TREE,
    })

    // 1) function was called exactly once with the userId
    expect(fetchAtomsForUserPersonasMock).toHaveBeenCalledTimes(1)
    expect(fetchAtomsForUserPersonasMock).toHaveBeenCalledWith('user-42')

    // 2) the atoms it returned reach the Mode B prompt as
    //    `persona_candidate_atoms`
    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload).toHaveProperty('persona_candidate_atoms')
    const candidates = userPayload.persona_candidate_atoms as Array<{ id: string }>
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.id).toBe('atom.web-builder.scaffold')
  })

  it('skips fetchAtomsForUserPersonas when userId is null', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])

    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        assignments: [
          {
            leaf_task_id: 'leaf-000',
            matched_atom_id: null,
            recommended_tool: 'v0',
            delegation_brief: 'd',
            selection_reason: 'r',
          },
        ],
        overall_rationale: 'r',
      }),
    )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      precomputedGoalTree: SAMPLE_GOAL_TREE,
    })

    expect(fetchAtomsForUserPersonasMock).not.toHaveBeenCalled()

    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload).toHaveProperty('persona_candidate_atoms')
    expect(userPayload.persona_candidate_atoms).toEqual([])
  })

  it('tolerates fetchAtomsForUserPersonas throwing (best-effort)', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])
    fetchAtomsForUserPersonasMock.mockRejectedValue(new Error('rls denied'))

    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        assignments: [
          {
            leaf_task_id: 'leaf-000',
            matched_atom_id: null,
            recommended_tool: 'v0',
            delegation_brief: 'd',
            selection_reason: 'r',
          },
        ],
        overall_rationale: 'r',
      }),
    )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: 'user-99',
      personaIds: ['persona.web-builder'],
      precomputedGoalTree: SAMPLE_GOAL_TREE,
    })

    // Pipeline must still produce a plan despite the persona-fetch failure.
    expect(plan).not.toBeNull()
    expect(fetchAtomsForUserPersonasMock).toHaveBeenCalledWith('user-99')

    // Mode B prompt receives an empty persona_candidate_atoms.
    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload.persona_candidate_atoms).toEqual([])
  })
})
