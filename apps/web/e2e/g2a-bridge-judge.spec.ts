import { expect, test, type Page } from '@playwright/test'

import { runLessonProposalBridge } from '@/lib/goal-action/bridge-runner'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import { runGoalTreeShadowWrite } from '@/lib/planner/goal-tree-shadow'
import { withE2ELock } from './helpers/e2e-lock'

import {
  ensureOwnerUser,
  getAdminClient,
  getDecisionLedgerClient,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  loginAsOwner,
} from './helpers'

const GOAL_TEXT = '社内承認フローの接続状況を見える化したい'

type SchedulerResponse = {
  status: number
  body: {
    data?: {
      gapScan?: {
        gapsPersisted: number
      }
      proposerRun?: {
        proposalsPersisted: number
        approvalGatesCreated: number
      }
      judgeRun?: {
        runId: string | null
        agentRunId: string | null
        evaluationRunIds: string[]
      }
    }
  }
}

type AgentRunRow = {
  id: string
  run_status: string
  started_at: string
  metadata: Record<string, unknown> | null
  artifacts: Record<string, unknown> | null
}

type GoalLookupRow = {
  id: string
  title: string
}

type GapLookupRow = {
  id: string
  goal_id: string
  status: string
}

type ProposalGapRow = {
  id: string
  gap_ids: string[]
}

type ProposalLookupRow = {
  id: string
  capability_slug: string
  outcome_slug: string
  gap_ids: string[]
  owner_approval: string
  status: string
}

type ProposalStatusRow = {
  id: string
  owner_approval: string
  status: string
}

type ApprovalGateRow = {
  id: string
  status: string
  metadata: Record<string, unknown> | null
}

type EvaluationRunRow = {
  id: string
  agent_run_id: string
  evaluator: string
  details: Record<string, unknown> | null
}

function buildBridgeJudgePlan(): AtomCompiledPlan {
  return {
    goal: GOAL_TEXT,
    goalTags: ['internal-ops'],
    steps: [
      {
        atomId: 'atom.office-automator.approval-workflow',
        title: '承認フローの接続ポイントを洗い出して観測する',
        rationale: '承認経路のボトルネックを見える化したい',
        estimatedMinutes: 30,
        milestoneId: 'ms-g2a-e1',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-g2a-e1',
        title: '承認フローの可視化ギャップを埋める',
        description: '接続状況の観測と改善ポイントを整理する',
        atomIds: ['atom.office-automator.approval-workflow'],
      },
    ],
    coverageScore: 0.15,
    unsupportedCapabilities: ['connect_systems'],
    rationale: 'G2A bridge + judge E2E fixture',
    source: 'ai',
  }
}

