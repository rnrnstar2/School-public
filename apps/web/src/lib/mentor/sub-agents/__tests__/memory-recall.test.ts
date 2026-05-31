/**
 * Mentor-Memory Recall sub-agent unit tests — TQ-231.
 *
 * 検証範囲:
 * - heuristic summarizer
 *   - ネガティブ語含む bullet → avoid
 *   - ポジティブ語含む bullet → reinforce
 *   - negativeFeedback / blockers → 無条件で avoid
 *   - pacing 判定（gentle / normal / aggressive）
 *   - dedup / 80 字 clip
 * - sub-agent class
 *   - model resolution（router 経由 / override / kill-switch）
 *   - lastRun summary
 *   - summarize 注入で I/O 完全置換できる
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MemoryRecallSubAgent,
  heuristicSummarizeMemories,
  type MemoryRecallInput,
} from '@/lib/mentor/sub-agents/memory-recall'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_MEMORY_RECALL',
]

function buildInput(over: Partial<MemoryRecallInput> = {}): MemoryRecallInput {
  return {
    recentMemories: [],
    ...over,
  }
}

describe('heuristicSummarizeMemories — TQ-231 ruleset', () => {
  it('classifies negative-keyword bullets into avoid_patterns', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: ['前回 OAuth で詰まった。エラーで止まった。'],
      }),
    )
    expect(out.avoid_patterns.length).toBe(1)
    expect(out.reinforce_patterns).toEqual([])
  })

  it('classifies positive-keyword bullets into reinforce_patterns', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: ['Vercel deploy はスムーズにできた。'],
      }),
    )
    expect(out.reinforce_patterns.length).toBe(1)
    expect(out.avoid_patterns).toEqual([])
  })

  it('forces negativeFeedback into avoid with [低評価] prefix', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        negativeFeedback: ['説明が分かりにくかった'],
      }),
    )
    expect(out.avoid_patterns[0]).toContain('[低評価]')
  })

  it('forces blockers into avoid with [blocker] prefix', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        blockers: ['ターミナルが怖い'],
      }),
    )
    expect(out.avoid_patterns[0]).toContain('[blocker]')
  })

  it('returns gentle pacing when negative > positive', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: [
          '前回詰まった',
          '失敗した',
          '苦手だった',
        ],
      }),
    )
    expect(out.suggested_pacing).toBe('gentle')
  })

  it('returns aggressive pacing when many positives and few avoid', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: [
          'できた',
          'うまくいった',
          'スムーズにクリアした',
          '理解した',
        ],
      }),
    )
    expect(out.suggested_pacing).toBe('aggressive')
  })

  it('returns normal pacing when neutral', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: ['今日の天気は曇り'],
      }),
    )
    expect(out.suggested_pacing).toBe('normal')
  })

  it('respects preferredPacing for the neutral baseline', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: [],
        preferredPacing: 'gentle',
      }),
    )
    expect(out.suggested_pacing).toBe('gentle')
  })

  it('clips bullets longer than 80 chars', async () => {
    const long = 'あ'.repeat(200)
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: [`${long}で詰まった`],
      }),
    )
    expect(out.avoid_patterns[0]?.length).toBeLessThan(85) // 80 + '…' + small margin
  })

  it('dedups identical bullets', async () => {
    const out = await heuristicSummarizeMemories(
      buildInput({
        recentMemories: ['詰まった', '詰まった'],
      }),
    )
    expect(out.avoid_patterns.length).toBe(1)
  })

  it('caps avoid/reinforce arrays at 8 entries', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `${i} で詰まった`)
    const out = await heuristicSummarizeMemories(
      buildInput({ recentMemories: many }),
    )
    expect(out.avoid_patterns.length).toBe(8)
  })
})

describe('MemoryRecallSubAgent — TQ-231 sub-agent class', () => {
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

  it('returns avoid / reinforce / pacing / summary', async () => {
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run(
      buildInput({
        recentMemories: ['詰まった', 'できた'],
        blockers: ['CLI 苦手'],
      }),
    )
    expect(out.summary.model).toBe('anthropic:claude-haiku-4-5-20251001')
    expect(out.summary.mode).toBe('heuristic')
    expect(out.summary.ok).toBe(true)
    expect(out.summary.memoryCount).toBe(2)
    expect(out.summary.blockerCount).toBe(1)
    expect(['gentle', 'normal', 'aggressive']).toContain(out.suggested_pacing)
  })

  it('exposes lastRun', async () => {
    const subAgent = new MemoryRecallSubAgent()
    expect(subAgent.lastRun).toBeNull()
    await subAgent.run(buildInput())
    expect(subAgent.lastRun?.ok).toBe(true)
  })

  it('honors model override via deps.model', async () => {
    const subAgent = new MemoryRecallSubAgent({
      model: { provider: 'zai', model: 'glm-5.1' },
    })
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('zai:glm-5.1')
  })

  it('honors MENTOR_MODEL_FALLBACK_ALL_GLM', async () => {
    process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('zai:glm-5.1')
  })

  it('honors MENTOR_MODEL_MEMORY_RECALL per-role override', async () => {
    process.env.MENTOR_MODEL_MEMORY_RECALL = 'anthropic:claude-sonnet-4-6'
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run(buildInput())
    expect(out.summary.model).toBe('anthropic:claude-sonnet-4-6')
  })

  it('lets tests substitute the summarizer', async () => {
    const summarize = vi.fn().mockResolvedValue({
      avoid_patterns: ['stub-avoid'],
      reinforce_patterns: ['stub-reinforce'],
      suggested_pacing: 'aggressive' as const,
      mode: 'llm-summarized' as const,
    })
    const subAgent = new MemoryRecallSubAgent({ summarize })
    const out = await subAgent.run(buildInput())
    expect(summarize).toHaveBeenCalledTimes(1)
    expect(out.avoid_patterns).toEqual(['stub-avoid'])
    expect(out.reinforce_patterns).toEqual(['stub-reinforce'])
    expect(out.suggested_pacing).toBe('aggressive')
    expect(out.summary.mode).toBe('llm-summarized')
  })

  it('catches summarizer errors and surfaces via summary', async () => {
    const summarize = vi.fn().mockRejectedValue(new Error('boom'))
    const subAgent = new MemoryRecallSubAgent({ summarize })
    const out = await subAgent.run(buildInput({ preferredPacing: 'gentle' }))
    expect(out.summary.ok).toBe(false)
    expect(out.summary.errorMessage).toBe('boom')
    expect(out.avoid_patterns).toEqual([])
    expect(out.reinforce_patterns).toEqual([])
    // pacing は preferredPacing が残る
    expect(out.suggested_pacing).toBe('gentle')
  })
})
