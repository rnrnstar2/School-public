/**
 * AI-Tool Catalog Scout sub-agent unit tests — TQ-234.
 *
 * 検証範囲:
 * - mock resolver: OS / CLI bucket × catalog で recommended_tools が
 *   期待通りに並ぶ
 * - sub-agent 単体: model resolution（owner 確定 default `openai:gpt-5.x`）
 *   / latency 計測 / 失敗時 status='error'
 * - SubAgentReport 互換 shape（agentName / status / summary / latencyMs / model）
 * - getApiKey BYOK フックは Phase 1 では実呼び出しに使わない（log only）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AiToolCatalogScoutSubAgent,
  mockResolveToolScout,
  type AiToolCatalogScoutInput,
} from '@/lib/mentor/sub-agents/tool-scout'
import type { AiToolCatalogEntry } from '@/lib/atoms/ai-tools-catalog'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_TOOL_SCOUT',
]

function buildInput(
  overrides: Partial<AiToolCatalogScoutInput> = {},
): AiToolCatalogScoutInput {
  return {
    learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    requestId: 'req-1',
    userId: 'user-1',
    ...overrides,
  }
}

/**
 * テスト用の最小 catalog。実 catalog とは独立した動作検証のため、
 * kind / nonEngineerFriendliness / primaryUseCases だけ揃えた小規模 fixture。
 */
const TEST_CATALOG: readonly AiToolCatalogEntry[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'CLI agent',
    kind: 'terminal',
    category: 'cli-agent',
    provider: 'anthropic',
    steps: [],
    strengths: ['長い context を扱った大規模リファクタが得意'],
    weaknesses: [],
    cost: { tier: 'paid-mid', notes: 'mock' },
    nonEngineerFriendliness: 2,
    primaryUseCases: ['feature-implementation', 'codebase-refactor'],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'CLI agent',
    kind: 'terminal',
    category: 'cli-agent',
    provider: 'openai',
    steps: [],
    strengths: ['OpenAI モデルを Claude Code 風 workflow で扱える'],
    weaknesses: [],
    cost: { tier: 'usage-based', notes: 'mock' },
    nonEngineerFriendliness: 2,
    primaryUseCases: ['feature-implementation', 'one-shot-task'],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    description: 'IDE agent',
    kind: 'desktop',
    category: 'ide-agent',
    provider: 'cursor',
    steps: [],
    strengths: ['VS Code ベースで GUI 操作のまま AI を使える'],
    weaknesses: [],
    cost: { tier: 'paid-mid', notes: 'mock' },
    nonEngineerFriendliness: 3,
    primaryUseCases: ['feature-implementation', 'pair-programming'],
  },
  {
    id: 'v0',
    label: 'v0',
    description: 'Web builder',
    kind: 'web',
    category: 'browser-builder',
    provider: 'vercel',
    steps: [],
    strengths: ['ブラウザだけで UI を生成できる'],
    weaknesses: [],
    cost: { tier: 'paid-mid', notes: 'mock' },
    nonEngineerFriendliness: 5,
    primaryUseCases: ['scaffold-ui'],
  },
  {
    id: 'replit-agent',
    label: 'Replit Agent',
    description: 'Web builder',
    kind: 'web',
    category: 'browser-builder',
    provider: 'replit',
    steps: [],
    strengths: ['ブラウザでアプリを丸ごと生成できる'],
    weaknesses: [],
    cost: { tier: 'paid-mid', notes: 'mock' },
    nonEngineerFriendliness: 4,
    primaryUseCases: ['scaffold-app', 'feature-implementation'],
  },
  {
    id: 'bolt-new',
    label: 'Bolt.new',
    description: 'Web builder',
    kind: 'web',
    category: 'browser-builder',
    provider: 'stackblitz',
    steps: [],
    strengths: ['ブラウザだけでフルスタックアプリが組める'],
    weaknesses: [],
    cost: { tier: 'paid-mid', notes: 'mock' },
    nonEngineerFriendliness: 4,
    primaryUseCases: ['feature-implementation'],
  },
] as const