async function resetBridgeJudgeFixtures() {
  const admin = await getAdminClient()
  if (!admin) {
    throw new Error('Local Supabase admin client is not available.')
  }

  const ledger = getDecisionLedgerClient(admin)

  const goalRows = await ledger
    .from<GoalLookupRow>('goals')
    .select('id,title')
    .eq('title', GOAL_TEXT)

  if (goalRows.error) {
    throw new Error(`goals cleanup lookup failed: ${goalRows.error.message}`)
  }

  const goalIds = (goalRows.data ?? []).map((row) => String(row.id))
  const gapRows: {
    data: GapLookupRow[] | null
    error: { message: string } | null
  } = goalIds.length === 0
    ? { data: [], error: null }
    : await ledger
        .from<GapLookupRow>('lesson_gaps')
        .select('id,goal_id')
        .in('goal_id', goalIds)

  if (gapRows.error) {
    throw new Error(`lesson_gaps cleanup lookup failed: ${gapRows.error.message}`)
  }

  const gapIds = (gapRows.data ?? []).map((row) => String(row.id))
  const allProposalRows = await ledger
    .from<ProposalGapRow>('lesson_dev_proposals')
    .select('id,gap_ids')

  if (allProposalRows.error) {
    throw new Error(`lesson_dev_proposals cleanup lookup failed: ${allProposalRows.error.message}`)
  }

  const proposalIds = (allProposalRows.data ?? [])
    .filter((row) =>
      Array.isArray(row.gap_ids) &&
      row.gap_ids.some((gapId) => gapIds.includes(String(gapId))),
    )
    .map((row) => String(row.id))

  if (proposalIds.length > 0) {
    const gateRows = await ledger
      .from<ApprovalGateRow>('approval_gates')
      .select('id,metadata')
      .eq('gate_type', 'lesson_proposal')
      .in('status', ['pending', 'approved', 'rejected', 'expired'])

    if (gateRows.error) {
      throw new Error(`approval_gates cleanup lookup failed: ${gateRows.error.message}`)
    }

    const gateIds = (gateRows.data ?? [])
      .filter((row) => {
        const metadata = row.metadata as Record<string, unknown> | null
        const proposalId = metadata?.lesson_dev_proposal_id
        return typeof proposalId === 'string' && proposalIds.includes(proposalId)
      })
      .map((row) => String(row.id))

    if (gateIds.length > 0) {
      const gateDelete = await ledger.from('approval_gates').delete().in('id', gateIds)
      if (gateDelete.error) {
        throw new Error(`approval_gates cleanup failed: ${gateDelete.error.message}`)
      }
    }

    const proposalDelete = await ledger
      .from('lesson_dev_proposals')
      .delete()
      .in('id', proposalIds)
    if (proposalDelete.error) {
      throw new Error(`lesson_dev_proposals cleanup failed: ${proposalDelete.error.message}`)
    }
  }

  if (gapIds.length > 0) {
    const gapDelete = await ledger.from('lesson_gaps').delete().in('id', gapIds)
    if (gapDelete.error) {
      throw new Error(`lesson_gaps cleanup failed: ${gapDelete.error.message}`)
    }
  }

  if (goalIds.length > 0) {
    const goalDelete = await ledger.from('goals').delete().in('id', goalIds)
    if (goalDelete.error) {
      throw new Error(`decision_ledger.goals cleanup failed: ${goalDelete.error.message}`)
    }
  }
}

async function seedShadowGoal(ownerId: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    LOCAL_SUPABASE_URL || 'http://127.0.0.1:54341'
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    LOCAL_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

  await runGoalTreeShadowWrite({
    userId: ownerId,
    goal: GOAL_TEXT,
    goalTags: ['internal-ops'],
    personaIds: ['persona.office-automator'],
    learnerState: {
      skillLevel: 'beginner',
      blockers: ['approval'],
      signals: { source: 'playwright-g2a-e1' },
    },
    planId: null,
    planSeed: 'playwright-g2a-e1',
    atomPlan: buildBridgeJudgePlan(),
  })
}

async function fetchSchedulerResult(page: Page, job: string) {
  return page.evaluate(async (jobName): Promise<SchedulerResponse> => {
    const response = await fetch('/api/scheduler/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: jobName }),
    })

    return {
      status: response.status,
      body: await response.json(),
    }
  }, job)
}

async function approveLessonProposalWithAdmin(params: {
  admin: Awaited<ReturnType<typeof getAdminClient>>
  proposalId: string
  gateId: string
  reviewer: string
}) {
  const reviewedAt = new Date().toISOString()
  const ledger = getDecisionLedgerClient(params.admin!)

  const proposalUpdate = await ledger
    .from('lesson_dev_proposals')
    .update({
      owner_approval: 'approved',
      owner_reviewed_by: params.reviewer,
      owner_reviewed_at: reviewedAt,
      owner_review_reason: null,
      status: 'approved',
      updated_at: reviewedAt,
    })
    .eq('id', params.proposalId)

  if (proposalUpdate.error) {
    throw new Error(`lesson_dev_proposals approval failed: ${proposalUpdate.error.message}`)
  }

  const gateUpdate = await ledger
    .from('approval_gates')
    .update({
      status: 'approved',
      decided_by: params.reviewer,
      decided_at: reviewedAt,
      reason: null,
    })
    .eq('id', params.gateId)

  if (gateUpdate.error) {
    throw new Error(`approval_gates approval failed: ${gateUpdate.error.message}`)
  }
}

