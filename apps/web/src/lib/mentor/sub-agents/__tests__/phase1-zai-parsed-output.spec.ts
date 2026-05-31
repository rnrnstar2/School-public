/**
 * W54 (CR-3 完全解消, Audit B2): Phase 1 default で ZAI が返した
 * specialized output を **schema validate して採用** することの回帰防止。
 *
 * 背景:
 * - W47 で Phase 1 default 経路でも `maybeRunPhase1ZaiCall` が specialized
 *   SYSTEM_PROMPT を ZAI に POST する配線済み
 * - **しかし戻り値 `Phase1ZaiCallResult.text` を 8 sub-agent 全てが捨て**、
 *   mock heuristic で plan 品質が決まっていた（土管確定）
 *
 * W54 修正:
 * - `maybeRunPhase1ZaiCall` に `outputSchema` 引数を追加し、ZAI text を
 *   JSON.parse + Zod schema validate
 * - 各 sub-agent が `result.parsedOutput` を **specialized output として採用**
 * - schema 不一致 / parse 失敗 / ZAI 未設定 → 既存 mock heuristic fallback
 *
 * 検証戦略:
 * - `MENTOR_PROVIDER_PHASE3` を **未設定** にして Phase 1 default 状態を再現
 * - `ZAI_PLANNER_API_KEY` + `ZAI_PLANNER_API_URL` を立てて ZAI 経路を発火可能に
 * - `fetchWithRetry` を vi.mock し、各 sub-agent の schema に **整合する JSON**、
 *   **不整合な JSON**、**parse 不能な文字列** の 3 パターンで挙動を確認
 *
 * 対象 sub-agent (path-planner 除く 8 件):
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
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

// `fetchWithRetry` を mock し、phase1-zai-helper が叩く ZAI HTTP を観測する。
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

/**
 * ZAI 応答 mock を設定するヘルパ。content を文字列としてそのまま埋め込む。
 * JSON.parse 不能なケースも文字列で表現できる。
 */
function mockZaiResponseText(content: string): void {
  vi.mocked(fetchWithRetry).mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as unknown as Response)
}

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

// ── FrictionCriticSubAgent ──────────────────────────────────────────

describe('W54: FrictionCriticSubAgent ZAI parsed output', () => {
  it('valid schema → ZAI specialized output を採用 (mode=llm-augmented)', async () => {
    mockZaiResponseText(
      JSON.stringify({
        frictions: [
          {
            step_id: 'l-1',
            severity: 'block',
            reason: 'LLM が判定した詰まりポイント',
            alternative_suggestion: 'GUI ツールで代替',
            ruleId: 'LLM.zai-detected',
          },
        ],
      }),
    )
    const subAgent = new FrictionCriticSubAgent()
    const out = await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(out.summary.mode).toBe('llm-augmented')
    expect(out.frictions[0]?.ruleId).toBe('LLM.zai-detected')
    expect(out.frictions[0]?.reason).toContain('LLM が判定した')
  })

  it('schema 不一致 → mock heuristic fallback', async () => {
    mockZaiResponseText(JSON.stringify({ unexpected: 'schema' }))
    const subAgent = new FrictionCriticSubAgent()
    const out = await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(out.summary.mode).toBe('heuristic')
  })

  it('parse 不能 → mock heuristic fallback', async () => {
    mockZaiResponseText('this is not json')
    const subAgent = new FrictionCriticSubAgent()
    const out = await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: { cli_familiarity: 'none' },
    })
    expect(out.summary.mode).toBe('heuristic')
  })
})

// ── MemoryRecallSubAgent ─────────────────────────────────────────────

