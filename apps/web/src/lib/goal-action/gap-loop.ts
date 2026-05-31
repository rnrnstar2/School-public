import {
  detectGaps,
  persistGaps,
  type LessonGap,
  type LessonGapPersistClient,
} from '../../../../../packages/goal-action/gaps/src/index'
import {
  COVERAGE_INDEX_SCHEMA_VERSION,
  CoverageIndexSchema,
} from '../../../../../packages/goal-action/coverage/src/schema'
import { matchActions } from '../../../../../packages/goal-action/matcher/src/match'
import {
  CanonicalActionSchema,
  type CanonicalAction,
} from '../../../../../packages/goal-action/normalizer/src/schema'
import {
  generateProposals,
  persistProposals,
  type LessonDevProposalPersistClient,
  type LessonDevProposalPersistRow,
} from '../../../../../packages/goal-action/proposer/src/index'

import {
  findLatestApprovalGateByProposalId,
  insertApprovalGate,
} from '@/lib/supabase/decision-ledger'
import { createServiceClient } from '@/lib/supabase/service'

type GoalNodeCandidateRow = {
  id: string
  goal_id: string
  parent_node_id: string | null
  label: string
  node_type: 'task' | 'sub_task' | 'objective' | 'milestone'
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped'
  metadata: Record<string, unknown>
}

type GoalNodeParentRow = {
  parent_node_id: string | null
}

type CoverageSnapshotRow = {
  id: string
  payload: unknown
}

type LessonGapDbRow = {
  id: string
  action_id: string
  goal_id: string | null
  weakest_axis: LessonGap['weakestAxis']
  score: number
  capability_score: number | null
  prerequisite_score: number | null
  blocker_score: number | null
  evidence_score: number | null
  evidence: LessonGap['evidence']
  top_mappings: LessonGap['topMappings']
  status: LessonGap['status']
  detected_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

type ExistingLessonGapStatusRow = Pick<
  LessonGapDbRow,
  'action_id' | 'goal_id' | 'status'
>

type UntypedSupabaseResult<TRow> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>

type UntypedQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  in: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  maybeSingle: () => UntypedSupabaseResult<TRow>
  update: (values: Record<string, unknown>) => UntypedQueryBuilder<TRow>
  then: PromiseLike<{
    data: TRow[] | null
    error: { message: string } | null
  }>['then']
}

type UntypedLedgerClient = {
  from: <TRow = Record<string, unknown>>(table: string) => UntypedQueryBuilder<TRow>
}

type GoalNodeActionCandidate = {
  nodeId: string
  goalId: string
  label: string
  canonicalAction: CanonicalAction
}

export type GapLoopRunSummary = {
  enabled: boolean
  leafCandidates: number
  mappings: number
  gapsPersisted: number
  proposalsPersisted: number
  approvalGatesCreated: number
}

function getUntypedLedgerClient() {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerClient
    }
  ).schema('decision_ledger')
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown gap loop error'
}

function isDuplicatePendingLessonProposalGateError(error: string) {
  return (
    error.includes('idx_approval_gates_unique_pending_lesson_proposal') ||
    error.includes('duplicate key value violates unique constraint')
  )
}

export function isG2AGapLoopEnabled() {
  const flag = process.env.G2A_GAP_LOOP_ENABLED?.trim().toLowerCase()
  return flag !== 'off' && flag !== '0' && flag !== 'false'
}

