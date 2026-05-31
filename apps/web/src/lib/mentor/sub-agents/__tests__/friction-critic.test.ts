/**
 * Non-Engineer Friction Critic sub-agent unit tests — TQ-231.
 *
 * 検証範囲:
 * - heuristic ruleset
 *   - R1 CLI: cli_familiarity 弱 → block / 強 → info
 *   - R2 env / API key → warn
 *   - R3 認証 / OAuth / DNS → warn
 *   - R4 webhook / cron / docker → warn
 *   - R5 human_judgment_required + capability 不在 → info
 *   - R6 automation_potential low + 短い summary → info
 * - sub-agent class
 *   - model resolution（router 経由 / override / kill-switch）
 *   - lastRun summary（severity 別カウント / non_eng_score）
 *   - detect 注入で I/O 完全置換できる
 *   - detect throw 時 ok=false / errorMessage / 空配列フォールバック
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import {
  FrictionCriticSubAgent,
  computeNonEngScore,
  heuristicDetectFrictions,
  type FrictionCriticInput,
} from '@/lib/mentor/sub-agents/friction-critic'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_NON_ENG_CRITIC',
]

function buildTree(leaves: GoalTreeDecomposition['objectives'][number]['milestones'][number]['leafTasks']): GoalTreeDecomposition {
  return {
    objectives: [
      {
        id: 'obj-1',
        title: 'o',
        milestones: [
          {
            id: 'ms-1',
            title: 'm',
            leafTasks: leaves,
          },
        ],
      },
    ],
  }
}

function buildInput(overrides: Partial<FrictionCriticInput> = {}): FrictionCriticInput {
  return {
    goalTree: buildTree([
      {
        id: 'l-1',
        title: 'git push でデプロイ',
        human_judgment_required: false,
        automation_potential: 'high',
        recommended_capability: 'deploy',
      },
    ]),
    learnerProfile: {
      cli_familiarity: 'none',
    },
    ...overrides,
  }
}

describe('computeNonEngScore — TQ-231 score model', () => {
  it('returns 100 when no friction', () => {
    expect(computeNonEngScore({ blockCount: 0, warnCount: 0, infoCount: 0 })).toBe(100)
  })

  it('subtracts severity-weighted penalties', () => {
    expect(computeNonEngScore({ blockCount: 1, warnCount: 1, infoCount: 1 })).toBe(100 - 25 - 10 - 3)
  })

  it('clamps to 0 below floor', () => {
    expect(computeNonEngScore({ blockCount: 10, warnCount: 0, infoCount: 0 })).toBe(0)
  })
})

describe('heuristicDetectFrictions — TQ-231 ruleset', () => {
  it('R1: CLI keyword + cli_familiarity none → block', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-cli',
          title: 'ターミナルで git clone を実行',
          human_judgment_required: false,
          automation_potential: 'high',
        },
      ]),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(out.frictions[0]?.severity).toBe('block')
    expect(out.frictions[0]?.ruleId).toBe('R1.cli-required')
    expect(out.frictions[0]?.alternative_suggestion).toContain('GUI')
  })

  it('R1: CLI keyword + cli_familiarity advanced → info only', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-cli-2',
          title: 'git push でデプロイ',
          human_judgment_required: false,
          automation_potential: 'high',
        },
      ]),
      learnerProfile: { cli_familiarity: 'advanced' },
    })
    const cliFinding = out.frictions.find((f) => f.ruleId?.startsWith('R1'))
    expect(cliFinding?.severity).toBe('info')
  })

  it('R2: API key keyword → warn', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-env',
          title: '.env に API キーを設定',
          human_judgment_required: false,
          automation_potential: 'medium',
        },
      ]),
      learnerProfile: { cli_familiarity: 'medium' },
    })
    const envFinding = out.frictions.find((f) => f.ruleId === 'R2.env-secrets')
    expect(envFinding?.severity).toBe('warn')
  })

  it('R3: OAuth keyword → warn', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-oauth',
          title: 'OAuth でログインを実装',
          human_judgment_required: false,
          automation_potential: 'medium',
        },
      ]),
      learnerProfile: { cli_familiarity: 'medium' },
    })
    const finding = out.frictions.find((f) => f.ruleId === 'R3.auth-dns')
    expect(finding?.severity).toBe('warn')
  })

  it('R4: webhook keyword → warn', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-wh',
          title: 'Stripe webhook を受信',
          human_judgment_required: false,
          automation_potential: 'medium',
        },
      ]),
      learnerProfile: { cli_familiarity: 'medium' },
    })
    const finding = out.frictions.find((f) => f.ruleId === 'R4.infra-jargon')
    expect(finding?.severity).toBe('warn')
  })

  it('R5: human_judgment_required + capability 不在 → info', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-judgment',
          title: 'ブランド色を決める',
          human_judgment_required: true,
          automation_potential: 'low',
        },
      ]),
      learnerProfile: { cli_familiarity: 'medium' },
    })
    const finding = out.frictions.find((f) => f.ruleId === 'R5.judgment-blank')
    expect(finding?.severity).toBe('info')
  })

  it('R6: automation_potential low + 短 summary → info', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-thin',
          title: '何かを書く',
          summary: '短い',
          human_judgment_required: false,
          automation_potential: 'low',
        },
      ]),
      learnerProfile: { cli_familiarity: 'medium' },
    })
    const finding = out.frictions.find((f) => f.ruleId === 'R6.thin-manual')
    expect(finding?.severity).toBe('info')
  })

  it('handles malformed tree gracefully (no leaves)', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: { objectives: [] },
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(out.frictions).toEqual([])
  })

  it('uses planDraft.leafIdToStepId when provided', async () => {
    const out = await heuristicDetectFrictions({
      goalTree: buildTree([
        {
          id: 'l-cli',
          title: 'git push でデプロイ',
          human_judgment_required: false,
          automation_potential: 'high',
        },
      ]),
      learnerProfile: { cli_familiarity: 'none' },
      planDraft: { leafIdToStepId: { 'l-cli': 'step-99' } },
    })
    expect(out.frictions[0]?.step_id).toBe('step-99')
  })
})

describe('FrictionCriticSubAgent — TQ-231 sub-agent class', () => {
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
    it('returns frictions + non_eng_score + summary', async () => {
      const subAgent = new FrictionCriticSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.frictions.length).toBeGreaterThan(0)
      expect(out.non_eng_score).toBeLessThanOrEqual(100)
      expect(out.non_eng_score).toBeGreaterThanOrEqual(0)
      expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
      expect(out.summary.mode).toBe('heuristic')
      expect(out.summary.ok).toBe(true)
      expect(out.summary.leafCount).toBe(1)
    })

    it('exposes lastRun for the Conductor log path', async () => {
      const subAgent = new FrictionCriticSubAgent()
      expect(subAgent.lastRun).toBeNull()
      await subAgent.run(buildInput())
      expect(subAgent.lastRun?.ok).toBe(true)
    })

    it('honors model override via deps.model', async () => {
      const subAgent = new FrictionCriticSubAgent({
        model: { provider: 'zai', model: 'glm-5.1' },
      })
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new FrictionCriticSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_NON_ENG_CRITIC per-role override', async () => {
      process.env.MENTOR_MODEL_NON_ENG_CRITIC = 'anthropic:claude-haiku-4-5-20251001'
      const subAgent = new FrictionCriticSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('anthropic:claude-haiku-4-5-20251001')
    })

    it('counts severity buckets in summary', async () => {
      const detect = vi.fn().mockResolvedValue({
        frictions: [
          { step_id: 'a', severity: 'block', reason: 'x' },
          { step_id: 'b', severity: 'warn', reason: 'y' },
          { step_id: 'c', severity: 'warn', reason: 'z' },
          { step_id: 'd', severity: 'info', reason: 'w' },
        ],
        mode: 'heuristic',
      })
      const subAgent = new FrictionCriticSubAgent({ detect })
      const out = await subAgent.run(buildInput())
      expect(out.summary.blockCount).toBe(1)
      expect(out.summary.warnCount).toBe(2)
      expect(out.summary.infoCount).toBe(1)
      // 100 - 25 - 20 - 3 = 52
      expect(out.non_eng_score).toBe(52)
    })
  })

  describe('failure modes', () => {
    it('catches detect errors and surfaces them via summary.errorMessage', async () => {
      const detect = vi.fn().mockRejectedValue(new Error('boom'))
      const subAgent = new FrictionCriticSubAgent({ detect })
      const out = await subAgent.run(buildInput())
      expect(out.summary.ok).toBe(false)
      expect(out.summary.errorMessage).toBe('boom')
      expect(out.frictions).toEqual([])
      expect(out.non_eng_score).toBe(100) // 0 friction → 100
    })
  })
})