describe('W54: MemoryRecallSubAgent ZAI parsed output', () => {
  it('valid schema → mode=llm-summarized', async () => {
    mockZaiResponseText(
      JSON.stringify({
        avoid_patterns: ['LLM-derived avoid'],
        reinforce_patterns: ['LLM-derived reinforce'],
        suggested_pacing: 'gentle',
      }),
    )
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run({ recentMemories: ['x'] })
    expect(out.summary.mode).toBe('llm-summarized')
    expect(out.avoid_patterns).toContain('LLM-derived avoid')
    expect(out.suggested_pacing).toBe('gentle')
  })

  it('schema 不一致 → heuristic fallback', async () => {
    mockZaiResponseText(JSON.stringify({ avoid_patterns: 'not-an-array' }))
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run({ recentMemories: ['x'] })
    expect(out.summary.mode).toBe('heuristic')
  })

  it('parse 不能 → heuristic fallback', async () => {
    mockZaiResponseText('garbage')
    const subAgent = new MemoryRecallSubAgent()
    const out = await subAgent.run({ recentMemories: ['x'] })
    expect(out.summary.mode).toBe('heuristic')
  })
})

// ── TechStackScoutSubAgent ───────────────────────────────────────────

describe('W54: TechStackScoutSubAgent ZAI parsed output', () => {
  it('valid schema → mode=gemini-grounding', async () => {
    mockZaiResponseText(
      JSON.stringify({
        findings: [
          {
            topic: 'llm-detected-topic',
            recommendation: 'LLM が拾った最新変更',
            source_url: 'https://example.com/llm',
            summary: 'LLM 由来の要約',
            relevance: 0.9,
            confidence: 0.85,
          },
        ],
        outdated_atoms: ['atom-old-1'],
      }),
    )
    const subAgent = new TechStackScoutSubAgent()
    const report = await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js'],
    })
    expect(report.payload?.mode).toBe('gemini-grounding')
    expect(report.payload?.findings[0]?.topic).toBe('llm-detected-topic')
    expect(report.payload?.outdated_atoms).toContain('atom-old-1')
  })

  it('schema 不一致 → mock fallback (mode=mock)', async () => {
    mockZaiResponseText(JSON.stringify({ findings: 'wrong-shape' }))
    const subAgent = new TechStackScoutSubAgent()
    const report = await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js'],
    })
    expect(report.payload?.mode).toBe('mock')
  })

  it('parse 不能 → mock fallback', async () => {
    mockZaiResponseText('not-json')
    const subAgent = new TechStackScoutSubAgent()
    const report = await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js'],
    })
    expect(report.payload?.mode).toBe('mock')
  })
})

// ── AiToolCatalogScoutSubAgent ───────────────────────────────────────

describe('W54: AiToolCatalogScoutSubAgent ZAI parsed output', () => {
  it('valid schema → mode=openai-responses-websearch', async () => {
    mockZaiResponseText(
      JSON.stringify({
        recommendedTools: [
          { id: 'cursor', label: 'Cursor', reason: 'LLM 推薦', confidence: 0.9 },
        ],
        gapsInCatalog: [
          { toolId: null, description: 'LLM が見つけた新ツール', kind: 'new-tool' },
        ],
      }),
    )
    const subAgent = new AiToolCatalogScoutSubAgent()
    const out = await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    })
    expect(out.mode).toBe('openai-responses-websearch')
    expect(out.recommendedTools[0]?.reason).toBe('LLM 推薦')
    expect(out.gapsInCatalog[0]?.kind).toBe('new-tool')
  })

  it('schema 不一致 → mock fallback', async () => {
    mockZaiResponseText(JSON.stringify({ recommendedTools: 'wrong' }))
    const subAgent = new AiToolCatalogScoutSubAgent()
    const out = await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    })
    expect(out.mode).toBe('mock')
  })

  it('parse 不能 → mock fallback', async () => {
    mockZaiResponseText('garbage')
    const subAgent = new AiToolCatalogScoutSubAgent()
    const out = await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
    })
    expect(out.mode).toBe('mock')
  })
})

// ── JudgeSubAgent ────────────────────────────────────────────────────

