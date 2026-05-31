/**
 * TQ-238: unit tests for `mentor-metrics` aggregations.
 *
 * Focus: verify deterministic shape over realistic agent_runs /
 * evaluation_runs row mixes (model + cost + latency + 4-axis score).
 */

import { describe, expect, it } from 'vitest'

import {
  buildCostByMonth,
  buildMentorQualitySnapshot,
  buildQualityTimeline,
  normalizeAgentRunRow,
  normalizeEvaluationRunRow,
  summarizeModelUsage,
  summarizeRecentPlans,
  summarizeSubAgentFailures,
  type AgentRunRecord,
  type EvaluationRunRecord,
} from '@/lib/admin/mentor-metrics'

const NOW = new Date('2026-05-09T12:00:00.000Z')

function makeAgentRun(
  overrides: Partial<AgentRunRecord> & {
    metadata?: Record<string, unknown> | null
  } = {},
): AgentRunRecord {
  return {
    id: overrides.id ?? `run-${Math.random().toString(16).slice(2, 8)}`,
    agentType: overrides.agentType ?? 'claude',
    runStatus: overrides.runStatus ?? 'success',
    startedAt: overrides.startedAt ?? '2026-05-08T00:00:00.000Z',
    finishedAt: overrides.finishedAt ?? '2026-05-08T00:01:00.000Z',
    metadata: overrides.metadata ?? null,
  }
}

function makeEvaluation(
  overrides: Partial<EvaluationRunRecord> & {
    details?: Record<string, unknown> | null
  } = {},
): EvaluationRunRecord {
  return {
    id: overrides.id ?? `eval-${Math.random().toString(16).slice(2, 8)}`,
    agentRunId: overrides.agentRunId ?? null,
    goalId: overrides.goalId ?? null,
    actionId: overrides.actionId ?? null,
    evaluator: overrides.evaluator ?? 'judge_model',
    score: overrides.score ?? 0.8,
    maxScore: overrides.maxScore ?? 1,
    verdict: overrides.verdict ?? 'pass',
    evaluatedAt: overrides.evaluatedAt ?? '2026-05-08T00:00:00.000Z',
    details: overrides.details ?? null,
  }
}

describe('buildQualityTimeline', () => {
  it('groups evaluations by ISO date and averages each axis', () => {
    const evaluations: EvaluationRunRecord[] = [
      makeEvaluation({
        evaluatedAt: '2026-05-07T10:00:00.000Z',
        details: {
          ai_utilization: 0.6,
          non_eng_friendly: 0.7,
          shortest_path: 0.5,
          fit: 0.9,
        },
      }),
      makeEvaluation({
        evaluatedAt: '2026-05-07T18:00:00.000Z',
        details: {
          ai_utilization: 0.8,
          non_eng_friendly: 0.9,
          shortest_path: 0.7,
          fit: 0.95,
        },
      }),
      makeEvaluation({
        evaluatedAt: '2026-05-08T09:00:00.000Z',
        details: {
          ai_utilization: 0.4,
          non_eng_friendly: 0.5,
          shortest_path: 0.3,
          fit: 0.6,
        },
      }),
    ]

    const timeline = buildQualityTimeline(evaluations, { now: NOW })

    expect(timeline).toHaveLength(2)
    expect(timeline[0]).toMatchObject({
      date: '2026-05-07',
      count: 2,
    })
    expect(timeline[0]?.ai_utilization).toBeCloseTo(0.7, 3)
    expect(timeline[0]?.fit).toBeCloseTo(0.925, 3)
    expect(timeline[1]).toMatchObject({ date: '2026-05-08', count: 1 })
    expect(timeline[1]?.shortest_path).toBeCloseTo(0.3, 3)
  })

  it('ignores evaluations outside the window', () => {
    const oldEval = makeEvaluation({
      evaluatedAt: '2025-01-01T00:00:00.000Z',
      details: { fit: 0.5 },
    })
    const recent = makeEvaluation({
      evaluatedAt: '2026-05-08T00:00:00.000Z',
      details: { fit: 0.9 },
    })

    const timeline = buildQualityTimeline([oldEval, recent], {
      windowDays: 30,
      now: NOW,
    })

    expect(timeline).toHaveLength(1)
    expect(timeline[0]?.date).toBe('2026-05-08')
  })

  it('reads axis scores from `details.scores` when flat keys are absent', () => {
    const evaluations: EvaluationRunRecord[] = [
      makeEvaluation({
        evaluatedAt: '2026-05-08T00:00:00.000Z',
        details: {
          scores: {
            ai_utilization: 0.85,
            fit: 0.55,
          },
        },
      }),
    ]

    const timeline = buildQualityTimeline(evaluations, { now: NOW })
    expect(timeline[0]?.ai_utilization).toBeCloseTo(0.85, 3)
    expect(timeline[0]?.fit).toBeCloseTo(0.55, 3)
    expect(timeline[0]?.shortest_path).toBeNull()
  })

  it('normalizes 0–10 axis scores down to 0–1', () => {
    const timeline = buildQualityTimeline(
      [
        makeEvaluation({
          evaluatedAt: '2026-05-08T00:00:00.000Z',
          details: { fit: 9 }, // common evaluator scale
        }),
      ],
      { now: NOW },
    )
    expect(timeline[0]?.fit).toBeCloseTo(0.9, 3)
  })
})

