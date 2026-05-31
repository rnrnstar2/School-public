/**
 * Fan-out runner unit tests — TQ-230 (Phase 2.1)
 *
 * 検証範囲:
 * - 並列起動 (Promise.allSettled 相当の挙動): 1 sub-agent が落ちても他は走り切る
 * - per-agent timeout: budget 超過は status='timeout' で記録
 * - 部分結果 streaming: task 完了順に onProgress(finished) が来る
 * - 空配列 / 単一 / 複数 task でも安全
 * - parent signal でキャンセル伝播
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  runSubAgentsParallel,
  type SubAgentTask,
} from '@/lib/mentor/sub-agents/fan-out'
import type { SubAgentProgressEvent } from '@/lib/mentor/sub-agents/types'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_GOAL_TREE',
  'MENTOR_MODEL_NON_ENG_CRITIC',
]

describe('runSubAgentsParallel — TQ-230 fan-out runner', () => {
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
    it('returns [] for empty task list and never invokes onProgress', async () => {
      const onProgress = vi.fn()
      const reports = await runSubAgentsParallel([], { onProgress })
      expect(reports).toEqual([])
      expect(onProgress).not.toHaveBeenCalled()
    })

    it('runs all tasks in parallel and returns one report per task', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => ({ payload: { tree: 'A' }, summary: 'A done' }),
        },
        {
          id: 'friction_critic',
          role: 'non_eng_critic',
          run: async () => ({ payload: { warnings: [] }, summary: 'B done' }),
        },
      ]

      const reports = await runSubAgentsParallel(tasks)

      expect(reports).toHaveLength(2)
      const byId = Object.fromEntries(reports.map((r) => [r.id, r]))
      expect(byId.goal_tree.status).toBe('ok')
      expect(byId.goal_tree.payload).toEqual({ tree: 'A' })
      expect(byId.goal_tree.summary).toBe('A done')
      expect(byId.goal_tree.model).toMatch(/^(anthropic|openai|gemini|zai):/)
      expect(byId.friction_critic.status).toBe('ok')
      expect(byId.friction_critic.summary).toBe('B done')
    })

    it('emits started + finished progress events per task in completion order', async () => {
      const events: SubAgentProgressEvent[] = []
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => {
            await new Promise((r) => setTimeout(r, 30))
            return { payload: 1, summary: 'tree' }
          },
        },
        {
          id: 'memory_recall',
          role: 'memory_recall',
          run: async () => ({ payload: 2, summary: 'recall' }),
        },
      ]

      await runSubAgentsParallel(tasks, { onProgress: (e) => events.push(e) })

      const startedIds = events.filter((e) => e.type === 'started').map((e) => e.id)
      const finishedIds = events.filter((e) => e.type === 'finished').map((e) => e.id)
      // started はキックオフ順 (= task 配列順) で 2 件
      expect(startedIds).toEqual(['goal_tree', 'memory_recall'])
      // finished は完了順 (= memory_recall が先、goal_tree が後)
      expect(finishedIds).toEqual(['memory_recall', 'goal_tree'])
    })

    it('honors model override on task descriptor', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          model: { provider: 'zai', model: 'glm-5.1' },
          run: async () => ({ payload: null, summary: 'ok' }),
        },
      ]
      const [report] = await runSubAgentsParallel(tasks)
      expect(report.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router default', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => ({ payload: null, summary: 'ok' }),
        },
      ]
      const [report] = await runSubAgentsParallel(tasks)
      expect(report.model).toBe('zai:glm-5.1')
    })
  })

  describe('partial failure — graceful degradation', () => {
    it('continues with remaining tasks when one rejects', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => {
            throw new Error('boom_tree')
          },
        },
        {
          id: 'friction_critic',
          role: 'non_eng_critic',
          run: async () => ({ payload: { ok: true }, summary: 'critic done' }),
        },
        {
          id: 'memory_recall',
          role: 'memory_recall',
          run: async () => {
            throw new Error('boom_recall')
          },
        },
      ]

      const reports = await runSubAgentsParallel(tasks)

      const byId = Object.fromEntries(reports.map((r) => [r.id, r]))
      expect(byId.goal_tree.status).toBe('error')
      expect(byId.goal_tree.errorMessage).toBe('boom_tree')
      expect(byId.goal_tree.payload).toBeNull()
      expect(byId.friction_critic.status).toBe('ok')
      expect(byId.friction_critic.payload).toEqual({ ok: true })
      expect(byId.memory_recall.status).toBe('error')
      expect(byId.memory_recall.errorMessage).toBe('boom_recall')
    })

    it('emits finished event with status=error for failing tasks', async () => {
      const events: SubAgentProgressEvent[] = []
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => {
            throw new Error('zai_503')
          },
        },
      ]
      await runSubAgentsParallel(tasks, { onProgress: (e) => events.push(e) })
      const finished = events.find((e) => e.type === 'finished')
      expect(finished).toBeTruthy()
      if (finished?.type === 'finished') {
        expect(finished.report.status).toBe('error')
        expect(finished.report.errorMessage).toBe('zai_503')
      }
    })
  })

  describe('per-agent timeout', () => {
    it('marks long-running task as status=timeout when budget is exceeded', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          timeoutMs: 20,
          run: async ({ signal }) =>
            new Promise((resolve, reject) => {
              const handle = setTimeout(() => resolve({ payload: 'late', summary: 'late' }), 200)
              signal?.addEventListener('abort', () => {
                clearTimeout(handle)
                reject(new Error('aborted'))
              })
            }),
        },
      ]

      const [report] = await runSubAgentsParallel(tasks)
      expect(report.status).toBe('timeout')
      expect(report.payload).toBeNull()
      expect(report.errorMessage).toMatch(/timed out/)
    })

    it('does not timeout when budget is null/0/Infinity', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          timeoutMs: 0,
          run: async () => {
            await new Promise((r) => setTimeout(r, 30))
            return { payload: 'fast-enough', summary: 'ok' }
          },
        },
      ]

      const [report] = await runSubAgentsParallel(tasks)
      expect(report.status).toBe('ok')
      expect(report.payload).toBe('fast-enough')
    })

    it('uses default budget when timeoutMs is undefined (memory_recall = 5s)', async () => {
      // memory_recall default budget is 5s — this task resolves in 1ms so should pass.
      const tasks: SubAgentTask[] = [
        {
          id: 'memory_recall',
          role: 'memory_recall',
          run: async () => ({ payload: 'm', summary: 'memory' }),
        },
      ]
      const [report] = await runSubAgentsParallel(tasks)
      expect(report.status).toBe('ok')
    })
  })

  describe('cancellation propagation', () => {
    it('aborts running tasks when parent signal fires', async () => {
      const controller = new AbortController()
      let aborted = false
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          timeoutMs: 0,
          run: ({ signal }) =>
            new Promise((resolve, reject) => {
              signal?.addEventListener('abort', () => {
                aborted = true
                reject(new Error('cancelled_by_parent'))
              })
              setTimeout(() => resolve({ payload: null, summary: 'late' }), 1000)
            }),
        },
      ]

      setTimeout(() => controller.abort(), 10)
      const [report] = await runSubAgentsParallel(tasks, { signal: controller.signal })
      expect(aborted).toBe(true)
      expect(report.status).toBe('error')
      expect(report.errorMessage).toBe('cancelled_by_parent')
    })
  })

  describe('latency / timestamps', () => {
    it('records non-negative latencyMs and ordered started/finished timestamps', async () => {
      const tasks: SubAgentTask[] = [
        {
          id: 'goal_tree',
          role: 'goal_tree',
          run: async () => {
            await new Promise((r) => setTimeout(r, 5))
            return { payload: null, summary: 'ok' }
          },
        },
      ]
      const [r] = await runSubAgentsParallel(tasks)
      expect(r.startedAt).toBeGreaterThan(0)
      expect(r.finishedAt).toBeGreaterThanOrEqual(r.startedAt)
      expect(r.latencyMs).toBeGreaterThanOrEqual(0)
    })
  })
})
