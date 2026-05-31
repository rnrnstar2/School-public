/**
 * W47 (CR-3, Audit A B1): Phase 1 default 経路で specialized SYSTEM_PROMPT が
 * ZAI に渡されていることの回帰防止テスト。
 *
 * 背景:
 * - TQ-239 で各 sub-agent 用に specialized SYSTEM_PROMPT を作成
 * - TQ-245 + TQ-253 で `MENTOR_PROVIDER_PHASE3=1` opt-in 時のみ specialized prompt
 *   が BYOK 経路で Anthropic / OpenAI / Gemini に届くよう配線済み
 * - **しかし Phase 1 production default では specialized prompt が LLM に到達せず、
 *   9 sub-agent のうち実 LLM call は goal-tree compile のみ、残 8 体は
 *   production で mock heuristic** （Audit A B1 CRITICAL）
 *
 * W47 修正:
 * - 各 sub-agent の `run()` で `MENTOR_PROVIDER_PHASE3` が立っていない時に
 *   `maybeRunPhase1ZaiCall` を呼び、ZAI に specialized SYSTEM_PROMPT を送る
 * - 既存 heuristic / mock fallback は ZAI 失敗 / 未設定時のフォールバック
 *
 * 検証戦略:
 * - `MENTOR_PROVIDER_PHASE3` を **未設定** にして Phase 1 default 状態を再現
 * - `ZAI_PLANNER_API_KEY` + `ZAI_PLANNER_API_URL` を立てて ZAI 経路を発火可能に
 * - `fetchWithRetry` を vi.mock で spy し、payload に sub-agent の static
 *   SYSTEM_PROMPT が system role で含まれることを assert
 *
 * 対象 sub-agent (Brief In scope のうち path-planner 除く 8 件):
 *   - FrictionCriticSubAgent
 *   - MemoryRecallSubAgent
 *   - TechStackScoutSubAgent
 *   - AiToolCatalogScoutSubAgent
 *   - JudgeSubAgent
 *   - TieBreakerSubAgent
 *   - LessonMatcherSubAgent
 *   - GoalTreeSubAgent
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'
import { TechStackScoutSubAgent } from '@/lib/mentor/sub-agents/tech-scout'
import { AiToolCatalogScoutSubAgent } from '@/lib/mentor/sub-agents/tool-scout'
import { JudgeSubAgent } from '@/lib/mentor/sub-agents/judge'
import { TieBreakerSubAgent } from '@/lib/mentor/sub-agents/tie-breaker'
import { LessonMatcherSubAgent } from '@/lib/mentor/sub-agents/lesson-matcher'
import { GoalTreeSubAgent } from '@/lib/mentor/sub-agents/goal-tree'
import {
  FRICTION_CRITIC_SYSTEM_PROMPT,
  MEMORY_RECALL_SYSTEM_PROMPT,
  TECH_SCOUT_SYSTEM_PROMPT,
  TOOL_SCOUT_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  TIE_BREAKER_SYSTEM_PROMPT,
  LESSON_MATCHER_SYSTEM_PROMPT,
  GOAL_TREE_SYSTEM_PROMPT,
} from '@/lib/prompts/sub-agents'
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

// `fetchWithRetry` を mock し、phase1-zai-helper / callZaiForGoalTree が叩く
// ZAI への HTTP request を観測する。実 network は叩かない。
vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({ objectives: [] }),
          },
        },
      ],
    }),
  })),
}))

import { fetchWithRetry } from '@/lib/api/fetch-with-retry'

// ── Test environment helpers ─────────────────────────────────────────

const ENV_KEYS_TO_RESTORE = [
  'MENTOR_PROVIDER_PHASE3',
  'ZAI_PLANNER_API_KEY',
  'ZAI_API_KEY',
  'ZAI_PLANNER_API_URL',
  'ZAI_CODING_PLAN_API_URL',
  'ZAI_PLANNER_MODEL',
]

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
  // Phase 3 OFF（= production default）を明示再現。
  delete process.env.MENTOR_PROVIDER_PHASE3
  // ZAI 経路を発火可能にするため最小 env を設定。
  process.env.ZAI_PLANNER_API_KEY = 'fake-zai-key'
  process.env.ZAI_PLANNER_API_URL = 'https://api.z.example/v4'
  vi.mocked(fetchWithRetry).mockClear()
})

afterEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
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
    goal: 'ポートフォリオ',
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

/**
 * fetchWithRetry mock の最初の呼び出しから system message content を取り出す。
 * specialized prompt が ZAI へ届いたかを確認する用。
 */
