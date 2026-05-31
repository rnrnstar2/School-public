/**
 * Specialized SYSTEM_PROMPT wiring regression tests — TQ-253 (Auditor C15).
 *
 * Purpose: Auditor C15 が「TQ-239 で各 sub-agent 用に specialized SYSTEM_PROMPT
 * を作ったが、各 sub-agent.run() で実 LLM call の system message に渡っておらず
 * dead asset」と検出した懸念を、**回帰検出付きで** 解消する。
 *
 * 検証戦略:
 * - `MENTOR_PROVIDER_PHASE3=1` を立て、`getApiKey` で fake key を返す状態で
 *   各 sub-agent の `run()` を呼ぶ。
 * - `dispatchProviderCall` を vi.mock で spy し、呼び出し時の `system` 引数が
 *   sub-agent の static SYSTEM_PROMPT と完全一致することを assert する。
 * - これにより `static SYSTEM_PROMPT === SPECIALIZED_PROMPT` (specialized-
 *   prompts.test.ts で確認済み) と、本テストでの「run() 経路で実 dispatch に
 *   system が渡る」が両立し、specialized prompt の **dead asset 化を防ぐ
 *   regression guard** が成立する。
 *
 * 対象 sub-agent (Brief In scope のうち specialized prompt が存在する 6 件):
 *   - FrictionCriticSubAgent
 *   - MemoryRecallSubAgent
 *   - TechStackScoutSubAgent
 *   - AiToolCatalogScoutSubAgent
 *   - JudgeSubAgent
 *   - TieBreakerSubAgent
 *
 * Out of scope:
 *   - lesson-matcher / goal-tree (Brief 明記の他 worker 担当)
 *   - path-planner (specialized prompt が TQ-239 で作られていない／LLM 不要の
 *     確定論的アルゴリズム sub-agent。本 TQ では配線対象外として escalate)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'
import { TechStackScoutSubAgent } from '@/lib/mentor/sub-agents/tech-scout'
import { AiToolCatalogScoutSubAgent } from '@/lib/mentor/sub-agents/tool-scout'
import { JudgeSubAgent } from '@/lib/mentor/sub-agents/judge'
import { TieBreakerSubAgent } from '@/lib/mentor/sub-agents/tie-breaker'
import {
  FRICTION_CRITIC_SYSTEM_PROMPT,
  MEMORY_RECALL_SYSTEM_PROMPT,
  TECH_SCOUT_SYSTEM_PROMPT,
  TOOL_SCOUT_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  TIE_BREAKER_SYSTEM_PROMPT,
} from '@/lib/prompts/sub-agents'
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

// ── Module mocks ─────────────────────────────────────────────────────
//
// `dispatchProviderCall` を mock し、phase3-helper 経由で渡される `system` 引数を
// 観測する。実 SDK は叩かない（network 不要・決定論的）。

vi.mock('@/lib/mentor/providers/provider-dispatch', () => ({
  dispatchProviderCall: vi.fn(async () => ({
    provider: 'anthropic' as const,
    model: 'mock-model',
    text: 'mock-text',
    raw: { mocked: true },
  })),
}))

import { dispatchProviderCall } from '@/lib/mentor/providers/provider-dispatch'

// ── Test environment helpers ─────────────────────────────────────────

const ENV_KEY = 'MENTOR_PROVIDER_PHASE3'
const ROLE_ENV_KEYS = [
  ENV_KEY,
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_NON_ENG_CRITIC',
  'MENTOR_MODEL_MEMORY_RECALL',
  'MENTOR_MODEL_TECH_SCOUT',
  'MENTOR_MODEL_TOOL_SCOUT',
  'MENTOR_MODEL_JUDGE',
  'MENTOR_MODEL_TIE_BREAKER',
]

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ROLE_ENV_KEYS) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
  // Phase 3 path を開ける
  process.env[ENV_KEY] = '1'
  vi.mocked(dispatchProviderCall).mockClear()
})

afterEach(() => {
  for (const key of ROLE_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
    delete originalEnv[key]
  }
})

// ── Fixtures ─────────────────────────────────────────────────────────

function buildGoalTree(): GoalTreeDecomposition {
  return {
    objectives: [
      {
        id: 'obj-1',
        title: 'ポートフォリオ公開',
        milestones: [
          {
            id: 'ms-1',
            title: '公開準備',
            leafTasks: [
              {
                id: 'l-1',
                title: 'v0 で LP を生成',
                human_judgment_required: false,
                automation_potential: 'high',
                recommended_capability: 'design',
              },
            ],
          },
        ],
      },
    ],
  }
}

function buildPlan(): AtomCompiledPlan {
  return {
    goal: 'ポートフォリオサイトを最短で公開する',
    goalTags: ['website-launch'],
    steps: [
      {
        atomId: 'atom-1',
        title: 'v0 で LP 生成',
        rationale: '時短',
        estimatedMinutes: 30,
        milestoneId: 'ms-0',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'v0',
        delegationBrief: 'v0 にレイアウト案を生成させる',
      },
    ],
    milestones: [
      { id: 'ms-0', title: 'design', description: 'd', atomIds: ['atom-1'] },
    ],
    coverageScore: 0.9,
    unsupportedCapabilities: [],
    rationale: 'AI 活用',
    source: 'ai',
  }
}

// `getApiKey` は Phase 3 dispatch を発火するための minimal fake key 解決関数。
// 各 sub-agent ごとに provider が異なるので何が来ても fake key を返す。
function fakeApiKeyResolver(): () => Promise<string> {
  return async () => 'fake-byok-key'
}

// ── Tests ────────────────────────────────────────────────────────────

describe('TQ-253: specialized SYSTEM_PROMPT is wired into sub-agent run()', () => {
  it('FrictionCriticSubAgent.run() dispatches with FRICTION_CRITIC_SYSTEM_PROMPT', async () => {
    const subAgent = new FrictionCriticSubAgent({ getApiKey: fakeApiKeyResolver() })
    await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(FRICTION_CRITIC_SYSTEM_PROMPT)
    // sanity: SYSTEM_PROMPT が non-empty で specialized 文字列であることを示す
    expect(call?.system).toContain('Scope discipline')
  })

  it('MemoryRecallSubAgent.run() dispatches with MEMORY_RECALL_SYSTEM_PROMPT', async () => {
    const subAgent = new MemoryRecallSubAgent({ getApiKey: fakeApiKeyResolver() })
    await subAgent.run({
      recentMemories: ['Vercel deploy はスムーズだった'],
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(MEMORY_RECALL_SYSTEM_PROMPT)
    expect(call?.system).toContain('Scope discipline')
  })

  it('TechStackScoutSubAgent.run() dispatches with TECH_SCOUT_SYSTEM_PROMPT', async () => {
    const subAgent = new TechStackScoutSubAgent({ getApiKey: fakeApiKeyResolver() })
    await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js'],
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(TECH_SCOUT_SYSTEM_PROMPT)
    expect(call?.system).toContain('Scope discipline')
  })

  it('AiToolCatalogScoutSubAgent.run() dispatches with TOOL_SCOUT_SYSTEM_PROMPT', async () => {
    const subAgent = new AiToolCatalogScoutSubAgent({
      getApiKey: fakeApiKeyResolver(),
    })
    await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(TOOL_SCOUT_SYSTEM_PROMPT)
    expect(call?.system).toContain('Scope discipline')
  })

  it('JudgeSubAgent.run() dispatches with JUDGE_SYSTEM_PROMPT', async () => {
    const subAgent = new JudgeSubAgent({ getApiKey: fakeApiKeyResolver() })
    await subAgent.run({
      planDraft: buildPlan(),
      rubric: 'plan-quality-v1',
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(JUDGE_SYSTEM_PROMPT)
    expect(call?.system).toContain('Scope discipline')
  })

  it('TieBreakerSubAgent.run() dispatches with TIE_BREAKER_SYSTEM_PROMPT', async () => {
    const subAgent = new TieBreakerSubAgent({ getApiKey: fakeApiKeyResolver() })
    await subAgent.run({
      conductor_intent: 'ポートフォリオサイトを最短で公開する',
      conflicting_reports: [
        {
          subAgent: 'tech_scout',
          claims: [
            { topic: 'framework_choice', recommendation: 'next16-required', confidence: 0.9 },
          ],
        },
        {
          subAgent: 'non_eng_critic',
          claims: [
            { topic: 'framework_choice', recommendation: 'vercel-direct-deploy', confidence: 0.8 },
          ],
        },
      ],
    })
    expect(dispatchProviderCall).toHaveBeenCalledTimes(1)
    const call = vi.mocked(dispatchProviderCall).mock.calls[0]?.[0]
    expect(call?.system).toBe(TIE_BREAKER_SYSTEM_PROMPT)
    expect(call?.system).toContain('Scope discipline')
  })
})

describe('TQ-253: each specialized prompt is content-distinct (no copy-paste)', () => {
  // Auditor C15 の核は「specialized prompt が dead asset」=「全部同じ generic
  // prompt が使われている」。本 test は各 sub-agent に渡される system が
  // 互いに異なる（=実際に specialization が効いている）ことを assert する。
  it('all 6 specialized prompts are pairwise distinct strings', () => {
    const prompts = [
      FRICTION_CRITIC_SYSTEM_PROMPT,
      MEMORY_RECALL_SYSTEM_PROMPT,
      TECH_SCOUT_SYSTEM_PROMPT,
      TOOL_SCOUT_SYSTEM_PROMPT,
      JUDGE_SYSTEM_PROMPT,
      TIE_BREAKER_SYSTEM_PROMPT,
    ]
    const set = new Set(prompts)
    expect(set.size).toBe(prompts.length)
  })
})
