/**
 * TQ-220: tests for the AI plan compiler's per-step tool assignment.
 *
 * Covers:
 * - `buildToolCatalogForPrompt()` filters by cliFamiliarity / cost / owned tools
 * - `buildAtomPlanFromGoalWithAI()` propagates AI-supplied tool assignments to
 *   the resulting `AtomPlanStep.recommendedTool` / `delegationBrief` fields
 * - Unknown tool ids are dropped silently (catalog drift safety)
 * - Older AI responses without `atom_tool_assignments` produce steps with null
 *   tool fields (backward compatibility)
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

import {
  buildAtomPlanFromGoalWithAI,
  buildToolCatalogForPrompt,
} from '../ai-atom-compiler'

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

describe('TQ-220: buildToolCatalogForPrompt', () => {
  it('drops the freeform "other" entry — model cannot use it as a real tool', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'basic',
      aiTools: [],
    })
    expect(catalog.find((entry) => entry.id === 'other')).toBeUndefined()
  })

  it('drops paid-high tools by default for individual learners', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'basic',
      aiTools: [],
    })
    expect(catalog.find((entry) => entry.id === 'devin')).toBeUndefined()
  })

  it('drops CLI-only tools when cliFamiliarity is low (non-engineer first)', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'low',
      aiTools: [],
    })
    expect(catalog.find((entry) => entry.id === 'claude-code')).toBeUndefined()
    expect(catalog.find((entry) => entry.id === 'codex')).toBeUndefined()
    expect(catalog.find((entry) => entry.id === 'gemini-cli')).toBeUndefined()
  })

  it('keeps browser-builder entries (v0 / bolt / lovable) for low CLI users', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'low',
      aiTools: [],
    })
    expect(catalog.find((entry) => entry.id === 'v0')).toBeDefined()
    expect(catalog.find((entry) => entry.id === 'bolt')).toBeDefined()
    expect(catalog.find((entry) => entry.id === 'lovable')).toBeDefined()
  })

  it('always keeps owned tools even when cliFamiliarity is low', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'low',
      aiTools: ['claude-code'],
    })
    expect(catalog.find((entry) => entry.id === 'claude-code')).toBeDefined()
  })

  it('only exposes lean fields (id / label / category / use cases / cost / strengths)', () => {
    const catalog = buildToolCatalogForPrompt({
      cliFamiliarity: 'basic',
      aiTools: [],
    })
    const sample = catalog[0]!
    expect(sample).toHaveProperty('id')
    expect(sample).toHaveProperty('label')
    expect(sample).toHaveProperty('category')
    expect(sample).toHaveProperty('primaryUseCases')
    expect(sample).toHaveProperty('nonEngineerFriendliness')
    expect(sample).toHaveProperty('costTier')
    expect(sample).toHaveProperty('strengths')
    // Should not leak the launch steps / homepage to the prompt
    expect(sample).not.toHaveProperty('homepage')
    expect(sample).not.toHaveProperty('steps')
    expect(sample).not.toHaveProperty('launchSteps')
  })
})

describe('TQ-220: buildAtomPlanFromGoalWithAI propagates tool assignments', () => {
  // TQ-220 tests describe the LEGACY single-mode contract (one prompt
  // call selecting atoms + assigning tools). TQ-215 made the default
  // pipeline 2-mode (Goal Tree → atom match), so we pin these tests to
  // legacy mode via the documented env flag. New 2-mode tests live in
  // ai-atom-compiler-two-mode.spec.ts.
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

  function mockAiResponse(payload: unknown) {
    fetchWithRetryMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify(payload) },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
  }

  it('persists recommendedTool / delegationBrief from atom_tool_assignments', async () => {
    const atoms = [
      makeAtom({
        atomId: 'atom.ui.scaffold',
        title: 'UI scaffold',
      }),
      makeAtom({
        atomId: 'atom.deploy.vercel',
        title: 'Vercel deploy',
      }),
    ]
    fetchCurrentAtomsMock.mockResolvedValue(atoms)
    mockAiResponse({
      selected_atom_ids: ['atom.ui.scaffold', 'atom.deploy.vercel'],
      milestones: [
        {
          id: 'ms-000',
          title: 'UI を作る',
          description: '見た目を組む',
          atom_ids: ['atom.ui.scaffold', 'atom.deploy.vercel'],
        },
      ],
      atom_rationales: {
        'atom.ui.scaffold': 'UI を最短で組むため',
        'atom.deploy.vercel': '公開して検証するため',
      },
      atom_tool_assignments: {
        'atom.ui.scaffold': {
          recommended_tool: 'v0',
          delegation_brief:
            'Tailwind ベースで LP を 1 ページ作って。ヒーローと CTA を含めて。',
        },
        'atom.deploy.vercel': {
          recommended_tool: 'claude-code',
          delegation_brief: 'このリポを Vercel にデプロイする手順を実行して。',
        },
      },
      overall_rationale: 'UI → deploy の最短導線',
      estimated_total_minutes: 60,
    })

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'LP を作って公開したい',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      learnerState: {
        skillLevel: 'beginner',
        signals: { cli_familiarity: 'low', ai_tools: ['v0', 'claude-code'] },
      },
    })

    expect(plan).not.toBeNull()
    const uiStep = plan!.steps.find((s) => s.atomId === 'atom.ui.scaffold')!
    const deployStep = plan!.steps.find((s) => s.atomId === 'atom.deploy.vercel')!
    expect(uiStep.recommendedTool).toBe('v0')
    expect(uiStep.delegationBrief).toContain('Tailwind')
    expect(deployStep.recommendedTool).toBe('claude-code')
    expect(deployStep.delegationBrief).toContain('Vercel')
  })

  it('drops unknown tool ids and nullifies the delegation brief', async () => {
    const atoms = [
      makeAtom({ atomId: 'atom.foo', title: 'Foo' }),
    ]
    fetchCurrentAtomsMock.mockResolvedValue(atoms)
    mockAiResponse({
      selected_atom_ids: ['atom.foo'],
      milestones: [
        {
          id: 'ms-000',
          title: 'M',
          description: '',
          atom_ids: ['atom.foo'],
        },
      ],
      atom_rationales: { 'atom.foo': 'because' },
      atom_tool_assignments: {
        'atom.foo': {
          // Hallucinated tool id (not in catalog).
          recommended_tool: 'magicgpt-9000',
          delegation_brief: '何かをやって',
        },
      },
      overall_rationale: 'r',
      estimated_total_minutes: 15,
    })

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'g',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    const step = plan!.steps[0]!
    expect(step.recommendedTool).toBeNull()
    // brief is dropped when the tool is rejected — would dangle otherwise.
    expect(step.delegationBrief).toBeNull()
  })

  it('falls back to null tools when AI omits atom_tool_assignments (back-compat)', async () => {
    const atoms = [
      makeAtom({ atomId: 'atom.bar', title: 'Bar' }),
    ]
    fetchCurrentAtomsMock.mockResolvedValue(atoms)
    mockAiResponse({
      selected_atom_ids: ['atom.bar'],
      milestones: [
        {
          id: 'ms-000',
          title: 'M',
          description: '',
          atom_ids: ['atom.bar'],
        },
      ],
      atom_rationales: { 'atom.bar': 'because' },
      // No atom_tool_assignments key — older models / offline path.
      overall_rationale: 'r',
      estimated_total_minutes: 15,
    })

    const plan = await buildAtomPlanFromGoalWithAI({
      goal: 'g',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
    })

    expect(plan).not.toBeNull()
    const step = plan!.steps[0]!
    expect(step.recommendedTool).toBeNull()
    expect(step.delegationBrief).toBeNull()
  })

  it('persists the new fields through compiled-plans serialization round-trip', async () => {
    const { buildCompiledPlanSteps, deserializeAtomCompiledPlan } =
      await import('@/lib/compiled-plans')
    const plan = {
      goal: 'g',
      goalTags: ['any-web-project'],
      milestones: [
        {
          id: 'ms-000',
          title: 'M',
          description: 'd',
          atomIds: ['atom.a'],
        },
      ],
      steps: [
        {
          atomId: 'atom.a',
          title: 'A',
          rationale: 'r',
          estimatedMinutes: 10,
          milestoneId: 'ms-000',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
          recommendedTool: 'v0',
          delegationBrief: 'do something',
        },
      ],
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: 'r',
      source: 'ai' as const,
    }
    const persisted = buildCompiledPlanSteps(plan)
    const restored = deserializeAtomCompiledPlan({
      goal: 'g',
      steps: persisted,
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: 'r',
    })
    expect(restored.steps[0]?.recommendedTool).toBe('v0')
    expect(restored.steps[0]?.delegationBrief).toBe('do something')
  })

  it('reads legacy persisted rows (no recommended_tool key) as null', async () => {
    const { deserializeAtomCompiledPlan } = await import('@/lib/compiled-plans')
    const restored = deserializeAtomCompiledPlan({
      goal: 'g',
      steps: [
        {
          atom_id: 'atom.legacy',
          atom_title: 'Legacy',
          milestone_id: 'ms-000',
          milestone_title: 'M',
          milestone_description: 'd',
          sort_order: 1,
          rationale: 'r',
          estimated_minutes: 10,
          prerequisite_atom_ids: [],
          soft_prerequisite_atom_ids: [],
          completed_at: null,
          goal_tags: ['any-web-project'],
          plan_source: 'topo',
          // Note: no recommended_tool / delegation_brief — this is a legacy row.
        },
      ],
      coverageScore: 1,
      unsupportedCapabilities: [],
      rationale: 'r',
    })
    expect(restored.steps[0]?.recommendedTool).toBeNull()
    expect(restored.steps[0]?.delegationBrief).toBeNull()
  })

  it('forwards the filtered ai_tool_catalog in the prompt user message', async () => {
    const atoms = [makeAtom({ atomId: 'atom.baz', title: 'Baz' })]
    fetchCurrentAtomsMock.mockResolvedValue(atoms)
    mockAiResponse({
      selected_atom_ids: ['atom.baz'],
      milestones: [
        { id: 'ms-000', title: 'M', description: '', atom_ids: ['atom.baz'] },
      ],
      atom_rationales: { 'atom.baz': 'r' },
      overall_rationale: 'r',
      estimated_total_minutes: 15,
    })

    await buildAtomPlanFromGoalWithAI({
      goal: 'g',
      goalTags: ['any-web-project'],
      userId: null,
      personaIds: ['persona.web-builder'],
      learnerState: {
        skillLevel: 'beginner',
        signals: { cli_familiarity: 'low' },
      },
    })

    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchWithRetryMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = body.messages.find((m) => m.role === 'user')!
    const userPayload = JSON.parse(userMessage.content) as {
      ai_tool_catalog: Array<{ id: string }>
    }
    expect(userPayload).toHaveProperty('ai_tool_catalog')
    expect(Array.isArray(userPayload.ai_tool_catalog)).toBe(true)
    // Browser-builder entries should be present for low-CLI learner...
    expect(userPayload.ai_tool_catalog.some((t) => t.id === 'v0')).toBe(true)
    // ... and CLI agents should NOT.
    expect(userPayload.ai_tool_catalog.some((t) => t.id === 'claude-code')).toBe(
      false,
    )
  })
})