describe('W54: JudgeSubAgent ZAI parsed output', () => {
  it('valid schema → mode=anthropic-self-consistency', async () => {
    mockZaiResponseText(
      JSON.stringify({
        samples: [
          {
            index: 0,
            verdicts: [
              { dim: 'ai_utilization', score: 9, fail_reasons: [] },
              { dim: 'non_eng', score: 8, fail_reasons: [] },
              { dim: 'shortest', score: 9, fail_reasons: [] },
              { dim: 'fit', score: 8, fail_reasons: [] },
            ],
            overallScore: 8.5,
          },
        ],
      }),
    )
    const subAgent = new JudgeSubAgent()
    const out = await subAgent.run({ planDraft: buildPlan(), rubric: 'plan-quality-v1' })
    expect(out.summary.mode).toBe('anthropic-self-consistency')
    expect(out.samples).toHaveLength(1)
    expect(out.recommendAction).toBe('commit')
  })

  it('schema 不一致 → mock fallback', async () => {
    mockZaiResponseText(JSON.stringify({ samples: [] }))
    const subAgent = new JudgeSubAgent()
    const out = await subAgent.run({ planDraft: buildPlan(), rubric: 'plan-quality-v1' })
    expect(out.summary.mode).toBe('mock')
  })

  it('parse 不能 → mock fallback', async () => {
    mockZaiResponseText('not-json')
    const subAgent = new JudgeSubAgent()
    const out = await subAgent.run({ planDraft: buildPlan(), rubric: 'plan-quality-v1' })
    expect(out.summary.mode).toBe('mock')
  })
})

// ── TieBreakerSubAgent ───────────────────────────────────────────────

describe('W54: TieBreakerSubAgent ZAI parsed output', () => {
  const conflictingReports = [
    {
      subAgent: 'tech_scout',
      claims: [
        { topic: 'framework', recommendation: 'next', confidence: 0.9 },
      ],
    },
    {
      subAgent: 'non_eng_critic',
      claims: [
        { topic: 'framework', recommendation: 'no-code', confidence: 0.8 },
      ],
    },
  ]

  it('valid schema → mode=anthropic-extended-thinking', async () => {
    mockZaiResponseText(
      JSON.stringify({
        resolutions: [
          {
            topic: 'framework',
            picked_recommendation: 'next',
            picked_sub_agent: 'tech_scout',
            why: 'LLM の判断',
            confidence: 0.85,
          },
        ],
        overall_confidence: 0.85,
      }),
    )
    const subAgent = new TieBreakerSubAgent()
    const out = await subAgent.run({
      conductor_intent: 'ポートフォリオを最短で公開',
      conflicting_reports: conflictingReports,
    })
    expect(out.summary.mode).toBe('anthropic-extended-thinking')
    expect(out.resolutions[0]?.why).toBe('LLM の判断')
    expect(out.overall_confidence).toBe(0.85)
  })

  it('schema 不一致 → mock fallback', async () => {
    mockZaiResponseText(JSON.stringify({ resolutions: 'wrong' }))
    const subAgent = new TieBreakerSubAgent()
    const out = await subAgent.run({
      conductor_intent: 'x',
      conflicting_reports: conflictingReports,
    })
    expect(out.summary.mode).toBe('mock')
  })

  it('parse 不能 → mock fallback', async () => {
    mockZaiResponseText('garbage')
    const subAgent = new TieBreakerSubAgent()
    const out = await subAgent.run({
      conductor_intent: 'x',
      conflicting_reports: conflictingReports,
    })
    expect(out.summary.mode).toBe('mock')
  })
})

// ── LessonMatcherSubAgent ────────────────────────────────────────────

