import { expect, test, type Page } from '@playwright/test'

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

const GOAL_TEXT = 'Shopify の売上計測を改善したい'
const EXPECTED_CAPABILITY = 'measure'
const EXPECTED_OUTCOME = 'measure_performance'

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
    }
  }
}

type ProposalIdRow = {
  id: string
}

type GateMetadataRow = {
  id: string
  metadata: Record<string, unknown> | null
}

type GapLoopGapRow = {
  id: string
  status: string
  goal_id: string
  weakest_axis: string
}

type GapLoopProposalRow = {
  id: string
  capability_slug: string
  outcome_slug: string
  owner_approval: string
  status: string
}

type GapLoopGateRow = {
  id: string
  gate_type: string
  status: string
  metadata: Record<string, unknown> | null
}

function buildGapLoopPlan(): AtomCompiledPlan {
  return {
    goal: GOAL_TEXT,
    goalTags: ['website-launch'],
    steps: [
      {
        atomId: 'atom.web-builder.deploy-ai-app-to-vercel',
        title: 'Shopify の売上を計測して改善点を整理する',
        rationale: '承認待ちが多く、売上計測の観測点も足りていないため',
        estimatedMinutes: 25,
        milestoneId: 'ms-gap-loop',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-gap-loop',
        title: '観測ギャップを洗い出す',
        description: 'まずは計測できていないポイントを特定する',
        atomIds: ['atom.web-builder.deploy-ai-app-to-vercel'],
      },
    ],
    coverageScore: 0.2,
    unsupportedCapabilities: ['measure_performance'],
    rationale: 'G2A gap loop E2E fixture',
    source: 'ai',
  }
}

async function resetGapLoopFixtures() {
  const admin = await getAdminClient()
  if (!admin) {
    throw new Error('Local Supabase admin client is not available.')
  }

  const ledger = getDecisionLedgerClient(admin)

  const proposals = await ledger
    .from<ProposalIdRow>('lesson_dev_proposals')
    .select('id')
    .eq('capability_slug', EXPECTED_CAPABILITY)
    .eq('outcome_slug', EXPECTED_OUTCOME)

  if (proposals.error) {
    throw new Error(`lesson_dev_proposals cleanup lookup failed: ${proposals.error.message}`)
  }

  const proposalIds = (proposals.data ?? []).map((row) => row.id)
  if (proposalIds.length > 0) {
    const gates = await ledger
      .from<GateMetadataRow>('approval_gates')
      .select('id,metadata')
      .eq('gate_type', 'lesson_proposal')

    if (gates.error) {
      throw new Error(`approval_gates cleanup lookup failed: ${gates.error.message}`)
    }

    const gateIds = (gates.data ?? [])
      .filter((row) => {
        const proposalId = (row.metadata as Record<string, unknown>)?.lesson_dev_proposal_id
        return typeof proposalId === 'string' && proposalIds.includes(proposalId)
      })
      .map((row) => row.id)

    if (gateIds.length > 0) {
      const gateDelete = await ledger
        .from('approval_gates')
        .delete()
        .in('id', gateIds)
      if (gateDelete.error) {
        throw new Error(`approval_gates cleanup failed: ${gateDelete.error.message}`)
      }
    }
  }

  if (proposalIds.length > 0) {
    const proposalDelete = await ledger
      .from('lesson_dev_proposals')
      .delete()
      .in('id', proposalIds)
    if (proposalDelete.error) {
      throw new Error(`lesson_dev_proposals cleanup failed: ${proposalDelete.error.message}`)
    }
  }

  const goalDelete = await ledger.from('goals').delete().eq('title', GOAL_TEXT)
  if (goalDelete.error) {
    throw new Error(`decision_ledger.goals cleanup failed: ${goalDelete.error.message}`)
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
    goalTags: ['website-launch'],
    personaIds: ['persona.web-builder'],
    learnerState: {
      skillLevel: 'beginner',
      blockers: ['approval'],
      signals: { source: 'playwright-g2a-d1' },
    },
    planId: null,
    planSeed: 'playwright-g2a-d1',
    atomPlan: buildGapLoopPlan(),
  })
}

