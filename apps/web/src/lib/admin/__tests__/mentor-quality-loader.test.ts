/**
 * TQ-238: loader composition test (no DB; uses an in-memory repository).
 */

import { describe, expect, it } from 'vitest'

import {
  loadMentorQualitySnapshot,
  type MentorQualityRepository,
} from '@/lib/admin/mentor-quality-loader'
import type {
  AgentRunRecord,
  EvaluationRunRecord,
} from '@/lib/admin/mentor-metrics'

class InMemoryRepo implements MentorQualityRepository {
  constructor(
    private readonly runs: AgentRunRecord[],
    private readonly evals: EvaluationRunRecord[],
  ) {}

  async listRecentAgentRuns(limit?: number) {
    return this.runs.slice(0, limit ?? this.runs.length)
  }

  async listRecentEvaluationRuns(limit?: number) {
    return this.evals.slice(0, limit ?? this.evals.length)
  }
}

const NOW = new Date('2026-05-09T12:00:00.000Z')

describe('loadMentorQualitySnapshot', () => {
  it('returns the deterministic empty shape when both tables are empty', async () => {
    const repo = new InMemoryRepo([], [])
    const snapshot = await loadMentorQualitySnapshot(repo, { now: NOW })
    expect(snapshot).toEqual({
      generatedAt: NOW.toISOString(),
      qualityTimeline: [],
      costByMonth: [],
      subAgentFailures: {
        total: 0,
        byStatus: {
          success: 0,
          failed: 0,
          timeout: 0,
          cancelled: 0,
          running: 0,
          other: 0,
        },
        failureRate: 0,
      },
      modelUsage: [],
      recentPlans: [],
    })
  })

  it('passes runs and evaluations through aggregations', async () => {
    const repo = new InMemoryRepo(
      [
        {
          id: 'r1',
          agentType: 'claude',
          runStatus: 'success',
          startedAt: '2026-05-08T10:00:00.000Z',
          finishedAt: '2026-05-08T10:01:00.000Z',
          metadata: {
            plan_id: 'plan-A',
            model: 'claude-opus-4-7',
            cost_usd: 0.07,
            latency_ms: 950,
          },
        },
      ],
      [
        {
          id: 'e1',
          agentRunId: 'r1',
          actionId: null,
          goalId: null,
          evaluator: 'judge_model',
          score: 0.82,
          maxScore: 1,
          verdict: 'pass',
          evaluatedAt: '2026-05-08T10:02:00.000Z',
          details: { fit: 0.9 },
        },
      ],
    )

    const snapshot = await loadMentorQualitySnapshot(repo, { now: NOW })
    expect(snapshot.subAgentFailures.total).toBe(1)
    expect(snapshot.subAgentFailures.byStatus.success).toBe(1)
    expect(snapshot.modelUsage[0]?.model).toBe('claude-opus-4-7')
    expect(snapshot.recentPlans[0]?.planId).toBe('plan-A')
    expect(snapshot.qualityTimeline).toHaveLength(1)
    expect(snapshot.qualityTimeline[0]?.fit).toBeCloseTo(0.9, 3)
  })
})