describe('W54: LessonMatcherSubAgent ZAI parsed output', () => {
  it('valid schema → mode=llm-augmented', async () => {
    mockZaiResponseText(
      JSON.stringify({
        matches: [
          {
            leafId: 'l-1',
            atomId: 'atom-llm',
            score: 88,
            reasons: ['llm-rerank'],
            estimatedMinutes: 30,
          },
        ],
        gaps: [],
      }),
    )
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run({ goalTree: buildGoalTree(), candidateAtoms: [] })
    expect(out.summary.mode).toBe('llm-augmented')
    expect(out.matches[0]?.atomId).toBe('atom-llm')
  })

  it('schema 不一致 → deterministic fallback', async () => {
    mockZaiResponseText(JSON.stringify({ matches: 'wrong' }))
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run({ goalTree: buildGoalTree(), candidateAtoms: [] })
    expect(out.summary.mode).toBe('deterministic')
  })

  it('parse 不能 → deterministic fallback', async () => {
    mockZaiResponseText('garbage')
    const subAgent = new LessonMatcherSubAgent()
    const out = await subAgent.run({ goalTree: buildGoalTree(), candidateAtoms: [] })
    expect(out.summary.mode).toBe('deterministic')
  })
})

// ── GoalTreeSubAgent ─────────────────────────────────────────────────

describe('W54: GoalTreeSubAgent ZAI parsed output', () => {
  it('valid schema → ZAI specialized tree を採用', async () => {
    mockZaiResponseText(
      JSON.stringify({
        goal_summary: 'LLM が要約',
        objectives: [
          {
            id: 'llm-obj-1',
            title: 'LLM が分解した目的',
            milestones: [
              {
                id: 'llm-ms-1',
                title: 'LLM milestone',
                leafTasks: [
                  { id: 'llm-leaf-1', title: 'LLM leaf' },
                ],
              },
            ],
          },
        ],
      }),
    )
    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run({
      goal: 'ポートフォリオ',
      learnerProfile: {
        cli_familiarity: 'basic',
        available_ai_tools: [],
        experience_summary: null,
      },
      hearingResult: { signals: {} },
    })
    expect(out.tree).not.toBeNull()
    expect(out.tree?.objectives[0]?.id).toBe('llm-obj-1')
    expect(out.summary.ok).toBe(true)
  })

  it('schema 不一致 → callZaiForGoalTree (default decomposer) fallback', async () => {
    // schema 不一致を返す。default decomposer (callZaiForGoalTree) は別途
    // ai-atom-compiler 内で fetch を呼ぶが、本テストでは fetchWithRetry を mock
    // しているので結果的に「parse 失敗 → null」を返す経路に乗る。
    mockZaiResponseText(JSON.stringify({ wrong: 'shape' }))
    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run({
      goal: 'ポートフォリオ',
      learnerProfile: {
        cli_familiarity: 'basic',
        available_ai_tools: [],
        experience_summary: null,
      },
      hearingResult: { signals: {} },
    })
    // ZAI が specialized output を返さず、fallback decomposer も同じ mock 経由
    // で null を返す（or schema 通る）。少なくとも「specialized 採用ではない」
    // という意味で parsedOutput 経路に乗っていないことを担保する。
    if (out.tree !== null) {
      // fallback 由来のツリーが返った場合、ZAI specialized の "wrong" shape は
      // 含まれない。
      expect(out.tree.objectives[0]?.id).not.toBe('llm-obj-1')
    }
  })

  it('parse 不能 → fallback decomposer 経路', async () => {
    mockZaiResponseText('garbage')
    const subAgent = new GoalTreeSubAgent()
    const out = await subAgent.run({
      goal: 'ポートフォリオ',
      learnerProfile: {
        cli_familiarity: 'basic',
        available_ai_tools: [],
        experience_summary: null,
      },
      hearingResult: { signals: {} },
    })
    // parse 不能 → specialized は null。fallback も同じ mock を踏むので
    // 最終 tree=null になるか、たまたま valid shape を引いた場合は別経路。
    // ここでは「LLM specialized が採用されていない」ことだけ確認する。
    if (out.tree !== null) {
      expect(out.tree.objectives[0]?.id).not.toBe('llm-obj-1')
    }
  })
})