describe('buildCostByMonth', () => {
  it('aggregates cost_usd from metadata into monthly buckets', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({
        startedAt: '2026-04-15T00:00:00.000Z',
        metadata: { cost_usd: 0.12, plan_id: 'plan-A' },
      }),
      makeAgentRun({
        startedAt: '2026-04-20T00:00:00.000Z',
        metadata: { cost_usd: 0.08, plan_id: 'plan-A' },
      }),
      makeAgentRun({
        startedAt: '2026-04-22T00:00:00.000Z',
        metadata: { cost_usd: 0.5, plan_id: 'plan-B' },
      }),
      makeAgentRun({
        startedAt: '2026-05-01T00:00:00.000Z',
        metadata: { cost_usd: 0.2, plan_id: 'plan-C' },
      }),
    ]

    const cost = buildCostByMonth(runs, { now: NOW, months: 6 })
    expect(cost).toHaveLength(2)
    expect(cost[0]).toEqual({
      month: '2026-04',
      totalCostUsd: 0.7,
      runs: 3,
      plans: 2,
      costPerPlanUsd: 0.35,
    })
    expect(cost[1]).toEqual({
      month: '2026-05',
      totalCostUsd: 0.2,
      runs: 1,
      plans: 1,
      costPerPlanUsd: 0.2,
    })
  })

  it('treats missing cost_usd as 0 and missing plan_id as a single unscoped bucket', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({ startedAt: '2026-05-01T00:00:00.000Z', metadata: {} }),
      makeAgentRun({
        startedAt: '2026-05-02T00:00:00.000Z',
        metadata: { cost_usd: 0.1 },
      }),
    ]
    const cost = buildCostByMonth(runs, { now: NOW })
    expect(cost).toHaveLength(1)
    expect(cost[0]).toEqual({
      month: '2026-05',
      totalCostUsd: 0.1,
      runs: 2,
      plans: 1,
      costPerPlanUsd: 0.1,
    })
  })
})

describe('summarizeSubAgentFailures', () => {
  it('counts statuses and computes failure rate', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({ runStatus: 'success' }),
      makeAgentRun({ runStatus: 'success' }),
      makeAgentRun({ runStatus: 'failed' }),
      makeAgentRun({ runStatus: 'timeout' }),
      makeAgentRun({ runStatus: 'cancelled' }),
      makeAgentRun({ runStatus: 'running' }),
    ]
    const stats = summarizeSubAgentFailures(runs)
    expect(stats.total).toBe(6)
    expect(stats.byStatus).toEqual({
      success: 2,
      failed: 1,
      timeout: 1,
      cancelled: 1,
      running: 1,
      other: 0,
    })
    expect(stats.failureRate).toBeCloseTo(2 / 6, 3)
  })

  it('returns zeros for an empty input without dividing by zero', () => {
    const stats = summarizeSubAgentFailures([])
    expect(stats.total).toBe(0)
    expect(stats.failureRate).toBe(0)
  })
})

describe('summarizeModelUsage', () => {
  it('groups runs by metadata.model and sorts by frequency desc', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({
        metadata: { model: 'claude-opus-4-7', cost_usd: 0.05, latency_ms: 1200 },
      }),
      makeAgentRun({
        metadata: { model: 'claude-opus-4-7', cost_usd: 0.03, latency_ms: 800 },
      }),
      makeAgentRun({
        metadata: { model: 'claude-sonnet-4-6', cost_usd: 0.01, latency_ms: 400 },
      }),
      makeAgentRun({
        metadata: { model: null, cost_usd: 0.02 },
      }),
    ]
    const usage = summarizeModelUsage(runs)
    expect(usage[0]).toEqual({
      model: 'claude-opus-4-7',
      runs: 2,
      totalCostUsd: 0.08,
      avgLatencyMs: 1000,
    })
    expect(usage[1]?.model).toBe('claude-sonnet-4-6')
    // null model groups under 'unknown'
    expect(usage.some((row) => row.model === 'unknown')).toBe(true)
  })
})

