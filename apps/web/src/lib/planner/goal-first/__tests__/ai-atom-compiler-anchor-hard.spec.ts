/**
 * TQ-255: AI 2-mode pipeline must hard-reference persona anchors.
 *
 * Auditor 2 (C17) detected that `ai-atom-compiler.ts` did not consult
 * `resolvePersonaAnchor()` at all — the curated no-code-first 5-step
 * ordering survived only as a weak prompt suggestion in
 * `ATOM_PLAN_COMPILATION_PROMPT`. This spec contracts the new behaviour:
 *
 *  1. Mode B receives `persona_anchors` in its user payload.
 *  2. Anchor atoms (matched by Mode B onto leaves) appear at the head of
 *     the resulting plan in the anchor's declared order.
 *  3. Anchor atoms NOT surfaced by Mode B are still injected at the
 *     head, so the curated path is guaranteed even when the model
 *     ignores it.
 *  4. Telemetry surfaces `anchor_atom_count` / `anchor_injected_count`
 *     so observability can flag misbehaving model runs.
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
      title: '雛形を作る',
      summary: '画面を出す',
      milestones: [
        {
          id: 'ms-000',
          title: '初期雛形',
          summary: '1 画面が出る',
          leafTasks: [
            {
              id: 'leaf-scaffold',
              title: 'AI で UI を生成する',
              summary: 'v0 で 1 ページ作る',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
            {
              id: 'leaf-goal',
              title: 'ゴールを 1 文で決める',
              summary: '何を作りたいか言語化',
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
      title: '公開',
      summary: 'デプロイ',
      milestones: [
        {
          id: 'ms-001',
          title: 'Vercel に乗せる',
          summary: '本番 URL を取る',
          leafTasks: [
            {
              id: 'leaf-deploy',
              title: 'Vercel にデプロイする',
              summary: '公開 URL を取得',
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

const WEB_BUILDER_ANCHOR_ATOMS = [
  'atom.common.scaffold-with-v0',
  'atom.web-builder.choose-project-goal',
  'atom.web-builder.let-claude-build-everything',
  'atom.web-builder.deploy-with-vercel-cli',
  'atom.common.delegate-full-feature-to-cli-agent',
] as const

function buildWebBuilderCatalog(): AtomRecord[] {
  return WEB_BUILDER_ANCHOR_ATOMS.map((atomId) =>
    makeAtom({
      atomId,
      title: atomId,
      personaTags: ['web-builder'],
      goalTags: ['any-web-project'],
    }),
  )
}

describe('TQ-255: AI 2-mode pipeline hard-references persona anchors', () => {
  let originalLegacyFlag: string | undefined

  beforeEach(() => {
    originalLegacyFlag = process.env.LEGACY_SINGLE_MODE
    delete process.env.LEGACY_SINGLE_MODE
    fetchUserPersonaIdsMock.mockResolvedValue(['persona.web-builder'])
    fetchAnchorForPersonaMock.mockResolvedValue({
      anchorId: 'anchor.web-builder.default',
      personaId: 'persona.web-builder',
      orderedAtomIds: [...WEB_BUILDER_ANCHOR_ATOMS],
      requiredCapabilities: [],
      description: null,
    })
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

  it('hands persona_anchors to Mode B in the user payload', async () => {
    fetchCurrentAtomsMock.mockResolvedValue(buildWebBuilderCatalog())
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.common.scaffold-with-v0' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: 'atom.web-builder.choose-project-goal' },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: 'atom.web-builder.deploy-with-vercel-cli' },
          ],
          overall_rationale: 'r',
        }),
      )

    await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    const [, modeBInit] = fetchWithRetryMock.mock.calls[1]!
    const body = JSON.parse((modeBInit as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userPayload = JSON.parse(body.messages.find((m) => m.role === 'user')!.content) as Record<
      string,
      unknown
    >

    expect(userPayload).toHaveProperty('persona_anchors')
    const anchors = userPayload.persona_anchors as Array<{
      anchor_id: string
      ordered_atom_ids: string[]
    }>
    expect(anchors.length).toBe(1)
    expect(anchors[0]!.anchor_id).toBe('anchor.web-builder.default')
    expect(anchors[0]!.ordered_atom_ids[0]).toBe('atom.common.scaffold-with-v0')
  })

  it('places anchor atoms at the head of the plan in their declared order', async () => {
    fetchCurrentAtomsMock.mockResolvedValue(buildWebBuilderCatalog())
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      // Mode B matches leaves to anchor atoms, but in REVERSED order to
      // simulate an AI that returns reasonable matches but not the
      // curated anchor sequence. The compiler is expected to re-thread
      // them so anchor[0] is plan[0].
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.web-builder.deploy-with-vercel-cli' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: 'atom.web-builder.choose-project-goal' },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: 'atom.common.scaffold-with-v0' },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    // Anchor declared order is [scaffold-with-v0, choose-project-goal,
    // let-claude-build-everything, deploy-with-vercel-cli,
    // delegate-full-feature-to-cli-agent]. Mode B surfaced 3 of them so
    // those 3 must lead the plan in anchor order; the missing 2 must be
    // injected (also in anchor order) so the full curated 5-step path is
    // present at the head.
    const planIds = plan!.steps.map((s) => s.atomId)
    const headIds = planIds.slice(0, 5)
    expect(headIds).toEqual([...WEB_BUILDER_ANCHOR_ATOMS])
  })

  it('injects anchor atoms that Mode B failed to surface (curated path guaranteed)', async () => {
    fetchCurrentAtomsMock.mockResolvedValue(buildWebBuilderCatalog())
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          // Mode B emits only delegation nodes — completely ignores the
          // anchor. The compiler must inject all 5 anchor atoms.
          assignments: [
            {
              leaf_task_id: 'leaf-scaffold',
              matched_atom_id: null,
              recommended_tool: 'v0',
              delegation_brief: 'do',
            },
            { leaf_task_id: 'leaf-goal', matched_atom_id: null },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: null },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    const planIds = plan!.steps.map((s) => s.atomId)
    // First 5 steps MUST be the anchor atoms in anchor order.
    expect(planIds.slice(0, 5)).toEqual([...WEB_BUILDER_ANCHOR_ATOMS])
    // After the 5 anchor steps, the original delegation steps survive.
    expect(planIds.length).toBeGreaterThanOrEqual(5)

    // Telemetry surfaces the injection count.
    expect(plan!.telemetry?.anchor_atom_count).toBe(5)
    expect(plan!.telemetry?.anchor_injected_count).toBe(5)
  })

  it('does not double-inject anchor atoms already matched by Mode B', async () => {
    fetchCurrentAtomsMock.mockResolvedValue(buildWebBuilderCatalog())
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          // Mode B surfaces 3 of the 5 anchor atoms; the remaining 2
          // must be injected.
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.common.scaffold-with-v0' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: 'atom.web-builder.choose-project-goal' },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: 'atom.web-builder.deploy-with-vercel-cli' },
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
    const planIds = plan!.steps.map((s) => s.atomId)
    expect(planIds.slice(0, 5)).toEqual([...WEB_BUILDER_ANCHOR_ATOMS])
    // Same atom must not appear twice in the plan.
    expect(new Set(planIds).size).toBe(planIds.length)
    expect(plan!.telemetry?.anchor_atom_count).toBe(5)
    expect(plan!.telemetry?.anchor_injected_count).toBe(2)
  })

  it('skips anchor atoms that are not in the catalog (no synthetic step from missing record)', async () => {
    // Catalog only has the first anchor atom; the rest are missing.
    fetchCurrentAtomsMock.mockResolvedValue([
      makeAtom({
        atomId: 'atom.common.scaffold-with-v0',
        title: 'scaffold',
        personaTags: ['web-builder'],
        goalTags: ['any-web-project'],
      }),
    ])
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.common.scaffold-with-v0' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: null },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: null },
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
    // Only one anchor atom is in the catalog — the 4 missing ones must
    // NOT be invented as fake steps. The plan starts with the matched
    // anchor atom and continues with whatever Mode B emitted.
    expect(plan!.steps[0]!.atomId).toBe('atom.common.scaffold-with-v0')
    // Telemetry: anchor_atom_count counts only catalog-present anchor
    // atoms (1), anchor_injected_count is 0 (no injection needed).
    expect(plan!.telemetry?.anchor_atom_count).toBe(1)
    expect(plan!.telemetry?.anchor_injected_count).toBe(0)
  })

  it('falls back gracefully when no anchor is configured for the persona', async () => {
    // Persona without an anchor (e.g. a persona that has no DB / yaml
    // anchor). The compiler must not crash and must produce a plan
    // identical to the pre-TQ-255 behaviour.
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    fetchUserPersonaIdsMock.mockResolvedValue(['persona.unsupported'])
    fetchCurrentAtomsMock.mockResolvedValue([
      // Use the same persona tag as the input so the catalog filter does
      // not strip the atom — otherwise prepareAtomCompilerContext returns
      // null because the candidate catalog is empty (an unrelated
      // pre-TQ-255 behaviour, not what we're testing here).
      makeAtom({
        atomId: 'atom.foo',
        title: 'Foo',
        personaTags: ['unsupported'],
        goalTags: ['any-web-project'],
      }),
    ])
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.foo' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: null },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: null },
          ],
          overall_rationale: 'r',
        }),
      )

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.unsupported'],
    })

    expect(plan).not.toBeNull()
    // No anchor → no injection.
    expect(plan!.telemetry?.anchor_atom_count ?? 0).toBe(0)
    expect(plan!.telemetry?.anchor_injected_count ?? 0).toBe(0)
    // The plan should still respect Mode A's tree-traversal order.
    expect(plan!.steps[0]!.atomId).toBe('atom.foo')
  })

  it('places scaffold-with-v0 at step 0 for a web-builder learner regardless of Mode B output', async () => {
    // This is the headline contract from the TQ-255 brief: "test fixture
    // で「scaffold-with-v0」が常に 1 step 目に来る".
    fetchCurrentAtomsMock.mockResolvedValue(buildWebBuilderCatalog())
    fetchWithRetryMock
      .mockResolvedValueOnce(jsonResponse(SAMPLE_GOAL_TREE))
      .mockResolvedValueOnce(
        jsonResponse({
          // Mode B explicitly puts deploy first (anti-anchor).
          assignments: [
            { leaf_task_id: 'leaf-scaffold', matched_atom_id: 'atom.web-builder.deploy-with-vercel-cli' },
            { leaf_task_id: 'leaf-goal', matched_atom_id: null },
            { leaf_task_id: 'leaf-deploy', matched_atom_id: 'atom.common.scaffold-with-v0' },
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
    expect(plan!.steps[0]!.atomId).toBe('atom.common.scaffold-with-v0')
  })
})
