/**
 * Goal-Tree Decomposer sub-agent unit tests — TQ-229.
 *
 * 検証範囲:
 * - sub-agent 単体: model resolution / decompose 委譲 / leaf 数計上 / 失敗時 null
 * - Conductor 連携: SCOPING phase delegate として組み込んだとき、HEARING →
 *   SCOPING (sub-agent) → SYNTH の流れで Goal Tree が伝播すること
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import {
  Conductor,
  type ConductorDelegates,
} from '@/lib/mentor/conductor'
import {
  GoalTreeSubAgent,
  type GoalTreeSubAgentInput,
} from '@/lib/mentor/sub-agents/goal-tree'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_GOAL_TREE',
]

const SAMPLE_TREE: GoalTreeDecomposition = {
  goal_summary: 'LP を作って公開する',
  objectives: [
    {
      id: 'obj-000',
      title: '見た目を組む',
      summary: 'まず画面を出す',
      milestones: [
        {
          id: 'ms-000',
          title: '1 ページ目',
          summary: 'ヒーロー + CTA',
          leafTasks: [
            {
              id: 'leaf-000',
              title: 'LP を AI で初期生成',
              summary: 'v0',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
            {
              id: 'leaf-001',
              title: 'トーン決定',
              summary: 'ターゲットを決める',
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
      milestones: [
        {
          id: 'ms-001',
          title: 'Vercel deploy',
          leafTasks: [
            {
              id: 'leaf-002',
              title: 'Vercel に繋ぐ',
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

function buildInput(
  overrides: Partial<GoalTreeSubAgentInput> = {},
): GoalTreeSubAgentInput {
  return {
    goal: 'ポートフォリオサイトを作って公開する',
    hearingResult: {
      keyPoints: ['Next.js 経験あり', '締め切り 2 週間'],
      signals: {
        deadline: '2026-05-31',
        audience: '採用担当者',
        cli_familiarity: 'medium',
        ai_tools: ['v0', 'cursor'],
      },
    },
    learnerProfile: {
      cli_familiarity: 'basic',
      available_ai_tools: ['v0', 'cursor'],
      experience_summary: 'React は触れる',
      skillLevel: 'beginner',
      blockers: [],
      goalTags: ['portfolio', 'any-web-project'],
      mentorMemoryBullets: [],
      completedAtomIds: [],
    },
    requestId: 'req-1',
    userId: 'user-1',
    ...overrides,
  }
}

describe('GoalTreeSubAgent — TQ-229', () => {
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

  describe('happy path', () => {
    it('returns the decomposed tree and a populated run summary', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      let tick = 1_000
      const subAgent = new GoalTreeSubAgent({
        decompose,
        now: () => {
          const t = tick
          tick += 100
          return t
        },
      })

      const out = await subAgent.run(buildInput())

      expect(out.tree).toBe(SAMPLE_TREE)
      expect(out.summary.ok).toBe(true)
      expect(out.summary.leafCount).toBe(3)
      expect(out.summary.latencyMs).toBeGreaterThan(0)
      expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
      expect(decompose).toHaveBeenCalledTimes(1)
      // 学習コンテキストが渡っていることを確認
      const ctx = decompose.mock.calls[0][0]
      expect(ctx.goal).toBe('ポートフォリオサイトを作って公開する')
      expect(ctx.goalTags).toEqual(['portfolio', 'any-web-project'])
      expect(ctx.cliFamiliarity).toBe('medium')
      expect(ctx.aiTools).toEqual(['v0', 'cursor'])
      expect(ctx.deadline).toBe('2026-05-31')
      expect(ctx.audience).toBe('採用担当者')
      expect(ctx.hearingKeyPoints).toEqual(['Next.js 経験あり', '締め切り 2 週間'])
    })

    it('exposes lastRun for the Conductor log path', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      expect(subAgent.lastRun).toBeNull()
      await subAgent.run(buildInput())
      expect(subAgent.lastRun).not.toBeNull()
      expect(subAgent.lastRun?.ok).toBe(true)
      expect(subAgent.lastRun?.leafCount).toBe(3)
    })

    it('honors a model override via deps.model', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({
        decompose,
        model: { provider: 'zai', model: 'glm-5.1' },
      })

      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })
  })

  describe('failure modes', () => {
    it('returns tree=null and ok=false when decompose returns null', async () => {
      const decompose = vi.fn().mockResolvedValue(null)
      const subAgent = new GoalTreeSubAgent({ decompose })

      const out = await subAgent.run(buildInput())
      expect(out.tree).toBeNull()
      expect(out.summary.ok).toBe(false)
      expect(out.summary.leafCount).toBeUndefined()
      // Conductor が SYNTH へ進む際に fallback 判断できる契約
    })

    it('catches decompose errors and surfaces them via summary.errorMessage', async () => {
      const decompose = vi.fn().mockRejectedValue(new Error('zai_503'))
      const subAgent = new GoalTreeSubAgent({ decompose })

      const out = await subAgent.run(buildInput())
      expect(out.tree).toBeNull()
      expect(out.summary.ok).toBe(false)
      expect(out.summary.errorMessage).toBe('zai_503')
    })

    it('does not fail the run when getApiKey lookup throws', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const getApiKey = vi.fn().mockRejectedValue(new Error('byok_missing'))
      const subAgent = new GoalTreeSubAgent({ decompose, getApiKey })

      const out = await subAgent.run(buildInput())
      // Phase 2 では getApiKey 失敗は log のみ → run は成功
      expect(out.summary.ok).toBe(true)
      expect(getApiKey).toHaveBeenCalledTimes(1)
    })
  })

  describe('learner context plumbing', () => {
    it('falls back to profile.cli_familiarity when signals lack the field', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      await subAgent.run(
        buildInput({
          hearingResult: {
            keyPoints: [],
            signals: {}, // no cli_familiarity
          },
          learnerProfile: {
            cli_familiarity: 'none',
            available_ai_tools: ['cursor'],
            experience_summary: null,
          },
        }),
      )
      const ctx = decompose.mock.calls[0][0]
      expect(ctx.cliFamiliarity).toBe('none')
      expect(ctx.aiTools).toEqual(['cursor'])
    })

    it('coerces non-string ai_tools entries out', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      await subAgent.run(
        buildInput({
          hearingResult: {
            keyPoints: [],
            // 意図的に malformed な signal payload (number/null) を混ぜる
            signals: { ai_tools: ['v0', 42, null, 'cursor'] as unknown[] },
          },
        }),
      )
      const ctx = decompose.mock.calls[0][0]
      expect(ctx.aiTools).toEqual(['v0', 'cursor'])
    })
  })

  describe('Conductor SCOPING phase integration', () => {
    it('runs HEARING → SCOPING (sub-agent) → SYNTH and surfaces tree to SYNTH', async () => {
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      const synthInputs: unknown[] = []
      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({
          completed: true,
          payload: {
            keyPoints: ['ヒアリング終わり'],
            signals: { cli_familiarity: 'medium', ai_tools: ['v0'] },
          },
        }),
        scoping: async (_ctx, hearing) => {
          const payload = hearing.payload as {
            keyPoints?: string[]
            signals?: Record<string, unknown>
          }
          const out = await subAgent.run({
            goal: 'ポートフォリオサイトを作って公開する',
            hearingResult: {
              keyPoints: payload.keyPoints,
              signals: payload.signals,
            },
            learnerProfile: {
              cli_familiarity: 'basic',
              available_ai_tools: ['v0'],
              experience_summary: null,
            },
          })
          return { payload: out }
        },
        synth: vi.fn(async (_ctx, scoping) => {
          synthInputs.push(scoping.payload)
          return { payload: { plan: 'draft' } }
        }),
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      const out = await new Conductor().run({
        userId: 'user-1',
        goal: 'ポートフォリオサイトを作って公開する',
        delegates,
      })

      expect(out.finalState).toBe('DONE')
      expect(decompose).toHaveBeenCalledTimes(1)

      // SYNTH delegate が SCOPING 出力 (sub-agent payload) を受け取っていること
      expect(synthInputs).toHaveLength(1)
      const scopingPayload = synthInputs[0] as { tree: GoalTreeDecomposition | null }
      expect(scopingPayload.tree).toBe(SAMPLE_TREE)
    })

    it('TQ-257: SYNTH delegate consumes SCOPING goal_tree without re-running decomposer', async () => {
      // Mirror of the route-side wiring: SCOPING runs the sub-agent (1 call),
      // SYNTH receives `scoping.payload.tree` and forwards it as
      // `precomputedGoalTree`. The decomposer must NOT be invoked again
      // inside SYNTH.
      const decompose = vi.fn().mockResolvedValue(SAMPLE_TREE)
      const subAgent = new GoalTreeSubAgent({ decompose })

      const synthAtomCompilerSpy = vi.fn().mockResolvedValue({ steps: [] })

      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({ completed: true, payload: {} }),
        scoping: async () => {
          const out = await subAgent.run({
            goal: 'X',
            hearingResult: {},
            learnerProfile: {
              cli_familiarity: null,
              available_ai_tools: [],
              experience_summary: null,
            },
          })
          return { payload: out }
        },
        synth: async (_ctx, scoping) => {
          // Cast to the same shape route.ts uses
          const scopingPayload = scoping.payload as
            | { tree: GoalTreeDecomposition | null }
            | null
          await synthAtomCompilerSpy({
            goal: 'X',
            userId: null,
            precomputedGoalTree: scopingPayload?.tree ?? null,
          })
          return { payload: null }
        },
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      await new Conductor().run({ userId: 'u', goal: 'X', delegates })

      // Decomposer ran exactly once across the whole conductor run.
      expect(decompose).toHaveBeenCalledTimes(1)
      // SYNTH received the precomputed tree (TQ-257 wiring).
      expect(synthAtomCompilerSpy).toHaveBeenCalledTimes(1)
      const synthCallArg = synthAtomCompilerSpy.mock.calls[0]![0] as {
        precomputedGoalTree: GoalTreeDecomposition | null
      }
      expect(synthCallArg.precomputedGoalTree).toBe(SAMPLE_TREE)
    })

    it('still proceeds to SYNTH when sub-agent returns tree=null (caller fallback path)', async () => {
      const decompose = vi.fn().mockResolvedValue(null)
      const subAgent = new GoalTreeSubAgent({ decompose })

      const synth = vi.fn().mockResolvedValue({ payload: { plan: 'fallback' } })
      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({ completed: true, payload: {} }),
        scoping: async () => {
          const out = await subAgent.run({
            goal: 'X',
            hearingResult: {},
            learnerProfile: {
              cli_familiarity: null,
              available_ai_tools: [],
              experience_summary: null,
            },
          })
          return { payload: out }
        },
        synth,
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      const out = await new Conductor().run({
        userId: 'u',
        goal: 'X',
        delegates,
      })

      expect(synth).toHaveBeenCalledTimes(1)
      expect(out.finalState).toBe('DONE')
      // SCOPING の payload は sub-agent の output ({tree: null, summary})
      const scopingArg = synth.mock.calls[0][1] as {
        payload: { tree: GoalTreeDecomposition | null }
      }
      expect(scopingArg.payload.tree).toBeNull()
    })
  })
})
