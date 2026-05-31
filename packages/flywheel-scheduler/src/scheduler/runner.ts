import {
  approvalStateToProposalStatus,
  resolveDecisionApproval,
  summarizeApprovalPolicy,
} from '../gate/policy'
import type { PrWorker } from '../integrations/ai-pr-worker'
import type {
  AuditLogInsert,
  JobExecutionResult,
  SchedulerJobHandler,
  SchedulerStore,
} from '../types'

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown scheduler error'
}

async function appendEntries(
  store: SchedulerStore,
  defaultRunId: string,
  entries: AuditLogInsert[] | undefined,
  signal?: AbortSignal,
) {
  if (!entries) {
    return
  }

  for (const entry of entries) {
    throwIfAborted(signal)
    await store.appendAuditLog({
      ...entry,
      runId: entry.runId ?? defaultRunId,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    })
  }
}

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Aborted', 'AbortError')
  }

  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }

  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }

  throw createAbortError()
}

export async function executeSchedulerJob(
  job: SchedulerJobHandler,
  store: SchedulerStore,
  options?: {
    now?: () => Date
    triggeredBy?: string
    scheduledAt?: string
    cronExpression?: string | null
    prWorker?: PrWorker | null
    signal?: AbortSignal
  },
): Promise<JobExecutionResult> {
  const now = options?.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const scheduledAt = options?.scheduledAt ?? startedAt
  const triggeredBy = options?.triggeredBy ?? 'scheduler'
  const cronExpression = options?.cronExpression ?? null
  const signal = options?.signal

  throwIfAborted(signal)

  const started = await store.startRun({
    jobName: job.jobName,
    scheduledAt,
    startedAt,
    triggeredBy,
    cronExpression,
  })

  if (!started.ok) {
    throwIfAborted(signal)
    const duplicateRun = await store.recordDuplicateRun({
      jobName: job.jobName,
      scheduledAt,
      startedAt,
      triggeredBy,
      cronExpression,
      activeRunId: started.activeRunId,
    })

    throwIfAborted(signal)
    await store.appendAuditLog({
      runId: duplicateRun.runId,
      actorType: 'scheduler',
      eventType: 'scheduler.run.skipped_duplicate',
      resourceType: 'scheduler_run',
      resourceId: duplicateRun.runId,
      message: `Skipped duplicate ${job.jobName} run`,
      metadata: {
        active_run_id: started.activeRunId,
        job_name: job.jobName,
      },
      createdAt: startedAt,
    })

    return {
      exitCode: 3,
      run: duplicateRun,
      decisions: [],
      errorMessage: null,
    }
  }

  const run = started.run

  throwIfAborted(signal)
  await store.appendAuditLog({
    runId: run.runId,
    actorType: 'scheduler',
    eventType: 'scheduler.run.started',
    resourceType: 'scheduler_run',
    resourceId: run.runId,
    message: `Started ${job.jobName}`,
    metadata: {
      job_name: job.jobName,
      triggered_by: triggeredBy,
      scheduled_at: scheduledAt,
    },
    createdAt: startedAt,
  })

  try {
    throwIfAborted(signal)
    const effect = await job.run({
      runId: run.runId,
      jobName: job.jobName,
      scheduledAt,
      triggeredBy,
      cronExpression,
      now,
      signal,
    })

    const persistedDecisions = []
    for (const candidate of effect.decisions ?? []) {
      throwIfAborted(signal)
      const ownerApproval = resolveDecisionApproval(candidate)
      const persisted = await store.upsertDecision({
        ...candidate,
        ownerApproval,
        status: approvalStateToProposalStatus(ownerApproval),
        schedulerRunId: run.runId,
        schedulerJobName: job.jobName,
      })

      persistedDecisions.push(persisted)

      throwIfAborted(signal)
      await store.appendAuditLog({
        runId: run.runId,
        actorType: 'scheduler',
        eventType: 'scheduler.decision.persisted',
        resourceType: 'lesson_dev_proposal',
        resourceId: persisted.id,
        message: `Persisted ${persisted.ownerApproval} decision for ${persisted.capabilitySlug}/${persisted.outcomeSlug}`,
        metadata: {
          owner_approval: persisted.ownerApproval,
          action_class: persisted.actionClass,
          capability_slug: persisted.capabilitySlug,
          outcome_slug: persisted.outcomeSlug,
        },
      })

      if (
        options?.prWorker &&
        (persisted.ownerApproval === 'auto' || persisted.ownerApproval === 'approved')
      ) {
        throwIfAborted(signal)
        const workerResult = await options.prWorker.triggerApprovedProposal({
          proposalId: persisted.id,
          capabilitySlug: persisted.capabilitySlug,
          outcomeSlug: persisted.outcomeSlug,
          ownerApproval: persisted.ownerApproval,
          actionClass: persisted.actionClass,
          requestedBy: triggeredBy,
          metadata: persisted.metadata,
        })

        throwIfAborted(signal)
        await store.appendAuditLog({
          runId: run.runId,
          actorType: 'scheduler',
          eventType: 'scheduler.ai_pr_worker.triggered',
          resourceType: 'lesson_dev_proposal',
          resourceId: persisted.id,
          message: workerResult.note,
          metadata: {
            accepted: workerResult.accepted,
            job_id: workerResult.jobId,
          },
        })
      }
    }

    await appendEntries(store, run.runId, effect.auditEntries, signal)

    const finishedAt = now().toISOString()
    const outcomeSummary = {
      decisions_persisted: persistedDecisions.length,
      policy: summarizeApprovalPolicy(effect.decisions ?? []),
      ...(effect.summary && typeof effect.summary === 'object' && !Array.isArray(effect.summary)
        ? effect.summary
        : { summary: effect.summary ?? {} }),
    }

    throwIfAborted(signal)
    await store.finishRun({
      runId: run.runId,
      status: 'success',
      finishedAt,
      outcomeSummary,
    })

    const completedRun = {
      ...run,
      finishedAt,
      status: 'success' as const,
      outcomeSummary,
    }

    throwIfAborted(signal)
    await store.appendAuditLog({
      runId: run.runId,
      actorType: 'scheduler',
      eventType: 'scheduler.run.completed',
      resourceType: 'scheduler_run',
      resourceId: run.runId,
      message: `Completed ${job.jobName}`,
      metadata: outcomeSummary,
      createdAt: finishedAt,
    })

    return {
      exitCode: 0,
      run: completedRun,
      decisions: persistedDecisions,
      errorMessage: null,
    }
  } catch (error) {
    const finishedAt = now().toISOString()
    const errorMessage = toErrorMessage(error)

    await store.finishRun({
      runId: run.runId,
      status: 'failed',
      finishedAt,
      outcomeSummary: {
        error: errorMessage,
      },
      errorMessage,
    })

    const failedRun = {
      ...run,
      finishedAt,
      status: 'failed' as const,
      errorMessage,
      outcomeSummary: {
        error: errorMessage,
      },
    }

    if (!signal?.aborted) {
      await store.appendAuditLog({
        runId: run.runId,
        actorType: 'scheduler',
        eventType: 'scheduler.run.failed',
        resourceType: 'scheduler_run',
        resourceId: run.runId,
        message: errorMessage,
        metadata: {
          job_name: job.jobName,
        },
        createdAt: finishedAt,
      })
    }

    return {
      exitCode: 1,
      run: failedRun,
      decisions: [],
      errorMessage,
    }
  }
}
