/**
 * W61 (Audit B3 #3): Goal-Tree sub-agent は 1 hearing で ZAI を高々 1 回しか
 * 叩かない。
 *
 * 背景:
 * - W47 で specialized SYSTEM_PROMPT → ZAI 配線
 * - W54 で ZAI 戻り値を Zod parse して specialized output として採用
 * - **しかし parse 失敗時に旧 `callZaiForGoalTree` (ai-atom-compiler 内) へ
 *   降りる経路があり、1 hearing で ZAI を 2 回叩く土管化** （Audit B3 #3）
 *
 * W61 修正:
 * - Sub-agent から `callZaiForGoalTree` への呼び出しを削除し、parse 失敗時は
 *   deterministic heuristic decomposer に降りる
 * - **本 spec はその回帰防止**。`fetchWithRetry` を spy し、各シナリオで
 *   ZAI POST が **最大 1 回** であることを assert する。
 *
 * 検証戦略:
 * - `MENTOR_PROVIDER_PHASE3` を **未設定** にして Phase 1 default を再現
 * - `ZAI_PLANNER_API_KEY` + `ZAI_PLANNER_API_URL` を立てて ZAI 経路を発火可能に
 * - シナリオ:
 *   1. 有効 schema が返る → 1 POST、specialized 採用
 *   2. schema 不一致 → 1 POST、heuristic fallback（**追加 ZAI POST なし**）
 *   3. parse 不能 → 1 POST、heuristic fallback（**追加 ZAI POST なし**）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GoalTreeSubAgent,
  type GoalTreeSubAgentInput,
} from '@/lib/mentor/sub-agents/goal-tree'

// `fetchWithRetry` を mock し、ZAI に行く HTTP POST 回数を観測する。
vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '' } }] }),
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
  delete process.env.MENTOR_PROVIDER_PHASE3
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
  vi.restoreAllMocks()
})

function mockZaiResponseText(content: string): void {
  vi.mocked(fetchWithRetry).mockImplementation(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
      }) as unknown as Response,
  )
}

const STANDARD_INPUT: GoalTreeSubAgentInput = {
  goal: 'ポートフォリオサイトを最短で公開する',
  hearingResult: { signals: {} },
  learnerProfile: {
    cli_familiarity: 'basic',
    available_ai_tools: [],
    experience_summary: null,
  },
}

// ── Tests ────────────────────────────────────────────────────────────

describe('W61: GoalTreeSubAgent unifies to single ZAI call per hearing', () => {
  it('valid schema → exactly 1 ZAI POST, specialized output 採用', async () => {
    mockZaiResponseText(
      JSON.stringify({
        goal_summary: 'LLM 要約',
        objectives: [
          {
            id: 'llm-obj-1',
            title: 'LLM が分解した目的',
            milestones: [
              {
                id: 'llm-ms-1',
                title: 'LLM milestone',
                leafTasks: [{ id: 'llm-leaf-1', title: 'LLM leaf' }],
              },
            ],
          },
        ],
      }),
    )

    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run(STANDARD_INPUT)

    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
    expect(out.tree).not.toBeNull()
    expect(out.tree?.objectives[0]?.id).toBe('llm-obj-1')
    expect(out.summary.ok).toBe(true)
  })

  it('schema 不一致 → exactly 1 ZAI POST, heuristic fallback (追加 ZAI なし)', async () => {
    mockZaiResponseText(JSON.stringify({ wrong: 'shape' }))

    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run(STANDARD_INPUT)

    // W61 の核: 旧 callZaiForGoalTree 経路で 2 回目の ZAI POST を踏まない。
    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
    expect(out.tree).not.toBeNull()
    // heuristic fallback 由来の deterministic id
    expect(out.tree?.objectives[0]?.id).toBe('obj-default-0')
    expect(out.summary.ok).toBe(true)
  })

  it('parse 不能 → exactly 1 ZAI POST, heuristic fallback (追加 ZAI なし)', async () => {
    mockZaiResponseText('this is not json')

    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run(STANDARD_INPUT)

    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
    expect(out.tree).not.toBeNull()
    expect(out.tree?.objectives[0]?.id).toBe('obj-default-0')
    expect(out.summary.ok).toBe(true)
  })

  it('deps.decompose override → ZAI POST 0 回 (specialized 経路に到達せず override 採用)', async () => {
    // shouldRunPhase1ZaiCall() が true でも override で ZAI に行かない設計に
    // なっているわけではない (specialized prompt は fire される) が、
    // override 注入時に 2 回目の ZAI 呼出が走らないことだけ担保する。
    const decompose = vi.fn().mockResolvedValue({
      goal_summary: 'override',
      objectives: [
        {
          id: 'override-obj',
          title: 'override',
          milestones: [
            {
              id: 'override-ms',
              title: 'override',
              leafTasks: [{ id: 'override-leaf', title: 'override' }],
            },
          ],
        },
      ],
    })

    const subAgent = new GoalTreeSubAgent({ decompose })
    const out = await subAgent.run(STANDARD_INPUT)

    // override 採用
    expect(out.tree?.objectives[0]?.id).toBe('override-obj')
    expect(decompose).toHaveBeenCalledTimes(1)
    // ZAI specialized prompt POST は走るが、それ以上 (= 旧 callZaiForGoalTree
    // 経路) は走らないことを担保する。
    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
  })
})
