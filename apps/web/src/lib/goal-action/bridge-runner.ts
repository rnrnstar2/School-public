// TQ-223: This runner wraps packages/goal-action/bridge/src/runner. The
// learner-facing prompt surfaces it eventually triggers (lesson-factory
// stages) live in lesson-factory adapters and are intentionally out of scope
// for the THREE_AXIS_GUIDE preamble (AI フル活用 / 非エンジニア / 最短) —
// they are atom-improvement prompts, not delivery-side prompts. Delivery-side
// surfaces are covered in apps/web/src/lib/prompts/* and lessons/*.

import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  execute,
  type BridgePersist,
  type IntakeWriter,
} from '../../../../../packages/goal-action/bridge/src/runner'
import {
  createExecPipelineClient,
  type PipelineClient,
} from '../../../../../packages/goal-action/bridge/src/pipeline-client'
import type {
  ApprovalRow,
  LessonDevProposalInput,
  StageResult,
} from '../../../../../packages/goal-action/bridge/src/schema'

import {
  insertAgentRun,
  type ApprovalGateRow,
  type LessonDevProposalRow,
} from '@/lib/supabase/decision-ledger'
import { createServiceClient } from '@/lib/supabase/service'

type LedgerClient = NonNullable<ReturnType<typeof createServiceClient>>

type UntypedLedgerResult<TRow> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>

type UntypedLedgerQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  update: (input: Record<string, unknown>) => UntypedLedgerQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedLedgerQueryBuilder<TRow>
  maybeSingle: () => UntypedLedgerResult<TRow>
  single: () => UntypedLedgerResult<TRow>
  then: PromiseLike<{
    data: TRow[] | null
    error: { message: string } | null
  }>['then']
}

type UntypedLedgerSchemaClient = {
  from: <TRow = Record<string, unknown>>(
    table: string,
  ) => UntypedLedgerQueryBuilder<TRow>
}

type ApprovedProposalIdRow = {
  id: string
}

type ProposalUpdateRow = Pick<LessonDevProposalRow, 'id' | 'status'>

export type BridgeRunResult = {
  proposalId: string
  approvalGateId: string | null
  bridgeRunId: string | null
  agentRunId: string | null
  status: 'success' | 'failed' | 'skipped' | 'disabled'
  pipelineMode: 'mock' | 'exec'
  error: string | null
}

export type BridgeJobSummary = {
  enabled: boolean
  candidates: number
  triggered: number
  completed: number
  failed: number
  skipped: number
  results: BridgeRunResult[]
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Unknown bridge error'
}

function getUntypedLedgerClient(client: LedgerClient): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

export function isG2ABridgeEnabled() {
  const flag = process.env.G2A_BRIDGE_ENABLED?.trim().toLowerCase()
  return flag !== 'off' && flag !== '0' && flag !== 'false'
}

