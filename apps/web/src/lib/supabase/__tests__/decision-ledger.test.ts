/**
 * TQ-130 decision-ledger repository — live-DB insert+select smoke tests.
 *
 * Opts in only when a local Supabase instance is reachable
 * (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). In CI or dev
 * environments without those envs the suite is skipped so
 * `pnpm --filter web test:vitest` stays green.
 *
 * Covers the three functions explicitly required by spec.md TQ-130-04:
 *   - createGoal        -> decision_ledger.goals
 *   - proposeAction     -> decision_ledger.proposed_actions
 *   - recordAgentRun    -> decision_ledger.agent_runs
 */

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  createGoal,
  insertAgentRun,
  insertApprovalGate,
  insertEvaluationRun,
  insertGoalContexts,
  insertGoalNodeLessonMatches,
  insertGoalNodes,
  listPendingApprovalGates,
  proposeAction,
  recordAgentRun,
  upsertLessonGap,
  updateLessonGapStatus,
} from '@/lib/supabase/decision-ledger'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const shouldRun = Boolean(SUPABASE_URL) && Boolean(SERVICE_ROLE_KEY)
const describeLive = shouldRun ? describe : describe.skip

describeLive('decision-ledger repository (live DB)', () => {
  let admin: SupabaseClient

  const createdGoalIds: string[] = []
  const createdActionIds: string[] = []
  const createdAgentRunIds: string[] = []
  const createdEvaluationRunIds: string[] = []
  const createdApprovalGateIds: string[] = []
  const createdLessonGapIds: string[] = []
  const createdCoverageSnapshotIds: string[] = []

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  afterAll(async () => {
    if (!admin) return
    const ledger = admin.schema('decision_ledger' as never) as unknown as {
      from: (table: string) => {
        delete: () => { in: (column: string, values: string[]) => Promise<unknown> }
      }
    }
    if (createdAgentRunIds.length > 0) {
      await ledger.from('agent_runs').delete().in('id', createdAgentRunIds)
    }
    if (createdEvaluationRunIds.length > 0) {
      await ledger.from('evaluation_runs').delete().in('id', createdEvaluationRunIds)
    }
    if (createdApprovalGateIds.length > 0) {
      await ledger.from('approval_gates').delete().in('id', createdApprovalGateIds)
    }
    if (createdLessonGapIds.length > 0) {
      await ledger.from('lesson_gaps').delete().in('id', createdLessonGapIds)
    }
    if (createdActionIds.length > 0) {
      await ledger.from('proposed_actions').delete().in('id', createdActionIds)
    }
    if (createdGoalIds.length > 0) {
      await ledger.from('goals').delete().in('id', createdGoalIds)
    }
    if (createdCoverageSnapshotIds.length > 0) {
      await admin
        .from('coverage_index_snapshots')
        .delete()
        .in('id', createdCoverageSnapshotIds)
    }
  })

  it('createGoal inserts a goals row and returns the persisted record', async () => {
    const title = `TQ-130 test goal ${Date.now()}`
    const { data, error } = await createGoal({
      title,
      description: 'vitest smoke',
      status: 'active',
      metadata: { source: 'TQ-130 vitest' },
    })

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.title).toBe(title)
    expect(data?.status).toBe('active')
    expect(data?.id).toMatch(/[0-9a-f-]{36}/)

    if (data?.id) createdGoalIds.push(data.id)

    const ledger = admin.schema('decision_ledger' as never) as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            single: () => Promise<{
              data: { id: string; title: string } | null
              error: unknown
            }>
          }
        }
      }
    }
    const check = await ledger
      .from('goals')
      .select('id,title')
      .eq('id', data!.id)
      .single()
    expect(check.error).toBeFalsy()
    expect(check.data?.title).toBe(title)
  })

  it('proposeAction inserts a proposed_actions row tied to a goal', async () => {
    const goalRes = await createGoal({
      title: `TQ-130 proposeAction parent ${Date.now()}`,
    })
    expect(goalRes.error).toBeNull()
    const goalId = goalRes.data!.id
    createdGoalIds.push(goalId)

    const { data, error } = await proposeAction({
      goal_id: goalId,
      title: 'vitest: sample proposed action',
      action_type: 'task',
      priority: 'P2',
      rationale: 'smoke test insert',
    })

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.goal_id).toBe(goalId)
    expect(data?.status).toBe('proposed')
    expect(data?.priority).toBe('P2')

    if (data?.id) createdActionIds.push(data.id)
  })

  it('recordAgentRun inserts an agent_runs row referencing a goal + action', async () => {
    const goalRes = await createGoal({
      title: `TQ-130 recordAgentRun parent ${Date.now()}`,
    })
    expect(goalRes.error).toBeNull()
    const goalId = goalRes.data!.id
    createdGoalIds.push(goalId)

    const actionRes = await proposeAction({
      goal_id: goalId,
      title: 'vitest: agent run target action',
    })
    expect(actionRes.error).toBeNull()
    const actionId = actionRes.data!.id
    createdActionIds.push(actionId)

    const { data, error } = await recordAgentRun({
      goal_id: goalId,
      action_id: actionId,
      agent_type: 'codex',
      run_status: 'success',
      input_summary: 'vitest input',
      output_summary: 'vitest output',
    })

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.goal_id).toBe(goalId)
    expect(data?.action_id).toBe(actionId)
    expect(data?.agent_type).toBe('codex')
    expect(data?.run_status).toBe('success')

    if (data?.id) createdAgentRunIds.push(data.id)
  })

  it('insertAgentRun inserts an agent_runs row through the explicit client path', async () => {
    const runId = randomUUID()
    const { data, error } = await insertAgentRun(admin as never, {
      id: runId,
      agent_type: 'script',
      run_status: 'success',
      input_summary: 'bridge fixture',
      output_summary: 'bridge completed',
      metadata: { kind: 'g2a_bridge', source: 'vitest' },
    })

    expect(error).toBeNull()
    expect(data?.id).toBe(runId)
    expect(data?.agent_type).toBe('script')
    expect(data?.metadata).toMatchObject({ kind: 'g2a_bridge' })

    createdAgentRunIds.push(runId)
  })

  it('insertEvaluationRun inserts an evaluation_runs row through the explicit client path', async () => {
    const agentRunId = randomUUID()
    const agentRunRes = await insertAgentRun(admin as never, {
      id: agentRunId,
      agent_type: 'script',
      run_status: 'success',
      input_summary: 'judge fixture',
      output_summary: 'judge completed',
      metadata: { kind: 'g2a_judge', source: 'vitest' },
    })

    expect(agentRunRes.error).toBeNull()
    createdAgentRunIds.push(agentRunId)

    const evalRunId = randomUUID()
    const { data, error } = await insertEvaluationRun(admin as never, {
      id: evalRunId,
      agent_run_id: agentRunId,
      evaluator: 'judge_fake_v0',
      score: 9.5,
      max_score: 10,
      verdict: 'pass',
      rubric_ref: 'eval-datasets/goal-action/v0/rubric.md',
      fail_reasons: [],
      details: {
        target: 'matcher',
        source: 'vitest',
      },
    })

    expect(error).toBeNull()
    expect(data?.id).toBe(evalRunId)
    expect(data?.agent_run_id).toBe(agentRunId)
    expect(data?.evaluator).toBe('judge_fake_v0')

    createdEvaluationRunIds.push(evalRunId)
  })

  it('insertGoalNodes + insertGoalContexts batch-insert shadow goal tree rows', async () => {
    const goalRes = await createGoal({
      title: `TQ-147 shadow parent ${Date.now()}`,
      metadata: { source: 'vitest' },
    })
    expect(goalRes.error).toBeNull()
    const goalId = goalRes.data!.id
    createdGoalIds.push(goalId)

    const nodeRes = await insertGoalNodes(admin as never, [
      {
        goal_id: goalId,
        label: 'ゴール本体',
        node_type: 'objective',
        sort_order: 0,
      },
      {
        goal_id: goalId,
        label: '最初のタスク',
        node_type: 'task',
        sort_order: 1,
      },
    ])

    expect(nodeRes.error).toBeNull()
    expect(nodeRes.data).toHaveLength(2)

    const contextRes = await insertGoalContexts(admin as never, [
      {
        goal_id: goalId,
        source_type: 'other',
        content: 'shadow input',
        metadata: { source: 'vitest' },
      },
    ])

    expect(contextRes.error).toBeNull()
    expect(contextRes.data).toHaveLength(1)
    expect(contextRes.data?.[0]?.goal_id).toBe(goalId)
  })

  it('insertGoalNodeLessonMatches inserts a readable match row', async () => {
    const goalRes = await createGoal({
      title: `TQ-147 match parent ${Date.now()}`,
      metadata: { source: 'vitest' },
    })
    expect(goalRes.error).toBeNull()
    const goalId = goalRes.data!.id
    createdGoalIds.push(goalId)

    const nodeRes = await insertGoalNodes(admin as never, [
      {
        goal_id: goalId,
        label: 'ATOM を選ぶ',
        node_type: 'task',
        sort_order: 0,
      },
    ])
    expect(nodeRes.error).toBeNull()
    const goalNodeId = nodeRes.data?.[0]?.id
    expect(goalNodeId).toBeTruthy()

    const snapshotInsert = await admin
      .from('coverage_index_snapshots')
      .insert({
        schema_version: 'v1',
        content_hash: '1234567890123456789012345678901234567890',
        built_at: new Date().toISOString(),
        payload: {
          schema_version: 'v1',
          content_hash: '1234567890123456789012345678901234567890',
          built_at: new Date().toISOString(),
          lessons: [],
          atoms: [],
          capabilities: [],
          support_assets: [],
          warnings: [],
        },
      })
      .select('id')
      .single()

    expect(snapshotInsert.error).toBeFalsy()
    const coverageSnapshotId = (snapshotInsert.data as { id: string }).id
    createdCoverageSnapshotIds.push(coverageSnapshotId)

    const matchRes = await insertGoalNodeLessonMatches(admin as never, [
      {
        goal_node_id: goalNodeId!,
        lesson_id: 'atom.web.goal',
        score: 0.9999,
        rationale: 'capability=1.0000',
        selected: true,
        coverage_snapshot_id: coverageSnapshotId,
      },
    ])

    expect(matchRes.error).toBeNull()
    expect(matchRes.data).toHaveLength(1)
    expect(matchRes.data?.[0]?.lesson_id).toBe('atom.web.goal')
    expect(matchRes.data?.[0]?.selected).toBe(true)

    const ledger = admin.schema('decision_ledger' as never) as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            single: () => Promise<{
              data: { id: string; lesson_id: string; selected: boolean } | null
              error: unknown
            }>
          }
        }
      }
    }
    const check = await ledger
      .from('goal_node_lesson_matches')
      .select('id,lesson_id,selected')
      .eq('id', matchRes.data![0].id)
      .single()

    expect(check.error).toBeFalsy()
    expect(check.data?.lesson_id).toBe('atom.web.goal')
    expect(check.data?.selected).toBe(true)
  })

  it('updateLessonGapStatus marks a persisted lesson gap as dismissed', async () => {
    const actionId = `action-${randomUUID()}`
    const gapRes = await upsertLessonGap({
      action_id: actionId,
      goal_id: null,
      weakest_axis: 'evidence',
      score: 0.2,
      capability_score: 0.1,
      prerequisite_score: 0.8,
      blocker_score: 0.7,
      evidence_score: 0.1,
      evidence: {
        fixture: true,
      },
      top_mappings: [],
      status: 'open',
      metadata: {
        source: 'vitest',
      },
    })

    expect(gapRes.error).toBeNull()
    expect(gapRes.data?.status).toBe('open')

    const gapId = gapRes.data!.id
    createdLessonGapIds.push(gapId)

    const updateRes = await updateLessonGapStatus(
      admin as never,
      gapId,
      'dismissed',
    )

    expect(updateRes.error).toBeNull()
    expect(updateRes.data?.id).toBe(gapId)
    expect(updateRes.data?.status).toBe('dismissed')
  })

  it('insertApprovalGate + listPendingApprovalGates handle lesson_proposal gates', async () => {
    const gateRes = await insertApprovalGate({
      gate_type: 'lesson_proposal',
      requested_by: 'vitest',
      metadata: {
        lesson_dev_proposal_id: randomUUID(),
        source: 'vitest',
      },
    })

    expect(gateRes.error).toBeNull()
    expect(gateRes.data?.gate_type).toBe('lesson_proposal')
    expect(gateRes.data?.status).toBe('pending')

    if (gateRes.data?.id) {
      createdApprovalGateIds.push(gateRes.data.id)
    }

    const pendingRes = await listPendingApprovalGates('lesson_proposal')
    expect(pendingRes.error).toBeNull()
    expect(
      pendingRes.data?.some((row) => row.id === gateRes.data?.id),
    ).toBe(true)
  })
})
