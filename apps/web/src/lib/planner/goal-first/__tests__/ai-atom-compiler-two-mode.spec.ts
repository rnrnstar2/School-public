/**
 * TQ-215: tests for the 2-mode AI plan compilation pipeline.
 *
 * Mode A: Goal Tree decomposition (no atom catalog). The AI is asked to
 *         decompose the goal into objectives → milestones → leaf tasks
 *         purely from goal/learner context.
 * Mode B: Atom matching + delegation filling. Each leaf task gets either
 *         a `matched_atom_id` (existing atom) or a `recommended_tool`
 *         + `delegation_brief` (delegation node).
 *
 * Owner Vision core contract: "lesson が足りなくても tree は作る". When the
 * catalog has no matching atom, Mode B is required to emit a delegation
 * node — NOT to force-map onto a vaguely-similar atom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtomRecord } from '@/lib/atoms/atom-repository'

const {
  fetchCurrentAtomsMock,
  fetchUserPersonaIdsMock,
  fetchAnchorForPersonaMock,
} = vi.hoisted(() => ({
  fetchCurrentAtomsMock: vi.fn(),
  fetchUserPersonaIdsMock: vi.fn(),
  fetchAnchorForPersonaMock: vi.fn(),
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchCurrentAtoms: fetchCurrentAtomsMock,
  fetchUserPersonaIds: fetchUserPersonaIdsMock,
  fetchAnchorForPersona: fetchAnchorForPersonaMock,
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
            {
              id: 'leaf-001',
              title: '採用したいトーンを決める',
              summary: 'ターゲットと文体を決定',
              human_judgment_required: true,
              automation_potential: 'low',
              recommended_capability: 'manual-decision',
            },
          ],
        },
      ],
    },
    {
      id: 'obj-001',
      title: '公開する',
      summary: 'デプロイ',
      milestones: [
        {
          id: 'ms-001',
          title: 'Vercel に乗せる',
          summary: '本番 URL を出す',
          leafTasks: [
            {
              id: 'leaf-002',
              title: 'Vercel デプロイをする',
              summary: 'デプロイの流れに乗せる',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'deploy',
            },
          ],
        },
      ],
    },
  ],
}

describe('TQ-215: 2-mode pipeline (default)', () => {
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

  it('calls the AI twice — once for Mode A, once for Mode B', async () => {
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
              delegation_brief: 'Tailwind ベースで LP を 1 ページ作って。ヒーロー / CTA を含めて。',
              selection_reason: 'UI を最短で出すため',
            },
            {
              leaf_task_id: 'leaf-001',
              matched_atom_id: null,
              recommended_tool: null,
              delegation_brief: null,
              selection_reason: '本人が決める',
            },
            {
              leaf_task_id: 'leaf-002',
              matched_atom_id: 'atom.deploy.vercel',
              recommended_tool: null,
              delegation_brief: null,
              selection_reason: 'カタログに該当 atom あり',
            },
          ],
          overall_rationale: 'Goal Tree → atom + 委譲',
          estimated_total_minutes: 90,
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      learnerState: {
        skillLevel: 'beginner',
        signals: { cli_familiarity: 'low' },
      },
    })

    expect(plan).not.toBeNull()
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(2)
  })

  it('Mode A receives no atom_catalog (independent decomposition)', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: SAMPLE_GOAL_TREE.objectives.flatMap((o) =>
            o.milestones.flatMap((m) =>
              m.leafTasks.map((l) => ({
                leaf_task_id: l.id,
                matched_atom_id: null,
                recommended_tool: 'v0',
                delegation_brief: 'do',
              })),
            ),
          ),
          overall_rationale: 'r',
        }),
      )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    const [, modeAInit] = fetchWithRetryMock.mock.calls[0]!
    const modeABody = JSON.parse((modeAInit as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = modeABody.messages.find((m) => m.role === 'user')!
    const userPayload = JSON.parse(userMessage.content) as Record<string, unknown>
    expect(userPayload).not.toHaveProperty('atom_catalog')
    expect(userPayload).toHaveProperty('goal')
    expect(userPayload).toHaveProperty('learner_context')
  })

  it('Mode B receives the goal_tree, atom_catalog AND ai_tool_catalog', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: SAMPLE_GOAL_TREE.objectives.flatMap((o) =>
            o.milestones.flatMap((m) =>
              m.leafTasks.map((l) => ({
                leaf_task_id: l.id,
                matched_atom_id: null,
                recommended_tool: 'v0',
                delegation_brief: 'do',
              })),
            ),
          ),
          overall_rationale: 'r',
        }),
      )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      learnerState: { skillLevel: 'beginner', signals: { cli_familiarity: 'low' } },
    })

    const [, modeBInit] = fetchWithRetryMock.mock.calls[1]!
    const body = JSON.parse((modeBInit as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload).toHaveProperty('goal_tree')
    expect(userPayload).toHaveProperty('atom_catalog')
    expect(userPayload).toHaveProperty('ai_tool_catalog')
  })

  it('"Goal は明確だが atom が無い" → 委譲ノードを emit する (lesson が足りなくても tree は作る)', async () => {
    // Catalog only contains an unrelated atom — the goal needs UI scaffolding
    // but the catalog has no scaffolding atom. The tree must still complete
    // with delegation nodes for the missing capabilities.
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.unrelated.git-basics', title: 'Git basics' }),
    ])

    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          // Mode B emits delegation nodes for every leaf — atom catalog can't help.
          assignments: [
            {
              leaf_task_id: 'leaf-000',
              matched_atom_id: null,
              recommended_tool: 'v0',
              delegation_brief: 'Tailwind ベースで LP を 1 ページ作って。',
              selection_reason: 'UI 生成は v0 が最短',
            },
            {
              leaf_task_id: 'leaf-001',
              matched_atom_id: null,
              recommended_tool: null,
              delegation_brief: null,
              selection_reason: '本人が決める',
            },
            {
              leaf_task_id: 'leaf-002',
              matched_atom_id: null,
              recommended_tool: 'claude-code',
              delegation_brief: 'このプロジェクトを Vercel にデプロイして。',
              selection_reason: 'デプロイ手順を回す',
            },
          ],
          overall_rationale: 'カタログ薄いので委譲中心',
          estimated_total_minutes: 60,
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      learnerState: { skillLevel: 'beginner', signals: { cli_familiarity: 'low' } },
    })

    expect(plan).not.toBeNull()
    // Tree should still produce 3 leaf-derived steps even though no atom matched.
    expect(plan!.steps.length).toBe(3)

    const uiStep = plan!.steps[0]!
    expect(uiStep.atomId.startsWith('delegation:')).toBe(true)
    expect(uiStep.recommendedTool).toBe('v0')
    expect(uiStep.delegationBrief).toContain('LP')
    expect(uiStep.title).toContain('LP')

    const deployStep = plan!.steps[2]!
    expect(deployStep.atomId.startsWith('delegation:')).toBe(true)
    expect(deployStep.recommendedTool).toBe('claude-code')

    // Coverage should be 0 because no leaf matched a real atom.
    expect(plan!.coverageScore).toBe(0)
    // Plan should still report `source: 'ai'`.
    expect(plan!.source).toBe('ai')
  })

  it('hybrid: atom が ある leaf は match、無い leaf は delegation を emit', async () => {
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
              matched_atom_id: null, // no UI atom in catalog
              recommended_tool: 'v0',
              delegation_brief: 'LP を 1 ページ作って',
            },
            {
              leaf_task_id: 'leaf-001',
              matched_atom_id: null,
              recommended_tool: null,
              delegation_brief: null,
            },
            {
              leaf_task_id: 'leaf-002',
              matched_atom_id: 'atom.deploy.vercel', // catalog hit
              recommended_tool: null,
              delegation_brief: null,
            },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    expect(plan!.steps[0]!.atomId.startsWith('delegation:')).toBe(true)
    expect(plan!.steps[2]!.atomId).toBe('atom.deploy.vercel')
    // Coverage = 1 real atom out of 3 steps.
    expect(plan!.coverageScore).toBe(0.33)
  })

  it('preserves Mode A milestone structure in the resulting plan', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.deploy.vercel', title: 'Vercel deploy' }),
    ])
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            { leaf_task_id: 'leaf-000', matched_atom_id: null, recommended_tool: 'v0', delegation_brief: 'd' },
            { leaf_task_id: 'leaf-001', matched_atom_id: null, recommended_tool: null, delegation_brief: null },
            { leaf_task_id: 'leaf-002', matched_atom_id: 'atom.deploy.vercel' },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    expect(plan!.milestones.map((m) => m.id)).toEqual(['ms-000', 'ms-001'])
    // ms-000 has leaf-000 + leaf-001 (delegation); ms-001 has leaf-002 (matched atom).
    expect(plan!.milestones[0]!.atomIds.length).toBe(2)
    expect(plan!.milestones[1]!.atomIds).toEqual(['atom.deploy.vercel'])
  })

  it('drops unknown tool ids from Mode B (catalog drift safety)', async () => {
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
              recommended_tool: 'magicgpt-9000', // hallucinated tool id
              delegation_brief: 'do',
            },
            { leaf_task_id: 'leaf-001', matched_atom_id: null },
            { leaf_task_id: 'leaf-002', matched_atom_id: 'atom.deploy.vercel' },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })
    expect(plan).not.toBeNull()
    const uiStep = plan!.steps[0]!
    expect(uiStep.recommendedTool).toBeNull()
    // brief should be dropped when tool is rejected.
    expect(uiStep.delegationBrief).toBeNull()
  })

  it('falls back to legacy single-mode when Mode A returns null', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])

    // Mode A returns malformed JSON → null.
    fetchWithRetryMock.mockResolvedValueOnce(
      new Response('not-json', { status: 200 }),
    )
    // Then legacy single-mode is invoked — provide a valid response.
    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        selected_atom_ids: ['atom.foo'],
        milestones: [
          { id: 'ms-000', title: 'M', description: 'd', atom_ids: ['atom.foo'] },
        ],
        atom_rationales: { 'atom.foo': 'r' },
        overall_rationale: 'r',
        estimated_total_minutes: 15,
      }),
    )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    // Legacy path emits real atom plans, not delegation nodes.
    expect(plan!.steps[0]!.atomId).toBe('atom.foo')
  })
})

describe('TQ-215: LEGACY_SINGLE_MODE=1 forces single-mode', () => {
  let originalLegacyFlag: string | undefined

  beforeEach(() => {
    originalLegacyFlag = process.env.LEGACY_SINGLE_MODE
    process.env.LEGACY_SINGLE_MODE = '1'
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

  it('only invokes the AI once with the legacy ATOM_PLAN_COMPILATION_PROMPT', async () => {
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ])
    fetchWithRetryMock.mockResolvedValueOnce(
      jsonResponse({
        selected_atom_ids: ['atom.foo'],
        milestones: [
          { id: 'ms-000', title: 'M', description: 'd', atom_ids: ['atom.foo'] },
        ],
        atom_rationales: { 'atom.foo': 'r' },
        overall_rationale: 'r',
        estimated_total_minutes: 15,
      }),
    )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1)
    // Verify the user payload contains atom_catalog (legacy contract).
    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >
    expect(userPayload).toHaveProperty('atom_catalog')
  })
})