function resolveBridgePipelineMode(): 'mock' | 'exec' {
  const explicit =
    process.env.G2A_BRIDGE_MODE?.trim().toLowerCase() ??
    process.env.G2A_BRIDGE_PIPELINE_MODE?.trim().toLowerCase()
  if (explicit === 'mock') {
    return 'mock'
  }
  if (explicit === 'exec') {
    return 'exec'
  }
  return process.env.PLAYWRIGHT === '1' ? 'exec' : 'mock'
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolveWorkspaceRoot(start: string) {
  let current = path.resolve(start)

  while (true) {
    if (await pathExists(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return path.resolve(start)
    }
    current = parent
  }
}

function createWorkspaceIntakeWriter(workspaceRoot: string): IntakeWriter {
  return {
    async writeIntakeYaml({ targetPath, bundle }) {
      const absolutePath = path.resolve(workspaceRoot, targetPath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, JSON.stringify(bundle, null, 2), 'utf8')
    },
  }
}

function mockStageStdout(stage: StageResult['stage'], slug: string) {
  const base = `lesson-factory/logs/runs/mock/${slug}`
  switch (stage) {
    case 'context-fetch':
      return `FreshContextBundle saved to ${base}.context.json (1 contexts).`
    case 'draft':
      return `Draft saved to ${base}.draft.json.`
    case 'critique':
      return `Critique saved to ${base}.critique.json.`
    case 'media':
      return `Media assets saved to ${base}.media.json.`
    case 'eval':
      return `Eval bundle saved to ${base}.eval.json.`
    case 'intake':
      return `wrote intake bundle to lesson-factory/logs/runs/bridge/${slug}.intake.yaml`
  }
}

function createMockPipelineClient(): PipelineClient {
  return {
    async run({ stage, slug }): Promise<StageResult> {
      return {
        stage,
        status: 'success',
        stdout: mockStageStdout(stage, slug),
        stderr: '',
        durationMs: 1,
        error: null,
      }
    },
  }
}

function toRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

async function loadApprovedProposalIds(client: LedgerClient) {
  const { data, error } = await getUntypedLedgerClient(client)
    .from<ApprovedProposalIdRow>('lesson_dev_proposals')
    .select('id')
    .eq('owner_approval', 'approved')
    .eq('status', 'approved')
    .order('proposed_at', { ascending: true })

  if (error) {
    throw new Error(`lesson_dev_proposals lookup failed: ${error.message}`)
  }

  return (data ?? []).map((row) => row.id)
}

async function loadLessonProposalById(
  client: LedgerClient,
  proposalId: string,
) {
  try {
    const { data, error } = await getUntypedLedgerClient(client)
      .from<LessonDevProposalRow>('lesson_dev_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return { data, error: null as string | null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

async function loadLatestApprovalGateByProposalId(
  client: LedgerClient,
  proposalId: string,
) {
  try {
    const approvedQuery = await getUntypedLedgerClient(client)
      .from<ApprovalGateRow>('approval_gates')
      .select('*')
      .eq('gate_type', 'lesson_proposal')
      .eq('status', 'approved')
      .eq('metadata->>lesson_dev_proposal_id', proposalId)
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (approvedQuery.error) {
      throw approvedQuery.error
    }

    if (approvedQuery.data) {
      return { data: approvedQuery.data, error: null as string | null }
    }

    const { data, error } = await getUntypedLedgerClient(client)
      .from<ApprovalGateRow>('approval_gates')
      .select('*')
      .eq('gate_type', 'lesson_proposal')
      .eq('metadata->>lesson_dev_proposal_id', proposalId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    return { data, error: null as string | null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}

async function markProposalInFactory(
  client: LedgerClient,
  proposalId: string,
): Promise<ProposalUpdateRow> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await getUntypedLedgerClient(client)
    .from<ProposalUpdateRow>('lesson_dev_proposals')
    .update({
      status: 'in_factory',
      updated_at: updatedAt,
    })
    .eq('id', proposalId)
    .eq('status', 'reserved')
    .select('id,status')
    .single()

  if (error) {
    throw new Error(`lesson_dev_proposals update failed: ${error.message}`)
  }
  if (!data) {
    throw new Error('lesson_dev_proposals update returned no row')
  }

  return data
}

async function reserveProposalForFactory(
  client: LedgerClient,
  proposalId: string,
): Promise<ProposalUpdateRow | null> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await getUntypedLedgerClient(client)
    .from<ProposalUpdateRow>('lesson_dev_proposals')
    .update({
      status: 'reserved',
      updated_at: updatedAt,
    })
    .eq('id', proposalId)
    .eq('owner_approval', 'approved')
    .eq('status', 'approved')
    .select('id,status')
    .maybeSingle()

  if (error) {
    throw new Error(`lesson_dev_proposals reserve failed: ${error.message}`)
  }

  return data
}

async function releaseReservedProposal(
  client: LedgerClient,
  proposalId: string,
): Promise<ProposalUpdateRow | null> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await getUntypedLedgerClient(client)
    .from<ProposalUpdateRow>('lesson_dev_proposals')
    .update({
      status: 'approved',
      updated_at: updatedAt,
    })
    .eq('id', proposalId)
    .eq('status', 'reserved')
    .select('id,status')
    .maybeSingle()

  if (error) {
    throw new Error(`lesson_dev_proposals release failed: ${error.message}`)
  }

  return data
}

function buildPersist(client: LedgerClient, params: {
  proposal: LessonDevProposalRow
  gate: ApprovalGateRow
  pipelineMode: 'mock' | 'exec'
}) {
  let agentRunId: string | null = null

  const persist: BridgePersist = {
    async recordRun(row) {
      const insertResult = await insertAgentRun(client, {
        goal_id: params.gate.goal_id,
        agent_type: 'script',
        run_status: row.status === 'success' ? 'success' : 'failed',
        started_at: row.startedAt,
        finished_at: row.finishedAt,
        input_summary: `lesson proposal approved: ${params.proposal.capability_slug}/${params.proposal.outcome_slug}`,
        output_summary:
          row.status === 'success'
            ? `lesson-factory bridge completed through eval (${row.slug})`
            : `lesson-factory bridge failed at ${row.failedStage ?? 'unknown'}`,
        artifacts: {
          slug: row.slug,
          stage_results: row.stageResults,
        },
        error_message: row.error,
        metadata: {
          kind: 'g2a_bridge',
          proposal_id: params.proposal.id,
          approval_gate_id: params.gate.id,
          pipeline_mode: params.pipelineMode,
          failed_stage: row.failedStage,
        },
      })

      if (insertResult.error) {
        throw new Error(insertResult.error)
      }

      agentRunId = insertResult.data?.id ?? null
    },
  }

  return {
    persist,
    getAgentRunId: () => agentRunId,
  }
}

type RunLessonProposalBridgeOptions = {
  client?: LedgerClient
  pipelineClient?: PipelineClient
  workspaceRoot?: string
  now?: () => Date
}

export async function runLessonProposalBridge(
  proposalId: string,
  options: RunLessonProposalBridgeOptions = {},
): Promise<BridgeRunResult> {
  const pipelineMode = resolveBridgePipelineMode()

  if (!isG2ABridgeEnabled()) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'disabled',
      pipelineMode,
      error: null,
    }
  }

  const client = options.client ?? createServiceClient()
  if (!client) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'failed',
      pipelineMode,
      error:
        'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    }
  }

  const proposalResult = await loadLessonProposalById(client, proposalId)
  if (proposalResult.error) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'failed',
      pipelineMode,
      error: proposalResult.error,
    }
  }

  const proposal = proposalResult.data
  if (!proposal) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'skipped',
      pipelineMode,
      error: 'lesson proposal not found',
    }
  }

  if (
    proposal.owner_approval !== 'approved' ||
    proposal.status !== 'approved'
  ) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'skipped',
      pipelineMode,
      error: null,
    }
  }

  const gateResult = await loadLatestApprovalGateByProposalId(client, proposalId)
  if (gateResult.error) {
    return {
      proposalId,
      approvalGateId: null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'failed',
      pipelineMode,
      error: gateResult.error,
    }
  }

  const gate = gateResult.data
  if (!gate || gate.status !== 'approved') {
    return {
      proposalId,
      approvalGateId: gate?.id ?? null,
      bridgeRunId: null,
      agentRunId: null,
      status: 'skipped',
      pipelineMode,
      error: null,
    }
  }

  const reservedProposal = await reserveProposalForFactory(client, proposalId)
  if (!reservedProposal) {
    return {
      proposalId,
      approvalGateId: gate.id,
      bridgeRunId: null,
      agentRunId: null,
      status: 'skipped',
      pipelineMode,
      error: null,
    }
  }

  const workspaceRoot =
    options.workspaceRoot ?? (await resolveWorkspaceRoot(process.cwd()))
  const pipelineClient =
    options.pipelineClient ??
    (pipelineMode === 'mock'
      ? createMockPipelineClient()
      : createExecPipelineClient({
          cwd: workspaceRoot,
        }))
  const intakeWriter = createWorkspaceIntakeWriter(workspaceRoot)
  const persisted = buildPersist(client, {
    proposal,
    gate,
    pipelineMode,
  })
  const approvedGate: ApprovalRow = {
    id: gate.id,
    gate_type: gate.gate_type,
    status: gate.status,
    decided_by: gate.decided_by,
    decided_at: gate.decided_at,
    reason: gate.reason,
    expires_at: gate.expires_at,
    metadata: toRecord(gate.metadata),
  }
  const approvedProposal: LessonDevProposalInput = {
    id: proposal.id,
    capability_slug: proposal.capability_slug,
    outcome_slug: proposal.outcome_slug,
    priority: proposal.priority,
    status: 'reserved',
    gap_ids: proposal.gap_ids,
    weakest_axis: proposal.weakest_axis,
    evidence: toRecord(proposal.evidence),
    candidate_lesson_slug: proposal.candidate_lesson_slug,
    rationale: proposal.rationale,
    proposed_by: proposal.proposed_by,
    proposed_at: proposal.proposed_at,
    metadata: toRecord(proposal.metadata),
  }

  let bridgeExecutionSucceeded = false
  let reservationSettled = false

  try {
    const result = await execute(
      {
        proposal: approvedProposal,
        now: options.now,
      },
      {
        pipelineClient,
        approvalGate: {
          fetchRow: async () => approvedGate,
        },
        persist: persisted.persist,
        intakeWriter,
        now: options.now,
      },
    )

    if (result.status === 'success') {
      bridgeExecutionSucceeded = true
      await markProposalInFactory(client, proposalId)
      reservationSettled = true
    } else {
      await releaseReservedProposal(client, proposalId)
      reservationSettled = true
    }

    return {
      proposalId,
      approvalGateId: gate.id,
      bridgeRunId: result.runId,
      agentRunId: persisted.getAgentRunId(),
      status: result.status,
      pipelineMode,
      error: result.error,
    }
  } catch (error) {
    let message = toErrorMessage(error)

    if (!reservationSettled && !bridgeExecutionSucceeded) {
      try {
        await releaseReservedProposal(client, proposalId)
      } catch (releaseError) {
        message = `${message}; reservation rollback failed: ${toErrorMessage(releaseError)}`
      }
    }

    if (!persisted.getAgentRunId()) {
      await insertAgentRun(client, {
        goal_id: gate.goal_id,
        agent_type: 'script',
        run_status: 'failed',
        started_at: options.now?.().toISOString() ?? new Date().toISOString(),
        finished_at: options.now?.().toISOString() ?? new Date().toISOString(),
        input_summary: `lesson proposal approved: ${proposal.capability_slug}/${proposal.outcome_slug}`,
        output_summary: 'lesson-factory bridge failed before stage execution',
        artifacts: {},
        error_message: message,
        metadata: {
          kind: 'g2a_bridge',
          proposal_id: proposal.id,
          approval_gate_id: gate.id,
          pipeline_mode: pipelineMode,
          failure_phase: 'preflight',
        },
      })
    }

    return {
      proposalId,
      approvalGateId: gate.id,
      bridgeRunId: null,
      agentRunId: persisted.getAgentRunId(),
      status: 'failed',
      pipelineMode,
      error: message,
    }
  }
}

export async function runApprovedLessonProposalBridges(
  proposalIds?: string[],
): Promise<BridgeJobSummary> {
  if (!isG2ABridgeEnabled()) {
    return {
      enabled: false,
      candidates: 0,
      triggered: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      results: [],
    }
  }

  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const ids = proposalIds ?? (await loadApprovedProposalIds(client))
  const results: BridgeRunResult[] = []

  for (const proposalId of ids) {
    results.push(
      await runLessonProposalBridge(proposalId, {
        client,
      }),
    )
  }

  return {
    enabled: true,
    candidates: ids.length,
    triggered: results.filter((result) => result.status !== 'disabled').length,
    completed: results.filter((result) => result.status === 'success').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    results,
  }
}
