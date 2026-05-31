/**
 * Tie-Breaker sub-agent unit tests — TQ-237.
 *
 * 検証範囲:
 * - 矛盾検出 helper (`detectConflictingReports`) の境界条件
 *   （0 件 / 1 件 / 同一 recommendation / 低 confidence noise / 複数 topic）
 * - Tie-Breaker mock resolution
 *   （Tech-Stack Scout 優先 + Non-Eng Critic warning 保持 / confidence fallback）
 * - sub-agent 単体: model resolution / latency 計測 / 失敗時 ok=false
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TieBreakerSubAgent,
  detectConflictingReports,
  mockResolveTieBreaker,
  type SubAgentReport,
  type TieBreakerInput,
} from '@/lib/mentor/sub-agents/tie-breaker'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_TIE_BREAKER',
]

function buildInput(
  overrides: Partial<TieBreakerInput> = {},
): TieBreakerInput {
  return {
    conductor_intent: 'ポートフォリオサイトを最短で公開する',
    conflicting_reports: [
      {
        subAgent: 'tech_scout',
        claims: [
          {
            topic: 'framework_choice',
            recommendation: 'next16-required',
            confidence: 0.9,
            rationale: 'Next.js 16 で App Router の挙動が更新された',
          },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [
          {
            topic: 'framework_choice',
            recommendation: 'vercel-direct-deploy',
            confidence: 0.8,
            rationale:
              '非エンジニアは v0 の deploy ボタンが圧倒的に摩擦少',
          },
        ],
      },
    ],
    requestId: 'req-1',
    userId: 'user-1',
    ...overrides,
  }
}

describe('detectConflictingReports — TQ-237', () => {
  it('returns empty when reports list is empty', () => {
    expect(detectConflictingReports([])).toEqual([])
  })

  it('returns empty when only one report mentions the topic', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [
          { topic: 'framework_choice', recommendation: 'next16', confidence: 0.9 },
        ],
      },
    ]
    expect(detectConflictingReports(reports)).toEqual([])
  })

  it('returns empty when all sub-agents agree on the same recommendation', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [
          { topic: 'framework_choice', recommendation: 'next16', confidence: 0.9 },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [
          { topic: 'framework_choice', recommendation: 'next16', confidence: 0.7 },
        ],
      },
    ]
    expect(detectConflictingReports(reports)).toEqual([])
  })

  it('detects conflict when sub-agents disagree on the same topic', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [
          {
            topic: 'framework_choice',
            recommendation: 'next16-required',
            confidence: 0.9,
          },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [
          {
            topic: 'framework_choice',
            recommendation: 'vercel-direct-deploy',
            confidence: 0.8,
          },
        ],
      },
    ]
    const conflicts = detectConflictingReports(reports)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].topic).toBe('framework_choice')
    expect(conflicts[0].positions).toHaveLength(2)
    const subAgents = conflicts[0].positions.map((p) => p.subAgent).sort()
    expect(subAgents).toEqual(['non_eng_critic', 'tech_scout'])
  })

  it('drops low-confidence claims as noise (<0.3)', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [
          { topic: 'framework_choice', recommendation: 'next16', confidence: 0.9 },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [
          { topic: 'framework_choice', recommendation: 'astro', confidence: 0.1 },
        ],
      },
    ]
    expect(detectConflictingReports(reports)).toEqual([])
  })

  it('handles multiple topics independently', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [
          { topic: 'framework_choice', recommendation: 'next16' },
          { topic: 'deploy_path', recommendation: 'vercel-cli' },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [
          { topic: 'framework_choice', recommendation: 'astro' },
          { topic: 'deploy_path', recommendation: 'vercel-cli' }, // agree
        ],
      },
    ]
    const conflicts = detectConflictingReports(reports)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].topic).toBe('framework_choice')
  })

  it('ignores malformed claims defensively', () => {
    const reports = [
      {
        subAgent: 'tech_scout',
        claims: [
          { topic: 'a', recommendation: 'x' },
          // malformed entries: missing topic / recommendation / wrong types
          { topic: 123 as unknown as string, recommendation: 'y' },
          { topic: 'b', recommendation: 999 as unknown as string },
          null as unknown as { topic: string; recommendation: string },
        ],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [{ topic: 'a', recommendation: 'z' }],
      },
    ] as SubAgentReport[]
    const conflicts = detectConflictingReports(reports)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].topic).toBe('a')
  })

  it('trims whitespace on topic + recommendation', () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'tech_scout',
        claims: [{ topic: ' framework_choice ', recommendation: 'next16 ' }],
      },
      {
        subAgent: 'non_eng_critic',
        claims: [{ topic: 'framework_choice', recommendation: ' next16' }],
      },
    ]
    // trim 後一致するので衝突なし
    expect(detectConflictingReports(reports)).toEqual([])
  })
})

describe('mockResolveTieBreaker — TQ-237', () => {
  it('prefers tech_scout recommendation and retains non_eng_critic as warning', async () => {
    const conflicts = detectConflictingReports(buildInput().conflicting_reports)
    const out = await mockResolveTieBreaker({
      conflicts,
      conductor_intent: 'X',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-opus-4-7' },
    })
    expect(out.mode).toBe('mock')
    expect(out.resolutions).toHaveLength(1)
    const r = out.resolutions[0]
    expect(r.topic).toBe('framework_choice')
    expect(r.picked_sub_agent).toBe('tech_scout')
    expect(r.picked_recommendation).toBe('next16-required')
    expect(r.confidence).toBe(0.9)
    expect(r.warnings).toBeDefined()
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings![0].subAgent).toBe('non_eng_critic')
    expect(r.warnings![0].reason).toContain('Non-Eng Critic')
    expect(out.overall_confidence).toBeCloseTo(0.9, 5)
  })

  it('falls back to highest-confidence position when no tech_scout present', async () => {
    const reports: SubAgentReport[] = [
      {
        subAgent: 'lesson_matcher',
        claims: [
          { topic: 'lesson_pick', recommendation: 'atom-A', confidence: 0.6 },
        ],
      },
      {
        subAgent: 'memory_recall',
        claims: [
          { topic: 'lesson_pick', recommendation: 'atom-B', confidence: 0.85 },
        ],
      },
    ]
    const conflicts = detectConflictingReports(reports)
    const out = await mockResolveTieBreaker({
      conflicts,
      conductor_intent: 'X',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-opus-4-7' },
    })
    expect(out.resolutions[0].picked_sub_agent).toBe('memory_recall')
    expect(out.resolutions[0].picked_recommendation).toBe('atom-B')
    expect(out.resolutions[0].why).toContain('confidence')
  })

  it('returns empty resolutions when no conflicts present', async () => {
    const out = await mockResolveTieBreaker({
      conflicts: [],
      conductor_intent: 'X',
      apiKey: null,
      model: { provider: 'anthropic', model: 'claude-opus-4-7' },
    })
    expect(out.resolutions).toEqual([])
    expect(out.overall_confidence).toBe(0)
  })
})

describe('TieBreakerSubAgent — TQ-237', () => {
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
    it('resolves a conflict via mock resolver and populates run summary', async () => {
      let tick = 1_000
      const subAgent = new TieBreakerSubAgent({
        now: () => {
          const t = tick
          tick += 250
          return t
        },
      })

      const out = await subAgent.run(buildInput())

      expect(out.resolutions).toHaveLength(1)
      expect(out.resolutions[0].topic).toBe('framework_choice')
      expect(out.resolutions[0].picked_sub_agent).toBe('tech_scout')

      expect(out.summary.model).toBe('anthropic:claude-opus-4-7')
      expect(out.summary.ok).toBe(true)
      expect(out.summary.mode).toBe('mock')
      expect(out.summary.conflictCount).toBe(1)
      expect(out.summary.latencyMs).toBeGreaterThan(0)

      // lastRun が露出していること（Conductor の log entry 用）
      expect(subAgent.lastRun).not.toBeNull()
      expect(subAgent.lastRun?.ok).toBe(true)
    })

    it('returns no resolutions when no conflicts are detected', async () => {
      const reports: SubAgentReport[] = [
        {
          subAgent: 'tech_scout',
          claims: [{ topic: 'a', recommendation: 'x', confidence: 0.9 }],
        },
        {
          subAgent: 'non_eng_critic',
          claims: [{ topic: 'a', recommendation: 'x', confidence: 0.7 }],
        },
      ]
      const subAgent = new TieBreakerSubAgent()
      const out = await subAgent.run(
        buildInput({ conflicting_reports: reports }),
      )
      expect(out.resolutions).toEqual([])
      expect(out.overall_confidence).toBe(0)
      expect(out.summary.conflictCount).toBe(0)
      expect(out.summary.ok).toBe(true)
    })

    it('honors a model override via deps.model', async () => {
      const subAgent = new TieBreakerSubAgent({
        model: { provider: 'zai', model: 'glm-5.1' },
      })
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new TieBreakerSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('uses tie_breaker default routing (claude-opus-4-7) without env overrides', async () => {
      const subAgent = new TieBreakerSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('anthropic:claude-opus-4-7')
    })
  })

  describe('failure modes', () => {
    it('catches resolver errors and surfaces them via summary.errorMessage', async () => {
      const resolve = vi.fn().mockRejectedValue(new Error('opus_429'))
      const subAgent = new TieBreakerSubAgent({ resolve })
      const out = await subAgent.run(buildInput())
      expect(out.resolutions).toEqual([])
      expect(out.overall_confidence).toBe(0)
      expect(out.summary.ok).toBe(false)
      expect(out.summary.errorMessage).toBe('opus_429')
    })

    it('does not fail the run when getApiKey lookup throws', async () => {
      const getApiKey = vi.fn().mockRejectedValue(new Error('byok_missing'))
      const subAgent = new TieBreakerSubAgent({ getApiKey })
      const out = await subAgent.run(buildInput())
      // Phase 1 では getApiKey 失敗は log のみ → run は成功
      expect(out.summary.ok).toBe(true)
      expect(getApiKey).toHaveBeenCalledTimes(1)
    })

    it('passes apiKey to the resolver when getApiKey succeeds', async () => {
      const resolve = vi.fn().mockResolvedValue({
        resolutions: [],
        overall_confidence: 0,
        mode: 'mock' as const,
      })
      const getApiKey = vi.fn().mockResolvedValue('sk-ant-xxx')
      const subAgent = new TieBreakerSubAgent({ resolve, getApiKey })
      await subAgent.run(buildInput())
      expect(getApiKey).toHaveBeenCalledWith('anthropic')
      expect(resolve).toHaveBeenCalledTimes(1)
      const call = resolve.mock.calls[0][0]
      expect(call.apiKey).toBe('sk-ant-xxx')
      expect(call.conductor_intent).toBe(
        'ポートフォリオサイトを最短で公開する',
      )
    })
  })

  describe('CoT leak guard (Anti-pattern 6)', () => {
    it('does not include raw thinking traces in the public output', async () => {
      const subAgent = new TieBreakerSubAgent()
      const out = await subAgent.run(buildInput())
      // 公開 output は構造化フィールドのみ。raw CoT を保持するキーは無い
      const publicKeys = Object.keys(out)
      expect(publicKeys).toEqual(
        expect.arrayContaining(['resolutions', 'overall_confidence', 'summary']),
      )
      // 念のため: resolution にも生 CoT 用フィールドが追加されていないこと
      for (const r of out.resolutions) {
        expect(r).not.toHaveProperty('thinking')
        expect(r).not.toHaveProperty('chain_of_thought')
        expect(r).not.toHaveProperty('raw_cot')
      }
    })
  })
})
