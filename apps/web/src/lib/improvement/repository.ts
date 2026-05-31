import { createServiceClient } from '@/lib/supabase/service'

import type {
  ImprovementCompiledPlan,
  ImprovementCurrentAtomVersion,
  ImprovementFindingDraft,
  ImprovementFindingRecord,
  ImprovementJobRecord,
  ImprovementJobType,
  ImprovementProposalRecord,
  ImprovementTelemetryEvent,
} from './types'
import type { ImprovementRepository } from './loop'

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>
type QueryError = { message: string; code?: string } | null
type QuerySingleRow = { data: Record<string, unknown> | null; error: QueryError }
type QueryRowList = { data: Array<Record<string, unknown>> | null; error: QueryError }

function ensureServiceClient() {
  const client = createServiceClient()
  if (!client) {
    throw new Error('Service client not available')
  }

  return client
}

function normalizeJob(row: Record<string, unknown>): ImprovementJobRecord {
  return {
    job_id: String(row.job_id ?? ''),
    job_type: row.job_type as ImprovementJobType,
    status: row.status as ImprovementJobRecord['status'],
    scheduled_for: String(row.scheduled_for ?? ''),
    started_at: typeof row.started_at === 'string' ? row.started_at : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    payload: isRecord(row.payload) ? row.payload : {},
    result: isRecord(row.result) ? row.result : null,
    error: typeof row.error === 'string' ? row.error : null,
  }
}

function normalizeFinding(row: Record<string, unknown>): ImprovementFindingRecord {
  return {
    finding_id: String(row.finding_id ?? ''),
    source_job: typeof row.source_job === 'string' ? row.source_job : null,
    finding_type: row.finding_type as ImprovementFindingRecord['finding_type'],
    atom_id: typeof row.atom_id === 'string' ? row.atom_id : null,
    persona_id: typeof row.persona_id === 'string' ? row.persona_id : null,
    capability: typeof row.capability === 'string' ? row.capability : null,
    severity: row.severity as ImprovementFindingRecord['severity'],
    evidence: isRecord(row.evidence) ? row.evidence : {},
    detected_at: String(row.detected_at ?? ''),
    status: row.status as ImprovementFindingRecord['status'],
  }
}