test.describe(
  'G2A bridge + judge (TQ-149)',
  { tag: ['@node:G2A-E1', '@db:real'] },
  () => {
    test('approved proposal から bridge が eval まで進み、judge が evaluation_runs / agent_runs に書き、publish/stable は自動化されない', async ({ page }) => {
      test.setTimeout(60_000)
      await withE2ELock('g2a-scheduler', async () => {
      const admin = await getAdminClient()
      if (!admin) {
        test.skip(true, 'Local Supabase is not available.')
        return
      }

      const owner = await ensureOwnerUser()
      if (!owner) {
        test.skip(true, 'Owner user could not be provisioned.')
        return
      }

      const startedAt = new Date().toISOString()

      await resetBridgeJudgeFixtures()
      await seedShadowGoal(owner.id)

      const loggedIn = await loginAsOwner(page)
      if (!loggedIn) {
        test.skip(true, 'Owner login is not available against the current local stack.')
        return
      }

      const schedulerResult = await fetchSchedulerResult(page, 'all')
      expect(schedulerResult.status).toBe(200)
      expect(schedulerResult.body.data?.gapScan?.gapsPersisted).toBeGreaterThanOrEqual(1)
      expect(schedulerResult.body.data?.proposerRun).toBeTruthy()

      const ledger = getDecisionLedgerClient(admin)

      const goalRows = await ledger
        .from<GoalLookupRow>('goals')
        .select('id,title')
        .eq('title', GOAL_TEXT)

      expect(goalRows.error).toBeNull()
      expect((goalRows.data ?? []).length).toBe(1)

      const goalId = String(goalRows.data?.[0]?.id ?? '')
      const gapRows = await ledger
        .from<GapLookupRow>('lesson_gaps')
        .select('id,goal_id,status')
        .eq('goal_id', goalId)
        .eq('status', 'proposed')

      expect(gapRows.error).toBeNull()
      expect((gapRows.data ?? []).length).toBeGreaterThanOrEqual(1)

      const gapIds = (gapRows.data ?? []).map((row) => String(row.id))
      const proposalRows = await ledger
        .from<ProposalLookupRow>('lesson_dev_proposals')
        .select('id,capability_slug,outcome_slug,gap_ids,owner_approval,status')
        .order('proposed_at', { ascending: false })

      expect(proposalRows.error).toBeNull()

      const proposal = (proposalRows.data ?? []).find((row) =>
        Array.isArray(row.gap_ids) &&
        row.gap_ids.some((gapId) => gapIds.includes(String(gapId))),
      )

      expect(proposal).toBeTruthy()

      const proposalId = String(proposal?.id ?? '')
      const proposalLabel = `${String(proposal?.capability_slug ?? '')} / ${String(proposal?.outcome_slug ?? '')}`
      const gateRows = await ledger
        .from<ApprovalGateRow>('approval_gates')
        .select('id,metadata,status')
        .eq('gate_type', 'lesson_proposal')
        .eq('status', 'pending')

      expect(gateRows.error).toBeNull()
      const gate = (gateRows.data ?? []).find((row) => {
        const metadata = row.metadata as Record<string, unknown> | null
        return metadata?.lesson_dev_proposal_id === proposalId
      })

      expect(gate).toBeTruthy()
      const gateId = String(gate?.id ?? '')

      await page.goto('/dev/journeys/approval-inbox')
      await expect(
        page.getByRole('heading', { name: 'lesson proposal 承認 inbox' }),
      ).toBeVisible()
      const gateCard = page.getByTestId(`approval-inbox-gate-${gateId}`)
      await expect(gateCard.getByText(proposalLabel)).toBeVisible()
      await expect(gateCard.getByRole('button', { name: '承認する' })).toBeVisible()

      await approveLessonProposalWithAdmin({
        admin,
        proposalId,
        gateId,
        reviewer: owner.email ?? owner.id,
      })

      await expect
        .poll(async () => {
          const approvedProposalRows = await ledger
            .from<ProposalStatusRow>('lesson_dev_proposals')
            .select('id,owner_approval,status')
            .eq('id', proposalId)
          const approvedGateRows = await ledger
            .from<ApprovalGateRow>('approval_gates')
            .select('id,status')
            .eq('id', gateId)

          const proposalStatus = approvedProposalRows.data?.[0]?.status
          const gateStatus = approvedGateRows.data?.[0]?.status
          if (proposalStatus === 'approved' && gateStatus === 'approved') {
            return 'ready'
          }
          return `${proposalStatus ?? 'missing'}:${gateStatus ?? 'missing'}`
        }, { timeout: 10_000 })
        .toBe('ready')

      let bridgeResult: Awaited<ReturnType<typeof runLessonProposalBridge>> | null =
        null
      await expect
        .poll(async () => {
          bridgeResult = await runLessonProposalBridge(proposalId, {
            client: admin as never,
          })
          return bridgeResult.status
        }, { timeout: 20_000 })
        .toBe('success')

      await expect
        .poll(async () => {
          const refreshedProposalRows = await ledger
            .from<ProposalStatusRow>('lesson_dev_proposals')
            .select('id,owner_approval,status')
            .eq('id', proposalId)

          return refreshedProposalRows.data?.[0]?.status ?? null
        }, { timeout: 20_000 })
        .toBe('in_factory')

      let bridgeRun: AgentRunRow | null = null
      await expect
        .poll(async () => {
          const agentRows = await ledger
            .from('agent_runs')
            .select('id,run_status,started_at,metadata,artifacts')
            .order('started_at', { ascending: false })

          if (agentRows.error) {
            throw new Error(`agent_runs lookup failed: ${agentRows.error.message}`)
          }

          bridgeRun = ((agentRows.data ?? []).find((row) => {
            const metadata = row.metadata as Record<string, unknown> | null
            return (
              metadata?.kind === 'g2a_bridge' &&
              metadata?.proposal_id === proposalId &&
              typeof row.started_at === 'string' &&
              row.started_at >= startedAt
            )
          }) as AgentRunRow | undefined) ?? null

          return bridgeRun?.run_status ?? null
        }, { timeout: 20_000 })
        .toBe('success')

      const resolvedBridgeRun = bridgeRun as AgentRunRow | null
      const stageResults =
        ((resolvedBridgeRun?.artifacts as Record<string, unknown> | null)?.stage_results as Array<Record<string, unknown>> | undefined) ??
        []
      const executedStages = stageResults.map((row) => String(row.stage))
      expect(executedStages).toEqual([
        'intake',
        'context-fetch',
        'draft',
        'critique',
        'media',
        'eval',
      ])
      expect(
        stageResults.find((row) => row.stage === 'draft')?.status,
      ).toBe('success')
      expect(
        stageResults.find((row) => row.stage === 'critique')?.status,
      ).toBe('success')
      expect(
        stageResults.find((row) => row.stage === 'eval')?.status,
      ).toBe('success')
      expect(executedStages).not.toContain('publish')
      expect(executedStages).not.toContain('stable')

      const judgeResult = await fetchSchedulerResult(page, 'judge_run')
      expect(judgeResult.status).toBe(200)
      expect(judgeResult.body.data?.judgeRun?.agentRunId).toBeTruthy()
      expect(
        judgeResult.body.data?.judgeRun?.evaluationRunIds.length,
      ).toBeGreaterThanOrEqual(3)

      const judgeAgentRunId = String(
        judgeResult.body.data?.judgeRun?.agentRunId ?? '',
      )

      let evaluationRuns: Array<Record<string, unknown>> = []
      await expect
        .poll(async () => {
          const rows = await admin
            .schema('decision_ledger' as never)
            .from('evaluation_runs')
            .select('id,agent_run_id,evaluator,details')
            .eq('agent_run_id', judgeAgentRunId)

          if (rows.error) {
            throw new Error(`evaluation_runs lookup failed: ${rows.error.message}`)
          }

          evaluationRuns = (rows.data ?? []) as EvaluationRunRow[]
          return evaluationRuns.length
        }, { timeout: 20_000 })
        .toBe(3)

      const evaluationTargets = evaluationRuns.map((row) =>
        String((row.details as Record<string, unknown>)?.target ?? ''),
      ).sort()
      expect(evaluationTargets).toEqual(['gap', 'matcher', 'proposer'])
      })
    })
  },
)
