import { deliverImprovementProposal } from './delivery'
import {
  mineConfusionFindings,
  mineFreshnessFindings,
  mineGapFindings,
} from './miners'
import {
  buildProposalSummary,
  generateImprovementProposalMarkdown,
} from './report'
import type {
  ImprovementDeliveryResult,
  ImprovementFindingDraft,
  ImprovementFindingRecord,
  ImprovementJobRecord,
  ImprovementJobType,
  ImprovementLoopResult,
  ImprovementCompiledPlan,
  ImprovementCurrentAtomVersion,
  ImprovementProposalRecord,
  ImprovementScheduleSlot,
  ImprovementTelemetryEvent,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface ImprovementRepository {
  getOrCreateJob(input: {
    jobType: ImprovementJobType
    scheduledFor: string
    payload: Record<string, unknown>
  }): Promise<ImprovementJobRecord>
  markJobRunning(jobId: string, startedAt: string): Promise<void>
  markJobCompleted(jobId: string, completedAt: string, result: Record<string, unknown>): Promise<void>
  markJobFailed(jobId: string, completedAt: string, error: string): Promise<void>
  clearFindingsForJob(jobId: string): Promise<void>
  listFindingsForJob(jobId: string): Promise<ImprovementFindingRecord[]>
  listTelemetryEvents(input: {
    from: string
    to: string
    eventNames: string[]
  }): Promise<ImprovementTelemetryEvent[]>
  listCurrentAtomVersions(): Promise<ImprovementCurrentAtomVersion[]>
  listCompiledPlans(input: { from: string; to: string }): Promise<ImprovementCompiledPlan[]>
  insertFindings(jobId: string, findings: ImprovementFindingDraft[], detectedAt: string): Promise<ImprovementFindingRecord[]>
  getProposalByJob(jobId: string): Promise<ImprovementProposalRecord | null>
  insertProposal(input: {
    sourceJobId: string
    generatedAt: string
    summary: string
    detailedMarkdown: string
    findingIds: string[]
  }): Promise<ImprovementProposalRecord>
  markProposalDelivered(input: {
    proposalId: string
    deliveredAt: string
    channel: 'discord' | 'email'
  }): Promise<void>
}

function scheduleSlot(now: Date): ImprovementScheduleSlot {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS)
  const windowKey = jstNow.toISOString().slice(0, 10)
  const scheduledFor = new Date(`${windowKey}T02:00:00+09:00`)

  return {
    windowKey,
    scheduledFor: scheduledFor.toISOString(),
    last24hStart: new Date(now.getTime() - DAY_MS).toISOString(),
    last7dStart: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    last14dStart: new Date(now.getTime() - 14 * DAY_MS).toISOString(),
    last30dStart: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    now: now.toISOString(),
  }
}

async function runFindingJob({
  repository,
  jobType,
  slot,
  execute,
  now,
}: {
  repository: ImprovementRepository
  jobType: Exclude<ImprovementJobType, 'proposal_report'>
  slot: ImprovementScheduleSlot
  execute: () => Promise<ImprovementFindingDraft[]>
  now: Date
}): Promise<ImprovementFindingRecord[]> {
  const job = await repository.getOrCreateJob({
    jobType,
    scheduledFor: slot.scheduledFor,
    payload: {
      window_key: slot.windowKey,
      generated_at: slot.now,
    },
  })

  if (job.status === 'completed') {
    return repository.listFindingsForJob(job.job_id)
  }

  if (job.status === 'running') {
    return repository.listFindingsForJob(job.job_id)
  }

  try {
    await repository.markJobRunning(job.job_id, now.toISOString())
    await repository.clearFindingsForJob(job.job_id)
    const findings = await execute()
    const inserted = await repository.insertFindings(job.job_id, findings, now.toISOString())
    await repository.markJobCompleted(job.job_id, now.toISOString(), {
      count: inserted.length,
      window_key: slot.windowKey,
    })
    return inserted
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await repository.markJobFailed(job.job_id, now.toISOString(), message)
    throw error
  }
}

