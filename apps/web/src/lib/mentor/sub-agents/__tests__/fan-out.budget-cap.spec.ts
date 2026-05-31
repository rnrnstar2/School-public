/**
 * W59 (Audit A3 W12-NEW-2): fan-out × BudgetCapError propagation.
 *
 * 検証範囲:
 * - sub-agent task が BudgetCapError を throw した場合、`runSubAgentsParallel`
 *   は status='error' SubAgentReport に丸めるのではなく **再 throw** して
 *   conductor.ts:422 の `instanceof BudgetCapError` 分岐に届かせる。
 * - 通常の Error は従来どおり status='error' SubAgentReport に変換され、他
 *   sub-agent と並列に走り切る (graceful degradation 維持)。
 * - 複数 sub-agent が混在 (ok / error / BudgetCapError) しても、最初の 1 件の
 *   BudgetCapError が throw され、partial fan-out で全体停止しない契約は保つ。
 */

import { describe, expect, it } from 'vitest'

import {
  runSubAgentsParallel,
  type SubAgentTask,
} from '@/lib/mentor/sub-agents/fan-out'
import { BudgetCapError } from '@/lib/mentor/providers/budget-cap-runtime'

function makeBudgetCapError(): BudgetCapError {
  return new BudgetCapError({
    userId: 'user-cap-1',
    currentUsd: 4.95,
    estimateUsd: 0.5,
    capUsd: 5,
  })
}

describe('runSubAgentsParallel × BudgetCapError', () => {
  it('re-throws BudgetCapError instead of catching to status=error', async () => {
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw makeBudgetCapError()
        },
      },
    ]

    await expect(runSubAgentsParallel(tasks)).rejects.toBeInstanceOf(
      BudgetCapError,
    )
  })

  it('preserves BudgetCapError fields (userId / currentUsd / capUsd)', async () => {
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw makeBudgetCapError()
        },
      },
    ]
    let captured: BudgetCapError | null = null
    try {
      await runSubAgentsParallel(tasks)
    } catch (error) {
      captured = error as BudgetCapError
    }
    expect(captured).toBeInstanceOf(BudgetCapError)
    expect(captured?.userId).toBe('user-cap-1')
    expect(captured?.currentUsd).toBe(4.95)
    expect(captured?.capUsd).toBe(5)
  })

  it('still re-throws when other sub-agents succeed alongside the cap', async () => {
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw makeBudgetCapError()
        },
      },
      {
        id: 'memory_recall',
        role: 'memory_recall',
        run: async () => ({ payload: { snippets: [] }, summary: 'recall ok' }),
      },
      {
        id: 'friction_critic',
        role: 'non_eng_critic',
        run: async () => {
          throw new Error('plain error, not a cap')
        },
      },
    ]
    await expect(runSubAgentsParallel(tasks)).rejects.toBeInstanceOf(
      BudgetCapError,
    )
  })

  it('does NOT throw for plain Error (graceful degradation preserved)', async () => {
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw new Error('zai_503')
        },
      },
      {
        id: 'memory_recall',
        role: 'memory_recall',
        run: async () => ({ payload: 1, summary: 'ok' }),
      },
    ]
    const reports = await runSubAgentsParallel(tasks)
    expect(reports).toHaveLength(2)
    const byId = Object.fromEntries(reports.map((r) => [r.id, r]))
    expect(byId.goal_tree.status).toBe('error')
    expect(byId.goal_tree.errorMessage).toBe('zai_503')
    expect(byId.memory_recall.status).toBe('ok')
  })

  it('finished progress event fires before fan-out re-throws', async () => {
    const finished: string[] = []
    const tasks: SubAgentTask[] = [
      {
        id: 'goal_tree',
        role: 'goal_tree',
        run: async () => {
          throw makeBudgetCapError()
        },
      },
    ]
    let caught = false
    try {
      await runSubAgentsParallel(tasks, {
        onProgress: (event) => {
          if (event.type === 'finished') finished.push(event.id)
        },
      })
    } catch {
      caught = true
    }
    expect(caught).toBe(true)
    // SSE 上の partial visibility のため finished event 自体は emit されている
    expect(finished).toEqual(['goal_tree'])
  })
})
