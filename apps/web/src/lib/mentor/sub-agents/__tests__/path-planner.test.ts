/**
 * Shortest-Path Planner sub-agent unit tests — TQ-235.
 *
 * 検証範囲:
 * - 確定論的経路計算 (computeShortestPath)
 *   - critical_path: polish を除いた essential leaf を DFS 順で列挙
 *   - parallelizable_groups: 同一 milestone 内 essential leaf を並列度 >= 2 で返す
 *   - optional_polish: automation_potential === 'low' && human_judgment_required === true
 *   - total_hours_estimate: estimatedMinutesByLeafId 優先 / default 補完
 * - sub-agent class
 *   - model resolution（router 経由 / override / kill-switch）
 *   - lastRun summary
 *   - learnerHoursPerWeek の echo back
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import {
  ShortestPathPlannerSubAgent,
  computeShortestPath,
  type PathPlannerInput,
} from '@/lib/mentor/sub-agents/path-planner'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_PATH_PLANNER',
]

/**
 * 2 objective × 各 1 milestone × 各 2-3 leaf のサンプル tree。
 * leaf-001（automation:low + human_judgment:true）が polish 候補。
 * leaf-002 と leaf-003 は同 milestone 配下の essential なので並列グループ。
 */
const SAMPLE_TREE: GoalTreeDecomposition = {
  goal_summary: 'LP を作って公開する',
  objectives: [
    {
      id: 'obj-000',
      title: '見た目を組む',
      milestones: [
        {
          id: 'ms-000',
          title: 'デザイン',
          leafTasks: [
            {
              id: 'leaf-000',
              title: 'AI で初期生成',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
            {
              id: 'leaf-001',
              title: 'トーン決定',
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
      title: '機能を作る',
      milestones: [
        {
          id: 'ms-001',
          title: '実装',
          leafTasks: [
            {
              id: 'leaf-002',
              title: 'ヒーローを書く',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
            {
              id: 'leaf-003',
              title: 'CTA を書く',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'ui-scaffold',
            },
            {
              id: 'leaf-004',
              title: 'コピーを推敲',
              human_judgment_required: true,
              automation_potential: 'low',
            },
          ],
        },
      ],
    },
    {
      id: 'obj-002',
      title: '公開する',
      milestones: [
        {
          id: 'ms-002',
          title: 'Vercel deploy',
          leafTasks: [
            {
              id: 'leaf-005',
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

function buildInput(overrides: Partial<PathPlannerInput> = {}): PathPlannerInput {
  return {
    goalTree: SAMPLE_TREE,
    estimatedMinutesByLeafId: {
      'leaf-000': 30,
      'leaf-002': 20,
      'leaf-003': 10,
      'leaf-005': 60,
      // leaf-004 は polish なので minutes 不要
      // leaf-001 は polish なので minutes 不要
    },
    defaultMinutesPerLeaf: 25,
    ...overrides,
  }
}

describe('computeShortestPath — TQ-235 deterministic algorithm', () => {
  it('排除 polish leaf and orders essential leaves DFS', () => {
    const out = computeShortestPath(buildInput())
    // leaf-001 と leaf-004 は polish (automation_potential:low + human_judgment:true)
    expect(out.critical_path).toEqual([
      'leaf-000',
      'leaf-002',
      'leaf-003',
      'leaf-005',
    ])
    expect(out.optional_polish).toEqual(['leaf-001', 'leaf-004'])
  })

  it('groups essential leaves under the same milestone when there are >= 2 of them', () => {
    const out = computeShortestPath(buildInput())
    // ms-000 essential = [leaf-000] のみ (leaf-001 は polish) → グループ化されない
    // ms-001 essential = [leaf-002, leaf-003] (leaf-004 は polish) → グループ化される
    // ms-002 essential = [leaf-005] のみ → グループ化されない
    expect(out.parallelizable_groups).toEqual([['leaf-002', 'leaf-003']])
  })

  it('sums total_hours_estimate from estimatedMinutesByLeafId in critical path only', () => {
    const out = computeShortestPath(buildInput())
    // critical = leaf-000(30) + leaf-002(20) + leaf-003(10) + leaf-005(60) = 120 min = 2.0 h
    expect(out.total_hours_estimate).toBe(2)
    expect(out.unestimatedLeafCount).toBe(0)
    // polish は leaf 数にカウントされる
    expect(out.leafCount).toBe(6)
  })

  it('falls back to defaultMinutesPerLeaf for unestimated leaves', () => {
    const out = computeShortestPath(
      buildInput({
        estimatedMinutesByLeafId: {
          'leaf-000': 40,
          // leaf-002, leaf-003, leaf-005 は未提供 → default 25 min
        },
        defaultMinutesPerLeaf: 25,
      }),
    )
    // 40 + 25 + 25 + 25 = 115 min = 1.916... h → 1.9 (1桁丸め)
    expect(out.total_hours_estimate).toBeCloseTo(1.9, 1)
    expect(out.unestimatedLeafCount).toBe(3)
  })

  it('uses the built-in default (30 min) when defaultMinutesPerLeaf is missing', () => {
    const out = computeShortestPath({
      goalTree: SAMPLE_TREE,
      estimatedMinutesByLeafId: {},
    })
    // 4 essential leaf × 30 min = 120 min = 2.0 h
    expect(out.total_hours_estimate).toBe(2)
    expect(out.unestimatedLeafCount).toBe(4)
  })

  it('treats automation_potential:low alone (without human_judgment) as essential', () => {
    const tree: GoalTreeDecomposition = {
      objectives: [
        {
          id: 'obj-x',
          title: 'x',
          milestones: [
            {
              id: 'ms-x',
              title: 'm',
              leafTasks: [
                {
                  id: 'l-low-only',
                  title: '機械処理は不可だが判断は不要',
                  human_judgment_required: false,
                  automation_potential: 'low',
                },
                {
                  id: 'l-judgment-only',
                  title: '判断は必要だが automation は high',
                  human_judgment_required: true,
                  automation_potential: 'high',
                },
              ],
            },
          ],
        },
      ],
    }
    const out = computeShortestPath({ goalTree: tree })
    // どちらも polish 条件「両方満たす」を欠くので essential 扱い
    expect(out.critical_path).toEqual(['l-low-only', 'l-judgment-only'])
    expect(out.optional_polish).toEqual([])
  })

  it('handles malformed input gracefully (missing objectives / milestones / leaves)', () => {
    const out = computeShortestPath({
      goalTree: { objectives: [] },
    })
    expect(out.critical_path).toEqual([])
    expect(out.parallelizable_groups).toEqual([])
    expect(out.optional_polish).toEqual([])
    expect(out.total_hours_estimate).toBe(0)
    expect(out.leafCount).toBe(0)
  })

  it('skips leaves that have no id', () => {
    const tree: GoalTreeDecomposition = {
      objectives: [
        {
          id: 'obj-y',
          title: 'y',
          milestones: [
            {
              id: 'ms-y',
              title: 'm',
              leafTasks: [
                // 不正データ（id 欠落）— 走査でスキップする
                {
                  id: '',
                  title: '匿名',
                  human_judgment_required: false,
                  automation_potential: 'high',
                },
                {
                  id: 'l-y-1',
                  title: '正常',
                  human_judgment_required: false,
                  automation_potential: 'high',
                },
              ],
            },
          ],
        },
      ],
    }
    const out = computeShortestPath({ goalTree: tree })
    expect(out.critical_path).toEqual(['l-y-1'])
    expect(out.leafCount).toBe(1)
  })
})

describe('ShortestPathPlannerSubAgent — TQ-235 sub-agent class', () => {
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
    it('returns critical_path / groups / polish / hours', async () => {
      let tick = 1_000
      const subAgent = new ShortestPathPlannerSubAgent({
        now: () => {
          const t = tick
          tick += 5
          return t
        },
      })
      const out = await subAgent.run(buildInput())

      expect(out.critical_path).toEqual([
        'leaf-000',
        'leaf-002',
        'leaf-003',
        'leaf-005',
      ])
      expect(out.parallelizable_groups).toEqual([['leaf-002', 'leaf-003']])
      expect(out.optional_polish).toEqual(['leaf-001', 'leaf-004'])
      expect(out.total_hours_estimate).toBe(2)
      expect(out.summary.model).toBe('anthropic:claude-haiku-4-5-20251001')
      expect(out.summary.leafCount).toBe(6)
      expect(out.summary.unestimatedLeafCount).toBe(0)
      expect(out.summary.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('exposes lastRun for the Conductor log path', async () => {
      const subAgent = new ShortestPathPlannerSubAgent()
      expect(subAgent.lastRun).toBeNull()
      await subAgent.run(buildInput())
      expect(subAgent.lastRun).not.toBeNull()
      expect(subAgent.lastRun?.leafCount).toBe(6)
    })

    it('honors learnerHoursPerWeek by echoing it back via summary', async () => {
      const subAgent = new ShortestPathPlannerSubAgent()
      const out = await subAgent.run(buildInput({ learnerHoursPerWeek: 5 }))
      expect(out.summary.learnerHoursPerWeek).toBe(5)
    })

    it('honors a model override via deps.model', async () => {
      const subAgent = new ShortestPathPlannerSubAgent({
        model: { provider: 'zai', model: 'glm-5.1' },
      })
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new ShortestPathPlannerSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_PATH_PLANNER per-role override via router', async () => {
      process.env.MENTOR_MODEL_PATH_PLANNER = 'openai:codex-mini'
      const subAgent = new ShortestPathPlannerSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary.model).toBe('openai:codex-mini')
    })
  })

  describe('compute injection', () => {
    it('lets tests substitute the deterministic computation entirely', async () => {
      const compute = vi.fn().mockReturnValue({
        critical_path: ['stub-1'],
        parallelizable_groups: [],
        optional_polish: ['stub-polish'],
        total_hours_estimate: 0.5,
        leafCount: 2,
        unestimatedLeafCount: 1,
      })
      const subAgent = new ShortestPathPlannerSubAgent({ compute })
      const out = await subAgent.run(buildInput())
      expect(compute).toHaveBeenCalledTimes(1)
      expect(out.critical_path).toEqual(['stub-1'])
      expect(out.optional_polish).toEqual(['stub-polish'])
      expect(out.total_hours_estimate).toBe(0.5)
      expect(out.summary.unestimatedLeafCount).toBe(1)
    })
  })
})