async function loadLatestCoverageSnapshot() {
  const publicClient = createServiceClient()
  if (!publicClient) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const coverageClient = publicClient as unknown as {
    from: (table: 'coverage_index_snapshots') => UntypedQueryBuilder<CoverageSnapshotRow>
  }
  const { data, error } = await coverageClient
    .from('coverage_index_snapshots')
    .select('id,payload')
    .eq('schema_version', COVERAGE_INDEX_SCHEMA_VERSION)
    .order('built_at', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`coverage_index_snapshots lookup failed: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    coverageIndex: CoverageIndexSchema.parse(data.payload),
  }
}

async function loadLeafGoalNodeCandidates(ledger: UntypedLedgerClient) {
  const [nodesResult, parentsResult] = await Promise.all([
    ledger
      .from<GoalNodeCandidateRow>('goal_nodes')
      .select('id,goal_id,parent_node_id,label,node_type,status,metadata')
      .in('node_type', ['task', 'sub_task'])
      .in('status', ['pending', 'in_progress', 'blocked']),
    ledger
      .from<GoalNodeParentRow>('goal_nodes')
      .select('parent_node_id')
      .in('node_type', ['task', 'sub_task']),
  ])

  if (nodesResult.error) {
    throw new Error(`goal_nodes lookup failed: ${nodesResult.error.message}`)
  }
  if (parentsResult.error) {
    throw new Error(`goal_nodes parent lookup failed: ${parentsResult.error.message}`)
  }

  const parentIds = new Set(
    (parentsResult.data ?? [])
      .map((row) => row.parent_node_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )

  const candidates: GoalNodeActionCandidate[] = []

  for (const row of nodesResult.data ?? []) {
    if (parentIds.has(row.id)) {
      continue
    }

    const parsed = CanonicalActionSchema.safeParse(row.metadata?.canonical_action)
    if (!parsed.success) {
      continue
    }

    candidates.push({
      nodeId: row.id,
      goalId: row.goal_id,
      label: row.label,
      canonicalAction: parsed.data,
    })
  }

  return candidates
}

function toProposalGoalIdMap(gaps: LessonGapDbRow[]) {
  const goalIdsByGapId = new Map(gaps.map((gap) => [gap.id, gap.goal_id] as const))

  return (gapIds: string[]) => {
    const goalIds = [...new Set(
      gapIds
        .map((gapId) => goalIdsByGapId.get(gapId) ?? null)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )]

    return goalIds.length === 1 ? goalIds[0] : null
  }
}

function toGoalActionKey(goalId: string | null, actionId: string) {
  return `${goalId ?? ''}|${actionId}`
}

async function loadExistingLessonGapStatuses(
  ledger: UntypedLedgerClient,
  gaps: LessonGap[],
) {
  if (gaps.length === 0) {
    return []
  }

  const actionIds = [...new Set(gaps.map((gap) => gap.actionId))]
  const goalIds = [...new Set(
    gaps
      .map((gap) => gap.goalId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )]

  let query = ledger
    .from<ExistingLessonGapStatusRow>('lesson_gaps')
    .select('action_id,goal_id,status')
    .in('action_id', actionIds)

  if (goalIds.length > 0) {
    query = query.in('goal_id', goalIds)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`lesson_gaps status lookup failed: ${error.message}`)
  }

  const relevantKeys = new Set(
    gaps.map((gap) => toGoalActionKey(gap.goalId, gap.actionId)),
  )

  return (data ?? []).filter((row) =>
    relevantKeys.has(toGoalActionKey(row.goal_id, row.action_id)),
  )
}

async function markGapsProposed(
  ledger: UntypedLedgerClient,
  gapIds: string[],
  nowIso: string,
) {
  if (gapIds.length === 0) {
    return
  }

  const { error } = await (
    ledger
      .from('lesson_gaps')
      .update({
        status: 'proposed',
        updated_at: nowIso,
      })
      .in('id', gapIds) as unknown as Promise<{ error: { message: string } | null }>
  )

  if (error) {
    throw new Error(`lesson_gaps update failed: ${error.message}`)
  }
}

async function ensureLessonProposalApprovalGate(params: {
  proposal: LessonDevProposalPersistRow
  proposalGoalId: string | null
  requestedAt: string
}) {
  const existing = await findLatestApprovalGateByProposalId(params.proposal.id)
  if (existing.error) {
    throw new Error(existing.error)
  }

  if (existing.data) {
    return false
  }

  const insertResult = await insertApprovalGate({
    goal_id: params.proposalGoalId,
    gate_type: 'lesson_proposal',
    status: 'pending',
    requested_by: 'scheduler',
    requested_at: params.requestedAt,
    metadata: {
      lesson_dev_proposal_id: params.proposal.id,
      capability_slug: params.proposal.capability_slug,
      outcome_slug: params.proposal.outcome_slug,
      gap_ids: params.proposal.gap_ids,
    },
  })

  if (insertResult.error) {
    if (isDuplicatePendingLessonProposalGateError(insertResult.error)) {
      return false
    }
    throw new Error(insertResult.error)
  }

  return true
}

async function persistDetectedGaps(params: {
  ledger: UntypedLedgerClient
  gaps: LessonGap[]
}) {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const existingRows = await loadExistingLessonGapStatuses(params.ledger, params.gaps)
  const existingStatusByKey = new Map(
    existingRows.map((row) => [
      toGoalActionKey(row.goal_id, row.action_id),
      row.status,
    ] as const),
  )
  const gapsToPersist = params.gaps.map((gap) => {
    const existingStatus = existingStatusByKey.get(
      toGoalActionKey(gap.goalId, gap.actionId),
    )

    if (!existingStatus || existingStatus === 'open') {
      return gap
    }

    return {
      ...gap,
      status: existingStatus,
    }
  })

  const persistResult = await persistGaps(
    gapsToPersist,
    client as unknown as LessonGapPersistClient,
  )

  if (persistResult.error || !persistResult.data) {
    throw new Error(persistResult.error ?? 'persistGaps returned no rows')
  }

  return persistResult.data
}

async function loadOpenLessonGaps(ledger: UntypedLedgerClient) {
  const { data, error } = await ledger
    .from<LessonGapDbRow>('lesson_gaps')
    .select(
      'id,action_id,goal_id,weakest_axis,score,capability_score,prerequisite_score,blocker_score,evidence_score,evidence,top_mappings,status,detected_at,updated_at,metadata',
    )
    .eq('status', 'open')
    .order('detected_at', { ascending: true })

  if (error) {
    throw new Error(`lesson_gaps lookup failed: ${error.message}`)
  }

  return data ?? []
}

function toProposalInputGaps(rows: LessonGapDbRow[]) {
  return rows.map((row) => ({
    actionId: row.action_id,
    goalId: row.goal_id,
    weakestAxis: row.weakest_axis,
    score: Number(row.score),
    capabilityScore: Number(row.capability_score ?? 0),
    prerequisiteScore: Number(row.prerequisite_score ?? 0),
    blockerScore: Number(row.blocker_score ?? 0),
    evidenceScore: Number(row.evidence_score ?? 0),
    evidence: row.evidence,
    topMappings: row.top_mappings,
    status: row.status,
    detectedAt: row.detected_at,
    updatedAt: row.updated_at,
    metadata: {
      ...(row.metadata ?? {}),
      gapId: row.id,
    },
  }))
}

async function persistGeneratedProposals(params: {
  proposals: ReturnType<typeof generateProposals>
}) {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const persistResult = await persistProposals(
    params.proposals,
    client as unknown as LessonDevProposalPersistClient,
  )

  if (persistResult.error || !persistResult.data) {
    throw new Error(persistResult.error ?? 'persistProposals returned no rows')
  }

  return persistResult.data
}

export async function runGapScanJob(): Promise<GapLoopRunSummary> {
  if (!isG2AGapLoopEnabled()) {
    return {
      enabled: false,
      leafCandidates: 0,
      mappings: 0,
      gapsPersisted: 0,
      proposalsPersisted: 0,
      approvalGatesCreated: 0,
    }
  }

  const ledger = getUntypedLedgerClient()
  const coverageSnapshot = await loadLatestCoverageSnapshot()
  if (!coverageSnapshot) {
    return {
      enabled: true,
      leafCandidates: 0,
      mappings: 0,
      gapsPersisted: 0,
      proposalsPersisted: 0,
      approvalGatesCreated: 0,
    }
  }

  const candidates = await loadLeafGoalNodeCandidates(ledger)
  if (candidates.length === 0) {
    return {
      enabled: true,
      leafCandidates: 0,
      mappings: 0,
      gapsPersisted: 0,
      proposalsPersisted: 0,
      approvalGatesCreated: 0,
    }
  }

  const mappings = candidates.flatMap((candidate) =>
    matchActions({
      actions: [candidate.canonicalAction],
      coverageIndex: coverageSnapshot.coverageIndex,
      topK: 3,
    }).map((mapping) => ({
      ...mapping,
      goalId: candidate.goalId,
    })),
  )

  const candidateByGoalActionKey = new Map(
    candidates.map((candidate) => [
      toGoalActionKey(candidate.goalId, candidate.canonicalAction.actionId),
      candidate,
    ] as const),
  )

  const detected = detectGaps({
    mappings,
    now: new Date().toISOString(),
  }).map((gap) => {
    const candidate = candidateByGoalActionKey.get(
      toGoalActionKey(gap.goalId, gap.actionId),
    )
    return {
      ...gap,
      metadata: {
        ...(gap.metadata ?? {}),
        goalNodeId: candidate?.nodeId ?? null,
        nodeLabel: candidate?.label ?? null,
        coverageSnapshotId: coverageSnapshot.id,
      },
    }
  })

  const persistedRows = await persistDetectedGaps({ gaps: detected, ledger })

  return {
    enabled: true,
    leafCandidates: candidates.length,
    mappings: mappings.length,
    gapsPersisted: persistedRows.length,
    proposalsPersisted: 0,
    approvalGatesCreated: 0,
  }
}

export async function runProposerJob(): Promise<GapLoopRunSummary> {
  if (!isG2AGapLoopEnabled()) {
    return {
      enabled: false,
      leafCandidates: 0,
      mappings: 0,
      gapsPersisted: 0,
      proposalsPersisted: 0,
      approvalGatesCreated: 0,
    }
  }

  const ledger = getUntypedLedgerClient()
  const openGapRows = await loadOpenLessonGaps(ledger)
  if (openGapRows.length === 0) {
    return {
      enabled: true,
      leafCandidates: 0,
      mappings: 0,
      gapsPersisted: 0,
      proposalsPersisted: 0,
      approvalGatesCreated: 0,
    }
  }

  const proposals = generateProposals({
    gaps: toProposalInputGaps(openGapRows),
    now: new Date().toISOString(),
  })
  const persistedProposals = await persistGeneratedProposals({ proposals })
  const proposalGoalIdFor = toProposalGoalIdMap(openGapRows)

  let approvalGatesCreated = 0
  for (const proposal of persistedProposals) {
    if (
      await ensureLessonProposalApprovalGate({
        proposal,
        proposalGoalId: proposalGoalIdFor(proposal.gap_ids),
        requestedAt: new Date().toISOString(),
      })
    ) {
      approvalGatesCreated += 1
    }
  }

  await markGapsProposed(
    ledger,
    openGapRows.map((row) => row.id),
    new Date().toISOString(),
  )

  return {
    enabled: true,
    leafCandidates: 0,
    mappings: 0,
    gapsPersisted: 0,
    proposalsPersisted: persistedProposals.length,
    approvalGatesCreated,
  }
}

export async function runGapLoop(): Promise<{
  gapScan: GapLoopRunSummary
  proposerRun: GapLoopRunSummary
}> {
  try {
    const gapScan = await runGapScanJob()
    const proposerRun = await runProposerJob()
    return { gapScan, proposerRun }
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}
