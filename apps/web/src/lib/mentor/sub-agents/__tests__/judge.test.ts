/**
 * Judge sub-agent unit tests — TQ-236.
 *
 * 検証範囲:
 * - mock heuristic sampler: 4 軸 score の境界条件 + fail_reasons
 *   （ai_utilization / non_eng / shortest / fit）
 * - majorityVoteVerdicts: 3 サンプル合議の畳み込み (score median + reasons union)
 * - sub-agent 単体: model resolution / latency / self-consistency=3 / 失敗時 ok=false
 * - recommendAction 分岐 (commit / iterate)
 * - CoT 漏洩ガード
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JudgeSubAgent,
  majorityVoteVerdicts,
  mockSampleJudge,
  type JudgeInput,
  type JudgeSample,
  type JudgeSamplerFn,
} from '@/lib/mentor/sub-agents/judge'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

const ROLE_ENV_KEYS = ['MENTOR_MODEL_FALLBACK_ALL_GLM', 'MENTOR_MODEL_JUDGE']

function buildPlan(overrides: Partial<AtomCompiledPlan> = {}): AtomCompiledPlan {
  return {
    goal: 'ポートフォリオサイトを最短で公開する',
    goalTags: ['any-web-project', 'website-launch'],
    steps: [
      {
        atomId: 'atom-1',
        title: 'v0 で初期 LP を生成',
        rationale: 'AI に任せて時短',
        estimatedMinutes: 30,
        milestoneId: 'ms-0',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'v0',
        delegationBrief: 'v0 にレイアウト案を 3 つ生成させる',
      },
      {
        atomId: 'atom-2',
        title: 'Claude Code でテキスト調整',
        rationale: 'コピーを練り直し',
        estimatedMinutes: 20,
        milestoneId: 'ms-0',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'claude-code',
        delegationBrief: '見出しと本文を 3 案出させる',
      },
      {
        atomId: 'atom-3',
        title: 'Vercel に deploy',
        rationale: '本番公開',
        estimatedMinutes: 10,
        milestoneId: 'ms-1',
        prerequisiteAtomIds: ['atom-1'],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'vercel',
        delegationBrief: 'GitHub 連携 → Vercel deploy ボタン',
      },
    ],
    milestones: [
      { id: 'ms-0', title: 'デザインを組む', description: 'AI で初期生成 → 微調整', atomIds: ['atom-1', 'atom-2'] },
      { id: 'ms-1', title: '公開', description: 'Vercel に deploy', atomIds: ['atom-3'] },
    ],
    coverageScore: 0.85,
    unsupportedCapabilities: [],
    rationale: 'AI 活用で最短到達',
    source: 'ai',
    ...overrides,
  }
}

function buildInput(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    planDraft: buildPlan(),
    rubric: 'plan-quality-v1',
    requestId: 'req-1',
    userId: 'user-1',
    ...overrides,
  }
}

describe('mockSampleJudge — TQ-236', () => {
  it('rewards plans with rich AI-tool keywords on ai_utilization axis', async () => {
    const sample = await mockSampleJudge({
      planDraft: buildPlan(),
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const ai = sample.verdicts.find((v) => v.dim === 'ai_utilization')
    expect(ai).toBeDefined()
    expect(ai!.score).toBeGreaterThanOrEqual(8) // v0 + claude code + claude + vercel hits >=3
    expect(ai!.fail_reasons).toEqual([])
  })

  it('penalises plans without any AI-tool keywords on ai_utilization axis', async () => {
    const sample = await mockSampleJudge({
      planDraft: buildPlan({
        goal: 'ホームページを公開する',
        rationale: '手動で組み立てる',
        steps: [
          {
            atomId: 'atom-1',
            title: '画面を組み立てる',
            rationale: '手動',
            estimatedMinutes: 60,
            milestoneId: 'ms-0',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
            recommendedTool: null,
            delegationBrief: null,
          },
        ],
        milestones: [{ id: 'ms-0', title: '組み立て', description: 'ページ作成', atomIds: ['atom-1'] }],
      }),
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const ai = sample.verdicts.find((v) => v.dim === 'ai_utilization')
    expect(ai!.score).toBeLessThan(7)
    expect(ai!.fail_reasons.length).toBeGreaterThan(0)
  })

  it('penalises non_eng axis when CLI keywords abound', async () => {
    const cliPlan = buildPlan({
      steps: [
        {
          atomId: 'atom-cli-1',
          title: 'pnpm install',
          rationale: 'パッケージ install',
          estimatedMinutes: 5,
          milestoneId: 'ms-0',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
          recommendedTool: null,
          delegationBrief: 'ターミナルで pnpm install',
        },
        {
          atomId: 'atom-cli-2',
          title: 'git push',
          rationale: 'ソースを push',
          estimatedMinutes: 5,
          milestoneId: 'ms-0',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
          recommendedTool: null,
          delegationBrief: 'コマンドで git push origin main',
        },
        {
          atomId: 'atom-cli-3',
          title: 'docker run',
          rationale: 'コンテナ起動',
          estimatedMinutes: 5,
          milestoneId: 'ms-0',
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
          recommendedTool: null,
          delegationBrief: 'ターミナルで docker run',
        },
      ],
    })
    const sample = await mockSampleJudge({
      planDraft: cliPlan,
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const ne = sample.verdicts.find((v) => v.dim === 'non_eng')
    expect(ne!.score).toBeLessThan(7)
    expect(ne!.fail_reasons[0]).toContain('CLI')
  })

  it('rewards shortest axis on lean step counts and low skipped ratio', async () => {
    const sample = await mockSampleJudge({
      planDraft: buildPlan(),
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const sh = sample.verdicts.find((v) => v.dim === 'shortest')
    expect(sh!.score).toBeGreaterThanOrEqual(7)
  })

  it('penalises shortest axis when skipped ratio is high', async () => {
    const skippedPlan = buildPlan({
      steps: Array.from({ length: 5 }, (_, i) => ({
        atomId: `atom-${i}`,
        title: `step ${i}`,
        rationale: 'r',
        estimatedMinutes: 10,
        milestoneId: 'ms-0',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        skipped: i < 3, // 3/5 = 60% skipped
      })),
    })
    const sample = await mockSampleJudge({
      planDraft: skippedPlan,
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const sh = sample.verdicts.find((v) => v.dim === 'shortest')
    expect(sh!.score).toBeLessThan(7)
    expect(sh!.fail_reasons[0]).toContain('skipped')
  })

  it('hits floor on shortest axis when steps are empty', async () => {
    const emptyPlan = buildPlan({ steps: [] })
    const sample = await mockSampleJudge({
      planDraft: emptyPlan,
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const sh = sample.verdicts.find((v) => v.dim === 'shortest')
    expect(sh!.score).toBe(1)
    expect(sh!.fail_reasons.length).toBeGreaterThan(0)
  })

  it('rewards fit axis on high coverageScore and zero unsupported', async () => {
    const sample = await mockSampleJudge({
      planDraft: buildPlan({ coverageScore: 0.9, unsupportedCapabilities: [] }),
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const f = sample.verdicts.find((v) => v.dim === 'fit')
    expect(f!.score).toBe(9)
    expect(f!.fail_reasons).toEqual([])
  })

  it('penalises fit axis on low coverageScore', async () => {
    const sample = await mockSampleJudge({
      planDraft: buildPlan({ coverageScore: 0.2, unsupportedCapabilities: ['x', 'y'] }),
      rubric: 'plan-quality-v1',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      sampleIndex: 0,
    })
    const f = sample.verdicts.find((v) => v.dim === 'fit')
    expect(f!.score).toBeLessThan(5)
    expect(f!.fail_reasons.length).toBeGreaterThan(0)
  })

  it('produces deterministic sample regardless of sampleIndex', async () => {
    const args = {
      planDraft: buildPlan(),
      rubric: 'plan-quality-v1' as const,
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-sonnet-4-6' } as const,
    }
    const a = await mockSampleJudge({ ...args, sampleIndex: 0 })
    const b = await mockSampleJudge({ ...args, sampleIndex: 2 })
    expect(a.verdicts).toEqual(b.verdicts)
    expect(a.overallScore).toBe(b.overallScore)
  })
})

describe('majorityVoteVerdicts — TQ-236', () => {
  it('returns empty when no samples', () => {
    expect(majorityVoteVerdicts([])).toEqual([])
  })

  it('takes median score and unions fail_reasons across samples', () => {
    const samples: JudgeSample[] = [
      {
        index: 0,
        overallScore: 7,
        verdicts: [
          { dim: 'ai_utilization', score: 9, fail_reasons: [] },
          { dim: 'non_eng', score: 4, fail_reasons: ['CLI 多い'] },
          { dim: 'shortest', score: 8, fail_reasons: [] },
          { dim: 'fit', score: 7, fail_reasons: [] },
        ],
      },
      {
        index: 1,
        overallScore: 7,
        verdicts: [
          { dim: 'ai_utilization', score: 8, fail_reasons: [] },
          { dim: 'non_eng', score: 5, fail_reasons: ['ターミナル必須'] },
          { dim: 'shortest', score: 8, fail_reasons: [] },
          { dim: 'fit', score: 8, fail_reasons: [] },
        ],
      },
      {
        index: 2,
        overallScore: 7,
        verdicts: [
          { dim: 'ai_utilization', score: 8, fail_reasons: [] },
          { dim: 'non_eng', score: 4, fail_reasons: ['CLI 多い'] },
          { dim: 'shortest', score: 9, fail_reasons: [] },
          { dim: 'fit', score: 7, fail_reasons: [] },
        ],
      },
    ]
    const out = majorityVoteVerdicts(samples)
    // 出力順は固定 (ai_utilization, non_eng, shortest, fit)
    expect(out.map((v) => v.dim)).toEqual(['ai_utilization', 'non_eng', 'shortest', 'fit'])
    // median(8, 9, 8) = 8 ; median(4, 5, 4) = 4 ; median(8, 8, 9) = 8 ; median(7, 8, 7) = 7
    expect(out.find((v) => v.dim === 'ai_utilization')!.score).toBe(8)
    expect(out.find((v) => v.dim === 'non_eng')!.score).toBe(4)
    expect(out.find((v) => v.dim === 'shortest')!.score).toBe(8)
    expect(out.find((v) => v.dim === 'fit')!.score).toBe(7)
    // reasons は union (重複は除く)
    expect(out.find((v) => v.dim === 'non_eng')!.fail_reasons.sort()).toEqual(
      ['CLI 多い', 'ターミナル必須'].sort(),
    )
  })
})

describe('JudgeSubAgent — TQ-236', () => {
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
    it('runs 3 self-consistency samples and resolves a verdict', async () => {
      let tick = 1_000
      const subAgent = new JudgeSubAgent({
        now: () => {
          const t = tick
          tick += 100
          return t
        },
      })
      const out = await subAgent.run(buildInput())

      expect(out.samples).toHaveLength(3)
      expect(out.samples.map((s) => s.index)).toEqual([0, 1, 2])
      expect(out.verdicts.map((v) => v.dim)).toEqual([
        'ai_utilization',
        'non_eng',
        'shortest',
        'fit',
      ])
      expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
      expect(out.summary.ok).toBe(true)
      expect(out.summary.mode).toBe('mock')
      expect(out.summary.n).toBe(3)
      expect(out.summary.rubric).toBe('plan-quality-v1')
      expect(out.summary.latencyMs).toBeGreaterThan(0)
      expect(subAgent.lastRun).not.toBeNull()
      expect(subAgent.lastRun?.ok).toBe(true)
    })

    it('recommends commit when overallScore >= 7 and all dims >= 6', async () => {
      const subAgent = new JudgeSubAgent()
      const out = await subAgent.run(buildInput())
      // healthy plan: AI tools + no CLI + lean steps + coverage 0.85
      expect(out.recommendAction).toBe('commit')
      expect(out.overallScore).toBeGreaterThanOrEqual(7)
      for (const v of out.verdicts) expect(v.score).toBeGreaterThanOrEqual(6)
    })

    it('recommends iterate when any dim drops below 6', async () => {
      const cliPlan = buildPlan({
        coverageScore: 0.2,
        unsupportedCapabilities: ['x'],
        steps: [
          {
            atomId: 'atom-1',
            title: 'pnpm install',
            rationale: 'cli',
            estimatedMinutes: 5,
            milestoneId: 'ms-0',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
            delegationBrief: 'ターミナル + git + docker + ssh + curl',
          },
        ],
      })
      const subAgent = new JudgeSubAgent()
      const out = await subAgent.run(buildInput({ planDraft: cliPlan }))
      expect(out.recommendAction).toBe('iterate')
    })

    it('honors deps.n for self-consistency sample count', async () => {
      const subAgent = new JudgeSubAgent({ n: 5 })
      const out = await subAgent.run(buildInput())
      expect(out.samples).toHaveLength(5)
      expect(out.summary.n).toBe(5)
    })

    it('honors a model override via deps.model', async () => {
      const subAgent = new JudgeSubAgent({
        model: { provider: 'zai', model: 'glm-5.1' },
      })
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new JudgeSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('uses judge default routing (claude-sonnet-4-6) without env overrides', async () => {
      const subAgent = new JudgeSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
    })
  })

  describe('failure modes', () => {
    it('catches sampler errors and surfaces them via summary.errorMessage', async () => {
      const sample: JudgeSamplerFn = vi.fn().mockRejectedValue(new Error('sonnet_429'))
      const subAgent = new JudgeSubAgent({ sample })
      const out = await subAgent.run(buildInput())
      expect(out.verdicts).toEqual([])
      expect(out.samples).toEqual([])
      expect(out.overallScore).toBe(0)
      expect(out.recommendAction).toBe('iterate')
      expect(out.summary.ok).toBe(false)
      expect(out.summary.errorMessage).toBe('sonnet_429')
    })

    it('does not fail the run when getApiKey lookup throws', async () => {
      const getApiKey = vi.fn().mockRejectedValue(new Error('byok_missing'))
      const subAgent = new JudgeSubAgent({ getApiKey })
      const out = await subAgent.run(buildInput())
      expect(out.summary.ok).toBe(true)
      expect(getApiKey).toHaveBeenCalledTimes(1)
      expect(getApiKey).toHaveBeenCalledWith('anthropic')
    })

    it('passes apiKey to the sampler when getApiKey succeeds', async () => {
      const sample: JudgeSamplerFn = vi.fn().mockImplementation(async ({ sampleIndex }) => ({
        index: sampleIndex,
        overallScore: 8,
        verdicts: [
          { dim: 'ai_utilization', score: 8, fail_reasons: [] },
          { dim: 'non_eng', score: 8, fail_reasons: [] },
          { dim: 'shortest', score: 8, fail_reasons: [] },
          { dim: 'fit', score: 8, fail_reasons: [] },
        ],
      }))
      const getApiKey = vi.fn().mockResolvedValue('sk-ant-xxx')
      const subAgent = new JudgeSubAgent({ sample, getApiKey })
      await subAgent.run(buildInput())
      expect(getApiKey).toHaveBeenCalledWith('anthropic')
      expect(sample).toHaveBeenCalledTimes(3)
      const firstCall = (sample as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(firstCall.apiKey).toBe('sk-ant-xxx')
      expect(firstCall.rubric).toBe('plan-quality-v1')
    })
  })

  describe('CoT leak guard (Anti-pattern 6)', () => {
    it('does not include raw thinking traces in the public output', async () => {
      const subAgent = new JudgeSubAgent()
      const out = await subAgent.run(buildInput())
      expect(Object.keys(out)).toEqual(
        expect.arrayContaining([
          'verdicts',
          'samples',
          'overallScore',
          'recommendAction',
          'summary',
        ]),
      )
      for (const v of out.verdicts) {
        expect(v).not.toHaveProperty('thinking')
        expect(v).not.toHaveProperty('chain_of_thought')
        expect(v).not.toHaveProperty('raw_cot')
      }
      for (const s of out.samples) {
        expect(s).not.toHaveProperty('thinking')
        expect(s).not.toHaveProperty('chain_of_thought')
        expect(s).not.toHaveProperty('raw_cot')
      }
    })
  })
})
