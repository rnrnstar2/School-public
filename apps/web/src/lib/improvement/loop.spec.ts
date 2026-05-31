import { describe, expect, it, vi } from 'vitest'

import { runImprovementLoop } from './loop'
import type {
  ImprovementCompiledPlan,
  ImprovementCurrentAtomVersion,
  ImprovementFindingDraft,
  ImprovementFindingRecord,
  ImprovementJobRecord,
  ImprovementProposalRecord,
  ImprovementTelemetryEvent,
} from './types'
import type { ImprovementRepository } from './loop'

class MemoryImprovementRepository implements ImprovementRepository {
  readonly jobs = new Map<string, ImprovementJobRecord>()
  readonly findingsByJob = new Map<string, ImprovementFindingRecord[]>()
  readonly proposalsByJob = new Map<string, ImprovementProposalRecord>()

  async getOrCreateJob(input: {
    jobType: ImprovementJobRecord['job_type']
    scheduledFor: string
    payload: Record<string, unknown>
  }): Promise<ImprovementJobRecord> {
    const key = `${input.jobType}:${input.scheduledFor}`
    const existing = this.jobs.get(key)
    if (existing) {
      return existing
    }

    const job: ImprovementJobRecord = {
      job_id: key,
      job_type: input.jobType,
      status: 'pending',
      scheduled_for: input.scheduledFor,
      started_at: null,
      completed_at: null,
      payload: input.payload,
      result: null,
      error: null,
    }
    this.jobs.set(key, job)
    return job
  }

  async markJobRunning(jobId: string, startedAt: string): Promise<void> {
    const job = this.lookupJob(jobId)
    job.status = 'running'
    job.started_at = startedAt
  }

  async markJobCompleted(jobId: string, completedAt: string, result: Record<string, unknown>): Promise<void> {
    const job = this.lookupJob(jobId)
    job.status = 'completed'
    job.completed_at = completedAt
    job.result = result
  }

  async markJobFailed(jobId: string, completedAt: string, error: string): Promise<void> {
    const job = this.lookupJob(jobId)
    job.status = 'failed'
    job.completed_at = completedAt
    job.error = error
  }

  async clearFindingsForJob(jobId: string): Promise<void> {
    this.findingsByJob.set(jobId, [])
  }

  async listFindingsForJob(jobId: string): Promise<ImprovementFindingRecord[]> {
    return this.findingsByJob.get(jobId) ?? []
  }

  async listTelemetryEvents(input: {
    from: string
    to: string
    eventNames: string[]
  }): Promise<ImprovementTelemetryEvent[]> {
    if (input.eventNames.includes('stuck_reported')) {
      return [
        { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-1', occurred_at: '2026-04-08T00:00:00.000Z', properties: null },
        { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-2', occurred_at: '2026-04-08T01:00:00.000Z', properties: null },
        { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-3', occurred_at: '2026-04-08T02:00:00.000Z', properties: null },
      ]
    }

    return [
      { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'plan-a', occurred_at: '2026-03-27T00:00:00.000Z', properties: null },
      { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'plan-b', occurred_at: '2026-03-28T00:00:00.000Z', properties: null },
      { event_name: 'evidence_passed', atom_id: 'atom.rls', plan_id: 'plan-a', occurred_at: '2026-03-27T01:00:00.000Z', properties: null },
      { event_name: 'evidence_passed', atom_id: 'atom.rls', plan_id: 'plan-b', occurred_at: '2026-03-28T01:00:00.000Z', properties: null },
      { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'plan-c', occurred_at: '2026-04-07T00:00:00.000Z', properties: null },
      { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'plan-d', occurred_at: '2026-04-08T00:00:00.000Z', properties: null },
    ]
  }

  async listCurrentAtomVersions(): Promise<ImprovementCurrentAtomVersion[]> {
    return [
      {
        atom_id: 'atom.rls',
        version_id: 'version-1',
        imported_at: '2025-12-01T00:00:00.000Z',
      },
    ]
  }

  async listCompiledPlans(_input: { from: string; to: string }): Promise<ImprovementCompiledPlan[]> {
    return [
      { plan_id: 'plan-1', persona_id: 'persona.web', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-01T00:00:00.000Z' },
      { plan_id: 'plan-2', persona_id: 'persona.web', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-02T00:00:00.000Z' },
      { plan_id: 'plan-3', persona_id: 'persona.ops', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-03T00:00:00.000Z' },
    ]
  }

  async insertFindings(jobId: string, findings: ImprovementFindingDraft[], detectedAt: string): Promise<ImprovementFindingRecord[]> {
    const rows = findings.map((finding, index) => ({
      finding_id: `${jobId}-${index}`,
      source_job: jobId,
      finding_type: finding.finding_type,
      atom_id: finding.atom_id,
      persona_id: finding.persona_id,
      capability: finding.capability,
      severity: finding.severity,
      evidence: finding.evidence,
      detected_at: detectedAt,
      status: 'open' as const,
    }))
    this.findingsByJob.set(jobId, rows)
    return rows
  }

  async getProposalByJob(jobId: string): Promise<ImprovementProposalRecord | null> {
    return this.proposalsByJob.get(jobId) ?? null
  }

  async insertProposal(input: {
    sourceJobId: string
    generatedAt: string
    summary: string
    detailedMarkdown: string
    findingIds: string[]
  }): Promise<ImprovementProposalRecord> {
    const proposal: ImprovementProposalRecord = {
      proposal_id: `proposal:${input.sourceJobId}`,
      generated_at: input.generatedAt,
      summary: input.summary,
      detailed_markdown: input.detailedMarkdown,
      finding_ids: input.findingIds,
      delivered_at: null,
      delivery_channel: null,
      acknowledged: false,
      source_job: input.sourceJobId,
    }
    this.proposalsByJob.set(input.sourceJobId, proposal)
    return proposal
  }

  async markProposalDelivered(input: {
    proposalId: string
    deliveredAt: string
    channel: 'discord' | 'email'
  }): Promise<void> {
    for (const proposal of this.proposalsByJob.values()) {
      if (proposal.proposal_id === input.proposalId) {
        proposal.delivered_at = input.deliveredAt
        proposal.delivery_channel = input.channel
      }
    }
  }

  private lookupJob(jobId: string): ImprovementJobRecord {
    const entry = Array.from(this.jobs.values()).find((job) => job.job_id === jobId)
    if (!entry) {
      throw new Error(`Missing job ${jobId}`)
    }
    return entry
  }
}

describe('runImprovementLoop', () => {
  it('reuses completed jobs and proposals on repeated runs', async () => {
    const repository = new MemoryImprovementRepository()
    const deliverySpy = vi.fn().mockResolvedValue({ delivered: false, channel: null })

    const first = await runImprovementLoop({
      repository,
      now: new Date('2026-04-08T12:00:00.000Z'),
      deliver: deliverySpy,
    })
    const second = await runImprovementLoop({
      repository,
      now: new Date('2026-04-08T12:05:00.000Z'),
      deliver: deliverySpy,
    })

    expect(first.proposal_id).toBe(second.proposal_id)
    expect(first.finding_counts.total).toBe(3)
    expect(second.finding_counts.total).toBe(3)
    expect(deliverySpy).toHaveBeenCalledTimes(1)
  })
})
