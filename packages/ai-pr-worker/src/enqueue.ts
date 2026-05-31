import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { createExecaRunner } from './command-runner.js'
import { FakeCodexAdapter, FakeGhAdapter } from './fake-adapters.js'
import { RealCodexAdapter } from './codex-adapter.js'
import { RealGhAdapter } from './gh-adapter.js'
import { RealGitClient } from './git.js'
import { SupabaseAiPrWorkerRepository } from './repository.js'
import type { ProposedActionRow } from './schema.js'
import { runWorker } from './worker.js'

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type UntypedSupabaseClient = SupabaseClient & {
  schema: (schema: 'decision_ledger') => {
    from: (table: 'proposed_actions') => UntypedQueryBuilder
  }
}

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  contains: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => Promise<{
    data: ProposedActionRow | null
    error: { message: string } | null
  }>
  insert: (values: Record<string, unknown>) => {
    select: (...args: unknown[]) => {
      single: () => Promise<{
        data: ProposedActionRow | null
        error: { message: string } | null
      }>
    }
  }
}

export interface EnqueueApprovedProposalRequest {
  proposalId: string
  capabilitySlug: string
  outcomeSlug: string
  ownerApproval: 'auto' | 'approved'
  actionClass: string
  requestedBy: string
  metadata?: Record<string, Json | undefined>
}

export interface EnqueueApprovedProposalResult {
  accepted: boolean
  jobId: string | null
  note: string
}

function ensureEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ai-pr-worker env: ${name}`)
  }
  return value
}

function asUntypedClient(client: SupabaseClient): UntypedSupabaseClient {
  return client as unknown as UntypedSupabaseClient
}

function priorityFromMetadata(value: unknown): 'P0' | 'P1' | 'P2' | 'P3' {
  switch (value) {
    case 'high':
      return 'P1'
    case 'low':
      return 'P3'
    case 'P0':
    case 'P1':
    case 'P2':
    case 'P3':
      return value
    case 'mid':
    default:
      return 'P2'
  }
}

function estimatedEffortFromActionClass(actionClass: string): number {
  switch (actionClass) {
    case 'micro_patch_existing_lesson':
      return 1
    case 'copy_refresh_existing_lesson':
      return 2
    case 'new_lesson_scaffold':
      return 3
    case 'lesson_rewrite':
      return 4
    default:
      return 2
  }
}

function buildActionMetadata(request: EnqueueApprovedProposalRequest): Record<string, Json> {
  return {
    ...(request.metadata ?? {}),
    source_lesson_dev_proposal_id: request.proposalId,
    capability_slug: request.capabilitySlug,
    outcome_slug: request.outcomeSlug,
    action_class: request.actionClass,
    scheduler_requested_by: request.requestedBy,
    owner_approval: request.ownerApproval,
  }
}

async function findExistingAction(
  client: UntypedSupabaseClient,
  proposalId: string,
): Promise<ProposedActionRow | null> {
  const { data, error } = await client
    .schema('decision_ledger')
    .from('proposed_actions')
    .select(
      'id, goal_id, node_id, title, description, action_type, priority, status, owner_approval, rationale, estimated_effort_hours, metadata, proposed_by, proposed_at, updated_at',
    )
    .contains('metadata', {
      source_lesson_dev_proposal_id: proposalId,
    })
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function createApprovedAction(
  client: UntypedSupabaseClient,
  request: EnqueueApprovedProposalRequest,
): Promise<ProposedActionRow> {
  const goalId = request.metadata?.goal_id
  if (typeof goalId !== 'string' || !goalId) {
    throw new Error(
      `Missing metadata.goal_id for lesson proposal ${request.proposalId}; cannot hand off to ai-pr-worker.`,
    )
  }

  const nodeId = request.metadata?.node_id
  const rationale =
    typeof request.metadata?.rationale === 'string'
      ? request.metadata.rationale
      : `Nightly flywheel proposal for ${request.capabilitySlug}/${request.outcomeSlug}.`

  const { data, error } = await client
    .schema('decision_ledger')
    .from('proposed_actions')
    .insert({
      goal_id: goalId,
      node_id: typeof nodeId === 'string' ? nodeId : null,
      title: `Nightly lesson update: ${request.capabilitySlug}/${request.outcomeSlug}`,
      description: `Auto-enqueued from lesson_dev_proposal ${request.proposalId}.`,
      action_type: 'pr',
      priority: priorityFromMetadata(request.metadata?.priority),
      status: 'approved',
      owner_approval: 'approved',
      rationale,
      estimated_effort_hours: estimatedEffortFromActionClass(request.actionClass),
      proposed_by: request.requestedBy,
      metadata: buildActionMetadata(request),
    })
    .select(
      'id, goal_id, node_id, title, description, action_type, priority, status, owner_approval, rationale, estimated_effort_hours, metadata, proposed_by, proposed_at, updated_at',
    )
    .single()

  if (error || !data) {
    throw error ?? new Error(`failed to create proposed_action for ${request.proposalId}`)
  }

  return data
}

function resolveAdapterMode(): 'fake' | 'real' {
  return process.env.AI_PR_WORKER_ADAPTER === 'fake' ? 'fake' : 'real'
}

export async function enqueueApprovedProposal(
  request: EnqueueApprovedProposalRequest,
): Promise<EnqueueApprovedProposalResult> {
  const supabaseUrl = ensureEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  )
  const serviceRoleKey = ensureEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_SERVICE_ROLE_KEY',
  )

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const untypedClient = asUntypedClient(client)
  const existingAction = await findExistingAction(untypedClient, request.proposalId)
  const action = existingAction ?? (await createApprovedAction(untypedClient, request))

  const runner = createExecaRunner()
  const git = new RealGitClient(runner)
  const repoRoot = await git.resolveRepoRoot(
    process.env.AI_PR_WORKER_REPO_ROOT ?? process.cwd(),
  )
  const repository = new SupabaseAiPrWorkerRepository(client)
  const adapterMode = resolveAdapterMode()
  const codex =
    adapterMode === 'fake'
      ? new FakeCodexAdapter()
      : new RealCodexAdapter(runner)
  const gh =
    adapterMode === 'fake'
      ? new FakeGhAdapter()
      : new RealGhAdapter(runner)

  const result = await runWorker(
    {
      actionId: action.id,
      dryRun: process.env.AI_PR_WORKER_DRY_RUN === '1',
      ghToken: process.env.GH_TOKEN,
    },
    {
      repoRoot,
      repository,
      git,
      codex,
      gh,
    },
  )

  return {
    accepted: true,
    jobId: result.runId,
    note: `AI PR worker started for ${request.capabilitySlug}/${request.outcomeSlug}`,
  }
}