describe('summarizeRecentPlans', () => {
  it('lists most-recent plans with avg score and total cost', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({
        id: 'r1',
        startedAt: '2026-05-01T00:00:00.000Z',
        finishedAt: '2026-05-01T00:01:00.000Z',
        metadata: { plan_id: 'plan-A', model: 'claude-opus-4-7', cost_usd: 0.1 },
      }),
      makeAgentRun({
        id: 'r2',
        startedAt: '2026-05-02T00:00:00.000Z',
        finishedAt: '2026-05-02T00:01:00.000Z',
        metadata: { plan_id: 'plan-A', model: 'claude-sonnet-4-6', cost_usd: 0.05 },
      }),
      makeAgentRun({
        id: 'r3',
        startedAt: '2026-05-08T00:00:00.000Z',
        finishedAt: '2026-05-08T00:01:00.000Z',
        metadata: { plan_id: 'plan-B', model: 'gemini-pro-3', cost_usd: 0.07 },
      }),
    ]

    const evaluations: EvaluationRunRecord[] = [
      makeEvaluation({ agentRunId: 'r1', score: 0.7 }),
      makeEvaluation({ agentRunId: 'r2', score: 0.9 }),
      makeEvaluation({ agentRunId: 'r3', score: 0.6 }),
    ]

    const plans = summarizeRecentPlans(runs, evaluations, { limit: 5 })
    expect(plans).toHaveLength(2)
    // plan-B is more recent so it sorts first
    expect(plans[0]?.planId).toBe('plan-B')
    expect(plans[0]?.runs).toBe(1)
    expect(plans[0]?.averageScore).toBeCloseTo(0.6, 2)
    expect(plans[0]?.models).toEqual(['gemini-pro-3'])
    expect(plans[1]?.planId).toBe('plan-A')
    expect(plans[1]?.runs).toBe(2)
    expect(plans[1]?.averageScore).toBeCloseTo(0.8, 2)
    expect(plans[1]?.models).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6'])
    expect(plans[1]?.totalCostUsd).toBeCloseTo(0.15, 2)
  })

  it('skips runs without plan_id and returns an empty list when none match', () => {
    const runs: AgentRunRecord[] = [
      makeAgentRun({ metadata: {} }),
      makeAgentRun({ metadata: null }),
    ]
    expect(summarizeRecentPlans(runs, [])).toEqual([])
  })
})

describe('buildMentorQualitySnapshot', () => {
  it('returns the combined shape with generatedAt timestamp', () => {
    const snapshot = buildMentorQualitySnapshot([], [], { now: NOW })
    expect(snapshot.generatedAt).toBe(NOW.toISOString())
    expect(snapshot.qualityTimeline).toEqual([])
    expect(snapshot.costByMonth).toEqual([])
    expect(snapshot.subAgentFailures.total).toBe(0)
    expect(snapshot.modelUsage).toEqual([])
    expect(snapshot.recentPlans).toEqual([])
  })
})

describe('row normalizers', () => {
  it('normalizes agent_run rows defensively', () => {
    const row = normalizeAgentRunRow({
      id: 'abc',
      agent_type: 'claude',
      run_status: 'success',
      started_at: '2026-05-01T00:00:00.000Z',
      finished_at: '2026-05-01T00:01:00.000Z',
      metadata: { model: 'claude-opus-4-7', cost_usd: 0.1 },
    })
    expect(row.id).toBe('abc')
    expect(row.metadata).toEqual({
      model: 'claude-opus-4-7',
      cost_usd: 0.1,
    })
  })

  it('coerces missing fields without throwing', () => {
    const row = normalizeAgentRunRow({})
    expect(row.id).toBe('')
    expect(row.metadata).toBeNull()
    expect(row.runStatus).toBe('other')
  })

  it('normalizes evaluation_run rows including string scores', () => {
    const row = normalizeEvaluationRunRow({
      id: 'e1',
      agent_run_id: 'r1',
      score: '0.85',
      max_score: 1,
      verdict: 'pass',
      evaluated_at: '2026-05-08T00:00:00.000Z',
      details: { fit: 0.9 },
    })
    expect(row.score).toBe(0.85)
    expect(row.maxScore).toBe(1)
    expect(row.details).toEqual({ fit: 0.9 })
  })
})