function normalizeProposal(row: Record<string, unknown>): ImprovementProposalRecord {
  return {
    proposal_id: String(row.proposal_id ?? ''),
    generated_at: String(row.generated_at ?? ''),
    summary: String(row.summary ?? ''),
    detailed_markdown: String(row.detailed_markdown ?? ''),
    finding_ids: Array.isArray(row.finding_ids) ? row.finding_ids.map(String) : [],
    delivered_at: typeof row.delivered_at === 'string' ? row.delivered_at : null,
    delivery_channel: row.delivery_channel === 'email' || row.delivery_channel === 'discord'
      ? row.delivery_channel
      : null,
    acknowledged: Boolean(row.acknowledged),
    source_job: typeof row.source_job === 'string' ? row.source_job : null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNoError(error: { message: string; code?: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

export class SupabaseImprovementRepository implements ImprovementRepository {
  constructor(private readonly client: ServiceClient = ensureServiceClient()) {}

  async getOrCreateJob(input: {
    jobType: ImprovementJobType
    scheduledFor: string
    payload: Record<string, unknown>
  }): Promise<ImprovementJobRecord> {
    const { data, error } = await this.client
      .from('improvement_jobs' as never)
      .insert({
        job_type: input.jobType,
        status: 'pending',
        scheduled_for: input.scheduledFor,
        payload: input.payload,
      } as never)
      .select('*')
      .single() as QuerySingleRow

    if (!error && data) {
      return normalizeJob(data)
    }

    if (error?.code !== '23505') {
      throw new Error(`Failed to create improvement job: ${error?.message ?? 'unknown error'}`)
    }

    const existing = await this.client
      .from('improvement_jobs' as never)
      .select('*')
      .eq('job_type', input.jobType)
      .eq('scheduled_for', input.scheduledFor)
      .single() as QuerySingleRow

    assertNoError(existing.error, `Failed to load improvement job ${input.jobType}`)
    if (!existing.data) {
      throw new Error(`Improvement job disappeared after unique conflict: ${input.jobType}`)
    }
    return normalizeJob(existing.data)
  }

  async markJobRunning(jobId: string, startedAt: string): Promise<void> {
    const { error } = await this.client
      .from('improvement_jobs' as never)
      .update({
        status: 'running',
        started_at: startedAt,
        completed_at: null,
        error: null,
      } as never)
      .eq('job_id', jobId)

    assertNoError(error, `Failed to mark job running (${jobId})`)
  }

  async markJobCompleted(jobId: string, completedAt: string, result: Record<string, unknown>): Promise<void> {
    const { error } = await this.client
      .from('improvement_jobs' as never)
      .update({
        status: 'completed',
        completed_at: completedAt,
        result,
        error: null,
      } as never)
      .eq('job_id', jobId)

    assertNoError(error, `Failed to mark job completed (${jobId})`)
  }

  async markJobFailed(jobId: string, completedAt: string, errorMessage: string): Promise<void> {
    const { error } = await this.client
      .from('improvement_jobs' as never)
      .update({
        status: 'failed',
        completed_at: completedAt,
        error: errorMessage,
      } as never)
      .eq('job_id', jobId)

    assertNoError(error, `Failed to mark job failed (${jobId})`)
  }

  async clearFindingsForJob(jobId: string): Promise<void> {
    const { error } = await this.client
      .from('improvement_findings' as never)
      .delete()
      .eq('source_job', jobId)

    assertNoError(error, `Failed to clear findings for job ${jobId}`)
  }

  async listFindingsForJob(jobId: string): Promise<ImprovementFindingRecord[]> {
    const { data, error } = await this.client
      .from('improvement_findings' as never)
      .select('*')
      .eq('source_job', jobId)
      .order('detected_at', { ascending: true }) as QueryRowList

    assertNoError(error, `Failed to list findings for job ${jobId}`)
    return Array.isArray(data) ? data.map((row: Record<string, unknown>) => normalizeFinding(row)) : []
  }

  async listTelemetryEvents(input: {
    from: string
    to: string
    eventNames: string[]
  }): Promise<ImprovementTelemetryEvent[]> {
    const { data, error } = await this.client
      .from('telemetry_events' as never)
      .select('event_name, atom_id, plan_id, occurred_at, properties')
      .in('event_name', input.eventNames)
      .gte('occurred_at', input.from)
      .lte('occurred_at', input.to) as QueryRowList

    assertNoError(error, 'Failed to load telemetry events')
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      event_name: String(row.event_name ?? ''),
      atom_id: typeof row.atom_id === 'string' ? row.atom_id : null,
      plan_id: typeof row.plan_id === 'string' ? row.plan_id : null,
      occurred_at: String(row.occurred_at ?? ''),
      properties: isRecord(row.properties) ? row.properties : null,
    }))
  }

  async listCurrentAtomVersions(): Promise<ImprovementCurrentAtomVersion[]> {
    const { data: atoms, error: atomsError } = await this.client
      .from('lesson_atoms' as never)
      .select('atom_id, current_version_id')
      .not('current_version_id', 'is', null) as QueryRowList

    assertNoError(atomsError, 'Failed to load current lesson atoms')

    const versionIds = ((atoms ?? []) as Array<Record<string, unknown>>)
      .map((row) => row.current_version_id)
      .filter((value): value is string => typeof value === 'string')

    if (versionIds.length === 0) {
      return []
    }

    const { data: versions, error: versionsError } = await this.client
      .from('lesson_atom_versions' as never)
      .select('version_id, atom_id, imported_at')
      .in('version_id', versionIds) as QueryRowList

    assertNoError(versionsError, 'Failed to load lesson atom versions')

    return ((versions ?? []) as Array<Record<string, unknown>>).map((row) => ({
      atom_id: String(row.atom_id ?? ''),
      version_id: String(row.version_id ?? ''),
      imported_at: String(row.imported_at ?? ''),
    }))
  }

  async listCompiledPlans(input: { from: string; to: string }): Promise<ImprovementCompiledPlan[]> {
    const { data, error } = await this.client
      .from('compiled_plans' as never)
      .select('plan_id, persona_id, unsupported_capabilities, created_at')
      .gte('created_at', input.from)
      .lte('created_at', input.to) as QueryRowList

    assertNoError(error, 'Failed to load compiled plans')
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      plan_id: String(row.plan_id ?? ''),
      persona_id: typeof row.persona_id === 'string' ? row.persona_id : null,
      unsupported_capabilities: Array.isArray(row.unsupported_capabilities)
        ? row.unsupported_capabilities.map(String)
        : [],
      created_at: String(row.created_at ?? ''),
    }))
  }

  async insertFindings(jobId: string, findings: ImprovementFindingDraft[], detectedAt: string): Promise<ImprovementFindingRecord[]> {
    if (findings.length === 0) {
      return []
    }

    const { data, error } = await this.client
      .from('improvement_findings' as never)
      .insert(
        findings.map((finding) => ({
          source_job: jobId,
          finding_type: finding.finding_type,
          atom_id: finding.atom_id,
          persona_id: finding.persona_id,
          capability: finding.capability,
          severity: finding.severity,
          evidence: finding.evidence,
          detected_at: detectedAt,
        })) as never,
      )
      .select('*') as QueryRowList

    assertNoError(error, `Failed to insert findings for job ${jobId}`)
    return Array.isArray(data) ? data.map((row: Record<string, unknown>) => normalizeFinding(row)) : []
  }

  async getProposalByJob(jobId: string): Promise<ImprovementProposalRecord | null> {
    const { data, error } = await this.client
      .from('improvement_proposals' as never)
      .select('*')
      .eq('source_job', jobId)
      .maybeSingle() as QuerySingleRow

    assertNoError(error, `Failed to load proposal for job ${jobId}`)
    return data ? normalizeProposal(data) : null
  }

  async insertProposal(input: {
    sourceJobId: string
    generatedAt: string
    summary: string
    detailedMarkdown: string
    findingIds: string[]
  }): Promise<ImprovementProposalRecord> {
    const { data, error } = await this.client
      .from('improvement_proposals' as never)
      .insert({
        source_job: input.sourceJobId,
        generated_at: input.generatedAt,
        summary: input.summary,
        detailed_markdown: input.detailedMarkdown,
        finding_ids: input.findingIds,
      } as never)
      .select('*')
      .single() as QuerySingleRow

    assertNoError(error, `Failed to insert proposal for job ${input.sourceJobId}`)
    if (!data) {
      throw new Error(`Improvement proposal insert returned no row for job ${input.sourceJobId}`)
    }
    return normalizeProposal(data)
  }

  async markProposalDelivered(input: {
    proposalId: string
    deliveredAt: string
    channel: 'discord' | 'email'
  }): Promise<void> {
    const { error } = await this.client
      .from('improvement_proposals' as never)
      .update({
        delivered_at: input.deliveredAt,
        delivery_channel: input.channel,
      } as never)
      .eq('proposal_id', input.proposalId)

    assertNoError(error, `Failed to mark proposal delivered (${input.proposalId})`)
  }
}

export function createImprovementRepository(): ImprovementRepository {
  return new SupabaseImprovementRepository()
}
