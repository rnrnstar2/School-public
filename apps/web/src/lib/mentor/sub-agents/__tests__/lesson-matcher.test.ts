/**
 * Lesson-Fit Matcher sub-agent unit tests — TQ-231.
 *
 * 検証範囲:
 * - 確定論 scoring (deterministicMatchLessons)
 *   - capability output 一致 +50
 *   - title overlap +
 *   - persona 一致 +10
 *   - prereq 未充足ペナルティ
 *   - completed atom ペナルティ
 *   - 閾値未満 → gap として返す
 *   - 候補 atom が空集合 → 全 leaf を gap
 * - sub-agent class
 *   - model resolution（router 経由 / override / kill-switch）
 *   - estimatedMinutesByLeafId が path-planner 互換
 *   - lastRun summary
 *   - match 注入で I/O 完全置換できる
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import {
  LessonMatcherSubAgent,
  deterministicMatchLessons,
  type LessonCandidateAtom,
  type LessonMatcherInput,
} from '@/lib/mentor/sub-agents/lesson-matcher'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_LESSON_MATCHER',
]

const SAMPLE_TREE: GoalTreeDecomposition = {
  goal_summary: 'LP を作って公開する',
  objectives: [
    {
      id: 'obj-1',
      title: '見た目',
      milestones: [
        {
          id: 'ms-1',
          title: 'ヒーロー',
          leafTasks: [
            {
              id: 'leaf-deploy',
              title: 'Vercel に Deploy',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'deploy',
            },
            {
              id: 'leaf-design',
              title: 'デザインを決める',
              human_judgment_required: true,
              automation_potential: 'low',
            },
          ],
        },
      ],
    },
  ],
}

function makeAtom(over: Partial<LessonCandidateAtom> = {}): LessonCandidateAtom {
  return {
    atomId: 'atom-deploy-001',
    title: 'Vercel デプロイ入門',
    goalTags: ['any-web-project'],
    personaTags: ['p-web'],
    capabilityOutputs: ['deploy'],
    hardPrerequisites: [],
    estimatedMinutes: 30,
    similarity: 0.6,
    ...over,
  }
}

function buildInput(over: Partial<LessonMatcherInput> = {}): LessonMatcherInput {
  return {
    goalTree: SAMPLE_TREE,
    candidateAtoms: [makeAtom()],
    learnerProfile: {
      personaTags: ['p-web'],
      completedAtomIds: [],
    },
    ...over,
  }
}

describe('deterministicMatchLessons — TQ-231 scoring', () => {
  it('matches a leaf when capability output aligns and atom score crosses threshold', async () => {
    const out = await deterministicMatchLessons(buildInput())
    const deployMatch = out.matches.find((m) => m.leafId === 'leaf-deploy')
    expect(deployMatch).toBeTruthy()
    expect(deployMatch?.atomId).toBe('atom-deploy-001')
    expect(deployMatch?.score).toBeGreaterThanOrEqual(45)
    expect(deployMatch?.estimatedMinutes).toBe(30)
    expect(deployMatch?.reasons.some((r) => r.startsWith('capability:'))).toBe(true)
  })

  it('records a gap for a leaf with no matching capability', async () => {
    const out = await deterministicMatchLessons(buildInput())
    const designGap = out.gaps.find((g) => g.leafId === 'leaf-design')
    expect(designGap).toBeTruthy()
    expect(designGap?.reason).toBeTruthy()
  })

  it('returns all leaves as gaps when candidateAtoms is empty', async () => {
    const out = await deterministicMatchLessons(
      buildInput({ candidateAtoms: [] }),
    )
    expect(out.matches).toEqual([])
    expect(out.gaps.map((g) => g.leafId).sort()).toEqual(['leaf-deploy', 'leaf-design'].sort())
    expect(out.gaps[0]?.reason).toContain('候補 atom が空')
  })

  it('penalizes already-completed atoms', async () => {
    const out = await deterministicMatchLessons(
      buildInput({
        learnerProfile: {
          personaTags: ['p-web'],
          completedAtomIds: ['atom-deploy-001'],
        },
      }),
    )
    const m = out.matches.find((m) => m.leafId === 'leaf-deploy')
    expect(m?.reasons).toContain('already-completed')
    // 50(capability) + 10(persona) + 5(foundation) + similarity ~9 - 10(completed) = ~64 → still match
    expect(m?.score).toBeGreaterThanOrEqual(45)
  })

  it('penalizes unmet hard prerequisites', async () => {
    const atom = makeAtom({ hardPrerequisites: ['atom-prereq-x'] })
    const out = await deterministicMatchLessons(
      buildInput({ candidateAtoms: [atom] }),
    )
    const deployMatch = out.matches.find((m) => m.leafId === 'leaf-deploy')
    if (deployMatch) {
      expect(deployMatch.reasons.some((r) => r.startsWith('prereq-missing'))).toBe(true)
    } else {
      const gap = out.gaps.find((g) => g.leafId === 'leaf-deploy')
      expect(gap).toBeTruthy()
    }
  })

  it('treats prereq as satisfied if listed in satisfiedPrerequisiteIds', async () => {
    const atom = makeAtom({ hardPrerequisites: ['atom-prereq-x'] })
    const out = await deterministicMatchLessons(
      buildInput({
        candidateAtoms: [atom],
        learnerProfile: {
          personaTags: ['p-web'],
          satisfiedPrerequisiteIds: ['atom-prereq-x'],
        },
      }),
    )
    const m = out.matches.find((m) => m.leafId === 'leaf-deploy')
    expect(m).toBeTruthy()
    expect(m?.reasons.some((r) => r.startsWith('prereq-missing'))).toBe(false)
  })

  it('honors a custom scoreThreshold', async () => {
    // 高い閾値 → match なし
    const out = await deterministicMatchLessons(buildInput({ scoreThreshold: 999 }))
    expect(out.matches).toEqual([])
    expect(out.gaps.length).toBeGreaterThan(0)
    // gap reason は閾値情報を含む
    const deployGap = out.gaps.find((g) => g.leafId === 'leaf-deploy')
    expect(deployGap?.reason).toContain('999')
  })

  it('clamps score within 0..100', async () => {
    const atom = makeAtom({
      capabilityOutputs: ['deploy'],
      similarity: 1.0,
      goalTags: ['any-web-project'],
    })
    const out = await deterministicMatchLessons(buildInput({ candidateAtoms: [atom] }))
    const deploy = out.matches.find((m) => m.leafId === 'leaf-deploy')
    expect(deploy?.score).toBeLessThanOrEqual(100)
    expect(deploy?.score).toBeGreaterThanOrEqual(0)
  })
})

describe('LessonMatcherSubAgent — TQ-231 sub-agent class', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ROLE_ENV_KEYS) {
      originalEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ROLE_ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k]
      else process.env[k] = originalEnv[k]
    }
    vi.restoreAllMocks()
  })

  it('returns matches / gaps / estimatedMinutes / summary', async () => {
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run(buildInput())
    expect(out.matches.length).toBeGreaterThan(0)
    expect(out.summary.ok).toBe(true)
    expect(out.summary.model).toBe('zai:glm-5.1')
    expect(out.summary.mode).toBe('deterministic')
    expect(out.summary.candidateCount).toBe(1)
    expect(out.summary.matchCount).toBe(out.matches.length)
    expect(out.summary.gapCount).toBe(out.gaps.length)
    // path-planner 互換 map
    expect(out.estimatedMinutesByLeafId['leaf-deploy']).toBe(30)
  })

  it('exposes lastRun', async () => {
    const subAgent = new LessonMatcherSubAgent()
    expect(subAgent.lastRun).toBeNull()
    await subAgent.run(buildInput())
    expect(subAgent.lastRun?.ok).toBe(true)
  })

  it('honors model override via deps.model', async () => {
    const subAgent = new LessonMatcherSubAgent({
      model: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
    })
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('anthropic:claude-haiku-4-5-20251001')
  })

  it('honors MENTOR_MODEL_FALLBACK_ALL_GLM', async () => {
    process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('zai:glm-5.1')
  })

  it('honors MENTOR_MODEL_LESSON_MATCHER per-role override', async () => {
    process.env.MENTOR_MODEL_LESSON_MATCHER = 'anthropic:claude-sonnet-4-6'
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
  })

  it('lets tests substitute the matching function entirely', async () => {
    const match = vi.fn().mockResolvedValue({
      matches: [
        {
          leafId: 'leaf-x',
          atomId: 'atom-x',
          score: 88,
          reasons: ['stubbed'],
          estimatedMinutes: 12,
        },
      ],
      gaps: [],
      mode: 'llm-augmented',
    })
    const subAgent = new LessonMatcherSubAgent({ match })
    const out = await subAgent.run(buildInput())
    expect(match).toHaveBeenCalledTimes(1)
    expect(out.matches[0]?.atomId).toBe('atom-x')
    expect(out.summary.mode).toBe('llm-augmented')
    expect(out.estimatedMinutesByLeafId['leaf-x']).toBe(12)
  })

  it('catches match errors and surfaces via summary', async () => {
    const match = vi.fn().mockRejectedValue(new Error('matcher_boom'))
    const subAgent = new LessonMatcherSubAgent({ match })
    const out = await subAgent.run(buildInput())
    expect(out.summary.ok).toBe(false)
    expect(out.summary.errorMessage).toBe('matcher_boom')
    expect(out.matches).toEqual([])
    expect(out.gaps).toEqual([])
  })
})