async function runProposalJob({
  repository,
  slot,
  findings,
  now,
  deliver,
}: {
  repository: ImprovementRepository
  slot: ImprovementScheduleSlot
  findings: ImprovementFindingRecord[]
  now: Date
  deliver: (proposal: ImprovementProposalRecord) => Promise<ImprovementDeliveryResult>
}): Promise<{ proposal: ImprovementProposalRecord; delivery: ImprovementDeliveryResult }> {
  const job = await repository.getOrCreateJob({
    jobType: 'proposal_report',
    scheduledFor: slot.scheduledFor,
    payload: {
      window_key: slot.windowKey,
      finding_count: findings.length,
      generated_at: slot.now,
    },
  })

  const existingProposal = await repository.getProposalByJob(job.job_id)
  if (job.status === 'completed' && existingProposal) {
    return {
      proposal: existingProposal,
      delivery: {
        delivered: Boolean(existingProposal.delivered_at),
        channel: existingProposal.delivery_channel,
      },
    }
  }

  try {
    await repository.markJobRunning(job.job_id, now.toISOString())

    const proposal = existingProposal ?? await repository.insertProposal({
      sourceJobId: job.job_id,
      generatedAt: now.toISOString(),
      summary: buildProposalSummary(findings),
      detailedMarkdown: generateImprovementProposalMarkdown({
        findings,
        generatedAt: now.toISOString(),
      }),
      findingIds: findings.map((finding) => finding.finding_id),
    })

    const delivery = await deliver(proposal)
    if (delivery.delivered && delivery.channel) {
      await repository.markProposalDelivered({
        proposalId: proposal.proposal_id,
        deliveredAt: now.toISOString(),
        channel: delivery.channel,
      })
    }

    await repository.markJobCompleted(job.job_id, now.toISOString(), {
      proposal_id: proposal.proposal_id,
      delivered: delivery.delivered,
      delivery_channel: delivery.channel,
      window_key: slot.windowKey,
    })

    return {
      proposal: {
        ...proposal,
        delivered_at: delivery.delivered ? now.toISOString() : proposal.delivered_at,
        delivery_channel: delivery.channel,
      },
      delivery,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await repository.markJobFailed(job.job_id, now.toISOString(), message)
    throw error
  }
}

export async function runImprovementLoop({
  repository,
  now = new Date(),
  deliver = deliverImprovementProposal,
}: {
  repository: ImprovementRepository
  now?: Date
  deliver?: (proposal: ImprovementProposalRecord) => Promise<ImprovementDeliveryResult>
}): Promise<ImprovementLoopResult> {
  const slot = scheduleSlot(now)

  const confusion = await runFindingJob({
    repository,
    jobType: 'confusion_miner',
    slot,
    now,
    execute: async () => {
      const events = await repository.listTelemetryEvents({
        from: slot.last24hStart,
        to: slot.now,
        eventNames: ['stuck_reported', 'lesson_skipped'],
      })
      return mineConfusionFindings(events)
    },
  })

  const freshness = await runFindingJob({
    repository,
    jobType: 'freshness_miner',
    slot,
    now,
    execute: async () => {
      const [currentVersions, telemetry] = await Promise.all([
        repository.listCurrentAtomVersions(),
        repository.listTelemetryEvents({
          from: slot.last14dStart,
          to: slot.now,
          eventNames: ['artifact_submitted', 'evidence_passed'],
        }),
      ])
      return mineFreshnessFindings({
        currentVersions,
        telemetryEvents: telemetry,
        now,
      })
    },
  })

  const gap = await runFindingJob({
    repository,
    jobType: 'gap_miner',
    slot,
    now,
    execute: async () => {
      const plans = await repository.listCompiledPlans({
        from: slot.last30dStart,
        to: slot.now,
      })
      return mineGapFindings(plans)
    },
  })

  const findings = [...confusion, ...freshness, ...gap]
  const proposalStep = await runProposalJob({
    repository,
    slot,
    findings,
    now,
    deliver,
  })

  return {
    scheduled_for: slot.scheduledFor,
    proposal_id: proposalStep.proposal.proposal_id,
    finding_counts: {
      confusion: confusion.length,
      freshness: freshness.length,
      gap: gap.length,
      total: findings.length,
    },
    delivery: proposalStep.delivery,
  }
}
