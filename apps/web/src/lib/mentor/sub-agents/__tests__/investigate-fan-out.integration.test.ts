/**
 * INVESTIGATE phase 4-sub-agent integration test — TQ-231
 *
 * 検証範囲:
 * - GoalTree + FrictionCritic + LessonMatcher + MemoryRecall を 4 体まとめて
 *   `runSubAgentsParallel` に push し、すべて並列実行されること
 * - 1 sub-agent の例外で残りが完走すること（Promise.allSettled の保証）
 * - 各 sub-agent の `SubAgentReport.status` が正しく振り分けられること
 * - `onProgress` が 4 体ぶん `started` / `finished` を emit すること
 */

import { describe, expect, it } from 'vitest'

import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import { runSubAgentsParallel, type SubAgentTask } from '@/lib/mentor/sub-agents/fan-out'
import type { SubAgentProgressEvent } from '@/lib/mentor/sub-agents/types'
import { GoalTreeSubAgent } from '@/lib/mentor/sub-agents/goal-tree'
import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { LessonMatcherSubAgent } from '@/lib/mentor/sub-agents/lesson-matcher'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'

const SAMPLE_TREE: GoalTreeDecomposition = {
  goal_summary: 'LP を作って公開する',
  objectives: [
    {
      id: 'obj-1',
      title: '見た目',
      milestones: [
        {
          id: 'ms-1',
          title: 'ヒーロー',
          leafTasks: [
            {
              id: 'leaf-deploy',
              title: 'Vercel にデプロイ',
              human_judgment_required: false,
              automation_potential: 'high',
              recommended_capability: 'deploy',
            },
            {
              id: 'leaf-cli',
              title: 'git push でデプロイ',
              human_judgment_required: false,
              automation_potential: 'high',
            },
          ],
        },
      ],
    },
  ],
}

describe('INVESTIGATE phase fan-out integration — TQ-231', () => {
  it('runs all 4 sub-agents in parallel and returns one report per sub-agent', async () => {
    const goalTreeAgent = new GoalTreeSubAgent({
      decompose: async () => SAMPLE_TREE,
    })
    const frictionAgent = new FrictionCriticSubAgent()
    const matcherAgent = new LessonMatcherSubAgent()
    const memoryAgent = new MemoryRecallSubAgent()

    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          const out = await goalTreeAgent.run({
            goal: 'LP を公開する',
            hearingResult: { keyPoints: [], signals: {} },
            learnerProfile: {
              cli_familiarity: 'none',
              available_ai_tools: [],
              experience_summary: null,
            },
          })
          return { payload: out, summary: `tree leaves=${out.summary.leafCount ?? 0}` }
        },
      },
      {
        id: 'friction_critic',
        role: 'non_eng_critic',
        run: async () => {
          const out = await frictionAgent.run({
            goalTree: SAMPLE_TREE,
            learnerProfile: { cli_familiarity: 'none' },
          })
          return {
            payload: out,
            summary: `frictions=${out.frictions.length} score=${out.non_eng_score}`,
          }
        },
      },
      {
        id: 'lesson_matcher',
        role: 'lesson_matcher',
        run: async () => {
          const out = await matcherAgent.run({
            goalTree: SAMPLE_TREE,
            candidateAtoms: [],
            learnerProfile: {},
          })
          return {
            payload: out,
            summary: `matches=${out.matches.length} gaps=${out.gaps.length}`,
          }
        },
      },
      {
        id: 'memory_recall',
        role: 'memory_recall',
        run: async () => {
          const out = await memoryAgent.run({
            recentMemories: ['前回 OAuth で詰まった', 'Vercel deploy はスムーズだった'],
          })
          return {
            payload: out,
            summary: `memories=2 pacing=${out.suggested_pacing}`,
          }
        },
      },
    ]

    const events: SubAgentProgressEvent[] = []
    const reports = await runSubAgentsParallel(tasks, {
      onProgress: (e) => events.push(e),
    })

    // 4 体すべて status='ok' で返る
    expect(reports).toHaveLength(4)
    const byId = Object.fromEntries(reports.map((r) => [r.id, r]))
    expect(byId.goal_tree.status).toBe('ok')
    expect(byId.friction_critic.status).toBe('ok')
    expect(byId.lesson_matcher.status).toBe('ok')
    expect(byId.memory_recall.status).toBe('ok')

    // 各 sub-agent の summary が伝播している
    expect(byId.friction_critic.summary).toMatch(/frictions=/)
    expect(byId.lesson_matcher.summary).toMatch(/matches=0 gaps=2/) // candidateAtoms 空 → 全 leaf gap
    expect(byId.memory_recall.summary).toMatch(/pacing=/)

    // onProgress: 4 started + 4 finished
    expect(events.filter((e) => e.type === 'started')).toHaveLength(4)
    expect(events.filter((e) => e.type === 'finished')).toHaveLength(4)
  })

  it('keeps remaining sub-agents running when one throws (graceful degradation)', async () => {
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw new Error('decomposer_503')
        },
      },
      {
        id: 'friction_critic',
        role: 'non_eng_critic',
        run: async () => {
          const out = await new FrictionCriticSubAgent().run({
            goalTree: SAMPLE_TREE,
            learnerProfile: { cli_familiarity: 'none' },
          })
          return { payload: out, summary: 'critic ok' }
        },
      },
      {
        id: 'lesson_matcher',
        role: 'lesson_matcher',
        run: async () => {
          const out = await new LessonMatcherSubAgent().run({
            goalTree: SAMPLE_TREE,
            candidateAtoms: [],
          })
          return { payload: out, summary: 'matcher ok' }
        },
      },
      {
        id: 'memory_recall',
        role: 'memory_recall',
        run: async () => {
          const out = await new MemoryRecallSubAgent().run({ recentMemories: [] })
          return { payload: out, summary: 'recall ok' }
        },
      },
    ]

    const reports = await runSubAgentsParallel(tasks)
    const byId = Object.fromEntries(reports.map((r) => [r.id, r]))

    // 1 体失敗
    expect(byId.goal_tree.status).toBe('error')
    expect(byId.goal_tree.errorMessage).toBe('decomposer_503')
    // 残りは全件成功
    expect(byId.friction_critic.status).toBe('ok')
    expect(byId.lesson_matcher.status).toBe('ok')
    expect(byId.memory_recall.status).toBe('ok')
  })
})