async function fetchSchedulerResult(page: Page) {
  return page.evaluate(async (): Promise<SchedulerResponse> => {
    const response = await fetch('/api/scheduler/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: 'all' }),
    })

    return {
      status: response.status,
      body: await response.json(),
    }
  })
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
  'G2A gap loop (TQ-148)',
  { tag: ['@node:G2A-D1', '@db:real'] },
  () => {
    test('unfulfilled goal_node から gap / proposal / approval gate が作られ owner inbox で承認できる', async ({ page }) => {
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

      await resetGapLoopFixtures()
      await seedShadowGoal(owner.id)

      const loggedIn = await loginAsOwner(page)
      if (!loggedIn) {
        test.skip(true, 'Owner login is not available against the current local stack.')
        return
      }

      const schedulerResult = await fetchSchedulerResult(page)
      expect(schedulerResult.status).toBe(200)
      expect(schedulerResult.body.data?.gapScan?.gapsPersisted).toBeGreaterThanOrEqual(1)
      expect(schedulerResult.body.data?.proposerRun).toBeTruthy()

      const ledger = getDecisionLedgerClient(admin)

      const gapRows = await ledger
        .from<GapLoopGapRow>('lesson_gaps')
        .select('id,status,goal_id,weakest_axis')
        .eq('status', 'proposed')
        .eq('weakest_axis', 'evidence')

      const proposalRows = await ledger
        .from<GapLoopProposalRow>('lesson_dev_proposals')
        .select('id,capability_slug,outcome_slug,owner_approval,status')
        .eq('capability_slug', EXPECTED_CAPABILITY)
        .eq('outcome_slug', EXPECTED_OUTCOME)

      const gateRows = await ledger
        .from<GapLoopGateRow>('approval_gates')
        .select('id,gate_type,status,metadata')
        .eq('gate_type', 'lesson_proposal')
        .eq('status', 'pending')

      expect(gapRows.error).toBeNull()
      expect(proposalRows.error).toBeNull()
      expect(gateRows.error).toBeNull()
      expect((gapRows.data ?? []).length).toBeGreaterThanOrEqual(1)
      expect((proposalRows.data ?? []).length).toBe(1)

      const proposalId = String(proposalRows.data?.[0]?.id ?? '')
      const pendingGate = (gateRows.data ?? []).find((row) =>
        (row.metadata as Record<string, unknown>)?.lesson_dev_proposal_id === proposalId,
      )
      expect(pendingGate).toBeTruthy()
      expect(
        (pendingGate?.metadata as Record<string, unknown>)?.lesson_dev_proposal_id,
      ).toBe(proposalId)

      await page.goto('/dev/journeys/approval-inbox')
      await expect(
        page.getByRole('heading', { name: 'lesson proposal 承認 inbox' }),
      ).toBeVisible()
      const gateCard = page.getByTestId(`approval-inbox-gate-${String(pendingGate?.id ?? '')}`)
      await expect(gateCard.getByText(`${EXPECTED_CAPABILITY} / ${EXPECTED_OUTCOME}`)).toBeVisible()
      await expect(gateCard.getByRole('button', { name: '承認する' })).toBeVisible()

      await approveLessonProposalWithAdmin({
        admin,
        proposalId,
        gateId: String(pendingGate?.id ?? ''),
        reviewer: owner.email ?? owner.id,
      })

      await expect
        .poll(async () => {
          const approvedProposalRows = await ledger
            .from<GapLoopProposalRow>('lesson_dev_proposals')
            .select('id,owner_approval,status')
            .eq('capability_slug', EXPECTED_CAPABILITY)
            .eq('outcome_slug', EXPECTED_OUTCOME)

          return approvedProposalRows.data?.[0]?.owner_approval ?? null
        }, { timeout: 20_000 })
        .toBe('approved')

      const approvedGateRows = await ledger
        .from<GapLoopGateRow>('approval_gates')
        .select('id,status,metadata')
        .eq('gate_type', 'lesson_proposal')
        .eq('status', 'approved')

      const approvedProposalRows = await ledger
        .from<GapLoopProposalRow>('lesson_dev_proposals')
        .select('id,owner_approval,status')
        .eq('capability_slug', EXPECTED_CAPABILITY)
        .eq('outcome_slug', EXPECTED_OUTCOME)

      expect(approvedGateRows.error).toBeNull()
      expect(approvedProposalRows.error).toBeNull()
      const approvedGate = (approvedGateRows.data ?? []).find((row) =>
        (row.metadata as Record<string, unknown>)?.lesson_dev_proposal_id === proposalId,
      )
      expect(approvedGate).toBeTruthy()
      expect(approvedProposalRows.data?.[0]?.owner_approval).toBe('approved')
      expect(['approved', 'in_factory']).toContain(
        approvedProposalRows.data?.[0]?.status,
      )
      })
    })
  },
)