describe('mockResolveToolScout — TQ-234', () => {
  it('prefers terminal-kind tools for macOS expert CLI users', async () => {
    const out = await mockResolveToolScout({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'expert' },
      currentToolCatalog: TEST_CATALOG,
      apiKey: null,
      model: { provider: 'openai', model: 'gpt-5.x' },
    })
    expect(out.mode).toBe('mock')
    expect(out.recommendedTools).toHaveLength(3)
    // 上位 3 件は terminal 系が優先される（claude-code / codex がトップ近辺）
    const ids = out.recommendedTools.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['claude-code', 'codex']))
  })

  it('prefers web/desktop tools for Windows beginner CLI users', async () => {
    const out = await mockResolveToolScout({
      learnerOSAndCli: { os: 'windows', cliFamiliarity: 'beginner' },
      currentToolCatalog: TEST_CATALOG,
      apiKey: null,
      model: { provider: 'openai', model: 'gpt-5.x' },
    })
    expect(out.recommendedTools).toHaveLength(3)
    const ids = out.recommendedTools.map((t) => t.id)
    // GUI 系（v0 / cursor / replit-agent / bolt-new）が優先され、terminal 系は外れる
    for (const cliId of ['claude-code', 'codex']) {
      expect(ids).not.toContain(cliId)
    }
    // 上位は v0 / replit-agent / bolt-new / cursor のいずれか
    for (const id of ids) {
      expect(['v0', 'replit-agent', 'bolt-new', 'cursor']).toContain(id)
    }
  })

  it('returns gaps_in_catalog with replit-agent + bolt-new as mock examples', async () => {
    const out = await mockResolveToolScout({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
      currentToolCatalog: TEST_CATALOG,
      apiKey: null,
      model: { provider: 'openai', model: 'gpt-5.x' },
    })
    expect(out.gapsInCatalog).toHaveLength(2)
    const toolIds = out.gapsInCatalog.map((g) => g.toolId)
    expect(toolIds).toEqual(
      expect.arrayContaining(['replit-agent', 'bolt-new']),
    )
    for (const gap of out.gapsInCatalog) {
      expect(['pricing', 'capability', 'new-tool', 'deprecation', 'other'])
        .toContain(gap.kind)
    }
  })

  it('produces confidences clamped to [0, 1]', async () => {
    const out = await mockResolveToolScout({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'expert' },
      currentToolCatalog: TEST_CATALOG,
      apiKey: null,
      model: { provider: 'openai', model: 'gpt-5.x' },
    })
    for (const t of out.recommendedTools) {
      expect(t.confidence).toBeGreaterThanOrEqual(0)
      expect(t.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('handles unknown OS / CLI gracefully (no throw, returns 3 picks)', async () => {
    const out = await mockResolveToolScout({
      learnerOSAndCli: { os: null, cliFamiliarity: null },
      currentToolCatalog: TEST_CATALOG,
      apiKey: null,
      model: { provider: 'openai', model: 'gpt-5.x' },
    })
    expect(out.recommendedTools).toHaveLength(3)
  })
})

describe('AiToolCatalogScoutSubAgent — TQ-234', () => {
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
    it('returns a structured SubAgentReport-compatible output', async () => {
      let tick = 1_000
      const subAgent = new AiToolCatalogScoutSubAgent({
        now: () => {
          const t = tick
          tick += 200
          return t
        },
      })

      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )

      expect(out.agentName).toBe('tool_scout')
      expect(out.status).toBe('ok')
      expect(out.summary).toContain('AI ツール上位')
      expect(out.recommendedTools).toHaveLength(3)
      expect(out.gapsInCatalog).toHaveLength(2)
      expect(out.mode).toBe('mock')
      expect(out.model).toBe('openai:gpt-5.x')
      expect(out.latencyMs).toBeGreaterThan(0)
      expect(out.startedAt).toBe(1_000)
      expect(out.finishedAt).toBeGreaterThan(out.startedAt)
    })

    it('uses tool_scout default routing (openai:gpt-5.x) per owner decision', async () => {
      const subAgent = new AiToolCatalogScoutSubAgent()
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      expect(out.model).toBe('openai:gpt-5.x')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new AiToolCatalogScoutSubAgent()
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      expect(out.model).toBe('zai:glm-5.1')
    })

    it('honors a model override via deps.model (e.g., Gemini alternative)', async () => {
      const subAgent = new AiToolCatalogScoutSubAgent({
        model: { provider: 'gemini', model: 'gemini-pro-3' },
      })
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      expect(out.model).toBe('gemini:gemini-pro-3')
    })

    it('falls back to AI_TOOLS_CATALOG when no catalog is provided', async () => {
      const subAgent = new AiToolCatalogScoutSubAgent()
      const out = await subAgent.run(buildInput()) // no currentToolCatalog
      expect(out.status).toBe('ok')
      expect(out.recommendedTools).toHaveLength(3)
      // 実 catalog 由来の id が返る（空ではない）
      for (const t of out.recommendedTools) {
        expect(typeof t.id).toBe('string')
        expect(t.id.length).toBeGreaterThan(0)
      }
    })

    it('exposes lastRun for Conductor log entry', async () => {
      const subAgent = new AiToolCatalogScoutSubAgent()
      await subAgent.run(buildInput({ currentToolCatalog: TEST_CATALOG }))
      expect(subAgent.lastRun).not.toBeNull()
      expect(subAgent.lastRun?.status).toBe('ok')
      expect(subAgent.lastRun?.mode).toBe('mock')
    })
  })

  describe('failure modes', () => {
    it('catches resolver errors and surfaces them via status=error + errorMessage', async () => {
      const resolve = vi.fn().mockRejectedValue(new Error('openai_429'))
      const subAgent = new AiToolCatalogScoutSubAgent({ resolve })
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      expect(out.status).toBe('error')
      expect(out.errorMessage).toBe('openai_429')
      expect(out.recommendedTools).toEqual([])
      expect(out.gapsInCatalog).toEqual([])
      expect(out.summary).toContain('失敗')
    })

    it('does not fail the run when getApiKey lookup throws', async () => {
      const getApiKey = vi.fn().mockRejectedValue(new Error('byok_missing'))
      const subAgent = new AiToolCatalogScoutSubAgent({ getApiKey })
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      // Phase 1 では getApiKey 失敗は log のみ → run は成功
      expect(out.status).toBe('ok')
      expect(getApiKey).toHaveBeenCalledTimes(1)
      // owner 確定で provider は openai
      expect(getApiKey).toHaveBeenCalledWith('openai')
    })

    it('passes apiKey to the resolver when getApiKey succeeds', async () => {
      const resolve = vi.fn().mockResolvedValue({
        recommendedTools: [],
        gapsInCatalog: [],
        mode: 'mock' as const,
      })
      const getApiKey = vi.fn().mockResolvedValue('sk-openai-xxx')
      const subAgent = new AiToolCatalogScoutSubAgent({ resolve, getApiKey })
      await subAgent.run(buildInput({ currentToolCatalog: TEST_CATALOG }))
      expect(getApiKey).toHaveBeenCalledWith('openai')
      expect(resolve).toHaveBeenCalledTimes(1)
      const call = resolve.mock.calls[0][0]
      expect(call.apiKey).toBe('sk-openai-xxx')
      expect(call.learnerOSAndCli.os).toBe('macos')
      expect(call.currentToolCatalog).toBe(TEST_CATALOG)
    })
  })

  describe('contract surface (Conductor fan-out compatibility)', () => {
    it('emits required SubAgentReport-style keys', async () => {
      const subAgent = new AiToolCatalogScoutSubAgent()
      const out = await subAgent.run(
        buildInput({ currentToolCatalog: TEST_CATALOG }),
      )
      const keys = Object.keys(out)
      for (const k of [
        'agentName',
        'status',
        'summary',
        'recommendedTools',
        'gapsInCatalog',
        'latencyMs',
        'model',
        'mode',
        'startedAt',
        'finishedAt',
      ]) {
        expect(keys).toContain(k)
      }
    })
  })
})