function extractFirstSystemMessage(): string | null {
  const calls = vi.mocked(fetchWithRetry).mock.calls
  if (calls.length === 0) return null
  const init = calls[0]?.[1]
  if (!init || typeof init !== 'object') return null
  const body = (init as { body?: string }).body
  if (typeof body !== 'string') return null
  try {
    const parsed = JSON.parse(body) as {
      messages?: Array<{ role?: string; content?: string }>
    }
    const sys = parsed.messages?.find((m) => m?.role === 'system')
    return typeof sys?.content === 'string' ? sys.content : null
  } catch {
    return null
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('W47 CR-3: Phase 1 default で specialized SYSTEM_PROMPT が ZAI に届く', () => {
  it('FrictionCriticSubAgent.run() ZAI POST に FRICTION_CRITIC_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new FrictionCriticSubAgent()
    await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(FRICTION_CRITIC_SYSTEM_PROMPT)
  })

  it('MemoryRecallSubAgent.run() ZAI POST に MEMORY_RECALL_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new MemoryRecallSubAgent()
    await subAgent.run({ recentMemories: ['Vercel deploy はスムーズだった'] })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(MEMORY_RECALL_SYSTEM_PROMPT)
  })

  it('TechStackScoutSubAgent.run() ZAI POST に TECH_SCOUT_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new TechStackScoutSubAgent()
    await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js'],
    })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(TECH_SCOUT_SYSTEM_PROMPT)
  })

  it('AiToolCatalogScoutSubAgent.run() ZAI POST に TOOL_SCOUT_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new AiToolCatalogScoutSubAgent()
    await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(TOOL_SCOUT_SYSTEM_PROMPT)
  })

  it('JudgeSubAgent.run() ZAI POST に JUDGE_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new JudgeSubAgent()
    await subAgent.run({ planDraft: buildPlan(), rubric: 'plan-quality-v1' })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(JUDGE_SYSTEM_PROMPT)
  })

  it('TieBreakerSubAgent.run() ZAI POST に TIE_BREAKER_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new TieBreakerSubAgent()
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
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(TIE_BREAKER_SYSTEM_PROMPT)
  })

  it('LessonMatcherSubAgent.run() ZAI POST に LESSON_MATCHER_SYSTEM_PROMPT が含まれる', async () => {
    const subAgent = new LessonMatcherSubAgent()
    await subAgent.run({
      goalTree: buildGoalTree(),
      candidateAtoms: [],
    })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(LESSON_MATCHER_SYSTEM_PROMPT)
  })

  it('GoalTreeSubAgent.run() ZAI POST に GOAL_TREE_SYSTEM_PROMPT が含まれる (W47 fire-and-forget)', async () => {
    // GoalTreeSubAgent は callZaiForGoalTree (ai-atom-compiler) も叩くが、
    // W47 で specialized SYSTEM_PROMPT を fire-and-forget で発火するため、
    // **少なくとも一度** GOAL_TREE_SYSTEM_PROMPT を含む POST が出る。
    const subAgent = new GoalTreeSubAgent({
      // decompose を fake にして callZaiForGoalTree を skip → 観測対象を
      // W47 specialized prompt 経路のみに限定する。
      decompose: async () => null,
    })
    await subAgent.run({
      goal: 'ポートフォリオサイトを最短で公開する',
      learnerProfile: {
        cli_familiarity: 'basic',
        available_ai_tools: [],
        experience_summary: null,
      },
      hearingResult: { signals: {} },
    })
    expect(fetchWithRetry).toHaveBeenCalled()
    const sys = extractFirstSystemMessage()
    expect(sys).toBe(GOAL_TREE_SYSTEM_PROMPT)
  })
})
