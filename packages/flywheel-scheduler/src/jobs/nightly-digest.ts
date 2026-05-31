import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { load } from 'js-yaml'

import type { PrWorker } from '../integrations/ai-pr-worker'
import { executeSchedulerJob } from '../scheduler/runner'
import type {
  AuditLogInsert,
  JsonValue,
  JobExecutionResult,
  SchedulerJobHandler,
  SchedulerJobName,
  SchedulerRunRecord,
  SchedulerStore,
} from '../types'
import { createGapScanJob } from './gap-scan'
import { createJudgeRunJob } from './judge-run'
import { createMatcherSweepJob } from './matcher-sweep'
import { createProposerRunJob } from './proposer-run'

type NightlyStageJobName =
  | 'matcher_sweep'
  | 'gap_scan'
  | 'proposer_run'
  | 'judge_run'

type NightlyWorkflowStageName = NightlyStageJobName | 'nightly_digest'

type SentryLikeModule = {
  captureException?: (
    error: unknown,
    options?: Record<string, unknown>,
  ) => void
  startSpan?: <T>(
    options: {
      name: string
      op: string
      attributes?: Record<string, string | number | boolean>
    },
    callback: () => Promise<T>,
  ) => Promise<T>
}

type UntypedSupabaseClient = SupabaseClient & {
  from: (table: string) => UntypedQueryBuilder
  schema: (schema: 'decision_ledger') => {
    from: (table: 'lesson_dev_proposals') => UntypedQueryBuilder
  }
}

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null
    error: { code?: string; message: string } | null
  }>
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: () => {
      single: () => Promise<{
        data: Record<string, unknown> | null
        error: { code?: string; message: string } | null
      }>
    }
  }
  then: PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { code?: string; message: string } | null
  }>['then']
}

interface RawNightlyWorkflowDefinition {
  timezone?: unknown
  defaultTimeoutMs?: unknown
  defaultRetry?: {
    maxAttempts?: unknown
    initialDelayMs?: unknown
    backoffMultiplier?: unknown
  }
  stages?: Array<{
    jobName?: unknown
    timeoutMs?: unknown
    retry?: {
      maxAttempts?: unknown
      initialDelayMs?: unknown
      backoffMultiplier?: unknown
    }
    skipOnUpstreamFailure?: unknown
  }>
}

export interface NightlyWorkflowRetryPolicy {
  maxAttempts: number
  initialDelayMs: number
  backoffMultiplier: number
}

export interface NightlyWorkflowStageDefinition {
  jobName: NightlyWorkflowStageName
  timeoutMs: number
  retry: NightlyWorkflowRetryPolicy
  skipOnUpstreamFailure: boolean
}

export interface NightlyWorkflowDefinition {
  timezone: string
  defaultTimeoutMs: number
  defaultRetry: NightlyWorkflowRetryPolicy
  stages: NightlyWorkflowStageDefinition[]
}

export type NightlyDigestStatus =
  | 'running'
  | 'completed'
  | 'completed_with_failures'
  | 'failed'

export interface NightlyDigestRecord {
  digestId: string
  runDate: string
  status: NightlyDigestStatus
  startedAt: string
  finishedAt: string | null
  newGapCount: number
  newProposalCount: number
  judgeScoreHistogram: Record<string, number>
  pendingOwnerReviewCount: number
  failedStages: NightlyWorkflowStageName[]
  summary: string | null
}

export interface NightlyDigestUpsertInput {
  runDate: string
  status: NightlyDigestStatus
  startedAt: string
  finishedAt: string | null
  newGapCount: number
  newProposalCount: number
  judgeScoreHistogram: Record<string, number>
  pendingOwnerReviewCount: number
  failedStages: NightlyWorkflowStageName[]
  summary: string | null
}

export interface NightlyDigestRepository {
  getDigestByRunDate(runDate: string): Promise<NightlyDigestRecord | null>
  upsertDigest(input: NightlyDigestUpsertInput): Promise<NightlyDigestRecord>
  countPendingOwnerReview(): Promise<number>
}

export interface NightlyStageExecutionSummary {
  jobName: NightlyWorkflowStageName
  runId: string | null
  status:
    | SchedulerRunRecord['status']
    | 'completed_in_current_run'
  attempts: number
  decisionCount: number
  errorMessage: string | null
}

export interface NightlyDigestJobOptions {
  store: SchedulerStore
  repository?: NightlyDigestRepository
  workflow?: NightlyWorkflowDefinition
  prWorker?: PrWorker | null
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  unwindGraceMs?: number
  stageJobs?: Partial<Record<NightlyStageJobName, SchedulerJobHandler>>
}

const NIGHTLY_STAGE_JOB_NAMES: NightlyStageJobName[] = [
  'matcher_sweep',
  'gap_scan',
  'proposer_run',
  'judge_run',
]

const DEFAULT_RETRY: NightlyWorkflowRetryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000
const DEFAULT_UNWIND_GRACE_MS = 2_000
const DEFAULT_TIMEZONE = 'Asia/Tokyo'
const NIGHTLY_WORKFLOW_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../workflows/nightly.yaml',
)

const dynamicImport = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<Record<string, unknown>>

let sentryModulePromise: Promise<SentryLikeModule | null> | null = null

function ensureEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing nightly digest env: ${name}`)
  }
  return value
}

function toUntypedClient(client: SupabaseClient): UntypedSupabaseClient {
  return client as unknown as UntypedSupabaseClient
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown nightly workflow error'
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function asJsonRecord(value: unknown): Record<string, JsonValue | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, JsonValue | undefined>)
    : {}
}

function normalizeHistogram(value: unknown): Record<string, number> {
  const histogram = asJsonRecord(value)
  return Object.fromEntries(
    Object.entries(histogram).map(([bucket, count]) => [bucket, toNumber(count)]),
  )
}

function normalizeDigestRecord(row: Record<string, unknown>): NightlyDigestRecord {
  return {
    digestId: String(row.digest_id ?? ''),
    runDate: String(row.run_date ?? ''),
    status: String(row.status ?? 'failed') as NightlyDigestStatus,
    startedAt: String(row.started_at ?? ''),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    newGapCount: toNumber(row.new_gap_count),
    newProposalCount: toNumber(row.new_proposal_count),
    judgeScoreHistogram: normalizeHistogram(row.judge_score_histogram),
    pendingOwnerReviewCount: toNumber(row.pending_owner_review_count),
    failedStages: Array.isArray(row.failed_stages)
      ? row.failed_stages.map((stage) => String(stage) as NightlyWorkflowStageName)
      : [],
    summary: typeof row.summary === 'string' ? row.summary : null,
  }
}

function resolveRetryPolicy(
  retry: RawNightlyWorkflowDefinition['defaultRetry'],
  fallback: NightlyWorkflowRetryPolicy,
): NightlyWorkflowRetryPolicy {
  const maxAttempts = Math.max(1, Math.trunc(toNumber(retry?.maxAttempts, fallback.maxAttempts)))
  return {
    maxAttempts,
    initialDelayMs: Math.max(
      1,
      Math.trunc(toNumber(retry?.initialDelayMs, fallback.initialDelayMs)),
    ),
    backoffMultiplier: Math.max(
      1,
      toNumber(retry?.backoffMultiplier, fallback.backoffMultiplier),
    ),
  }
}

function isNightlyWorkflowStageName(value: unknown): value is NightlyWorkflowStageName {
  return (
    value === 'matcher_sweep' ||
    value === 'gap_scan' ||
    value === 'proposer_run' ||
    value === 'judge_run' ||
    value === 'nightly_digest'
  )
}

export function loadNightlyWorkflowDefinition(
  configPath = NIGHTLY_WORKFLOW_PATH,
): NightlyWorkflowDefinition {
  const absolutePath = resolve(configPath)
  const fallback: NightlyWorkflowDefinition = {
    timezone: DEFAULT_TIMEZONE,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    defaultRetry: { ...DEFAULT_RETRY },
    stages: [
      {
        jobName: 'matcher_sweep',
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retry: { ...DEFAULT_RETRY },
        skipOnUpstreamFailure: false,
      },
      {
        jobName: 'gap_scan',
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retry: { ...DEFAULT_RETRY },
        skipOnUpstreamFailure: true,
      },
      {
        jobName: 'proposer_run',
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retry: { ...DEFAULT_RETRY },
        skipOnUpstreamFailure: true,
      },
      {
        jobName: 'judge_run',
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retry: { ...DEFAULT_RETRY },
        skipOnUpstreamFailure: true,
      },
      {
        jobName: 'nightly_digest',
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retry: { ...DEFAULT_RETRY },
        skipOnUpstreamFailure: false,
      },
    ],
  }

  if (!existsSync(absolutePath)) {
    return fallback
  }

  const raw = (load(readFileSync(absolutePath, 'utf8')) ?? {}) as RawNightlyWorkflowDefinition
  const defaultRetry = resolveRetryPolicy(raw.defaultRetry, fallback.defaultRetry)
  const defaultTimeoutMs = Math.max(
    1,
    Math.trunc(toNumber(raw.defaultTimeoutMs, fallback.defaultTimeoutMs)),
  )

  const stages =
    raw.stages?.map((stage) => {
      if (!isNightlyWorkflowStageName(stage?.jobName)) {
        throw new Error(`Invalid nightly workflow stage: ${String(stage?.jobName)}`)
      }

      return {
        jobName: stage.jobName,
        timeoutMs: Math.max(
          1,
          Math.trunc(toNumber(stage.timeoutMs, defaultTimeoutMs)),
        ),
        retry: resolveRetryPolicy(stage.retry, defaultRetry),
        skipOnUpstreamFailure:
          typeof stage.skipOnUpstreamFailure === 'boolean'
            ? stage.skipOnUpstreamFailure
            : stage.jobName !== 'matcher_sweep' && stage.jobName !== 'nightly_digest',
      } satisfies NightlyWorkflowStageDefinition
    }) ?? fallback.stages

  return {
    timezone:
      typeof raw.timezone === 'string' && raw.timezone.trim()
        ? raw.timezone.trim()
        : fallback.timezone,
    defaultTimeoutMs,
    defaultRetry,
    stages,
  }
}

async function getSentryModule(): Promise<SentryLikeModule | null> {
  if (!sentryModulePromise) {
    sentryModulePromise = (async () => {
      for (const specifier of ['@sentry/node', '@sentry/nextjs']) {
        try {
          return (await dynamicImport(specifier)) as SentryLikeModule
        } catch {
          continue
        }
      }
      return null
    })()
  }

  return sentryModulePromise
}

async function withStageSpan<T>(
  stageJobName: NightlyWorkflowStageName,
  callback: () => Promise<T>,
): Promise<T> {
  const sentry = await getSentryModule()
  if (!sentry?.startSpan) {
    return callback()
  }

  return sentry.startSpan(
    {
      name: `nightly_flywheel.${stageJobName}`,
      op: 'scheduler.stage',
      attributes: {
        'scheduler.stage': stageJobName,
      },
    },
    callback,
  )
}

async function captureStageError(
  stageJobName: NightlyWorkflowStageName,
  error: unknown,
) {
  const sentry = await getSentryModule()
  sentry?.captureException?.(error, {
    tags: {
      scheduler_stage: stageJobName,
    },
  })
}

function extractCount(
  summary: JsonValue,
  keys: string[],
): number {
  const record = asJsonRecord(summary)

  for (const key of keys) {
    const value = record[key]
    if (value !== undefined) {
      return toNumber(value)
    }
  }

  return 0
}

function extractHistogram(summary: JsonValue): Record<string, number> {
  const record = asJsonRecord(summary)
  return normalizeHistogram(
    record.judge_score_histogram ?? record.score_histogram ?? record.histogram ?? {},
  )
}

function delayForAttempt(retry: NightlyWorkflowRetryPolicy, attempt: number): number {
  return Math.round(retry.initialDelayMs * retry.backoffMultiplier ** (attempt - 1))
}

export class StageTimeoutError extends Error {
  readonly stageJobName: NightlyWorkflowStageName
  readonly timeoutMs: number

  constructor(stageJobName: NightlyWorkflowStageName, timeoutMs: number) {
    super(`${stageJobName} timed out after ${timeoutMs}ms`)
    this.name = 'StageTimeoutError'
    this.stageJobName = stageJobName
    this.timeoutMs = timeoutMs
  }
}

async function runWithTimeout<T>(
  timeoutMs: number,
  callback: (signal: AbortSignal) => Promise<T>,
  stageJobName: NightlyWorkflowStageName,
  unwindGraceMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timeoutError = new StageTimeoutError(stageJobName, timeoutMs)
  const stagePromise = callback(controller.signal)
  let timer: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      stagePromise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(timeoutError)
          void Promise.race([
            stagePromise.catch(() => undefined),
            sleep(unwindGraceMs),
          ]).finally(() => reject(timeoutError))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSummaryText(input: {
  runDate: string
  newGapCount: number
  newProposalCount: number
  pendingOwnerReviewCount: number
  failedStages: NightlyWorkflowStageName[]
}) {
  const base = `Nightly flywheel ${input.runDate} JST: ${input.newGapCount} new gaps, ${input.newProposalCount} new proposals, ${input.pendingOwnerReviewCount} pending owner reviews.`

  if (input.failedStages.length === 0) {
    return base
  }

  return `${base} Failed stages: ${input.failedStages.join(', ')}. Counts exclude stages that did not finish successfully.`
}

function resolveStageJobs(
  overrides: NightlyDigestJobOptions['stageJobs'],
): Record<NightlyStageJobName, SchedulerJobHandler> {
  return {
    matcher_sweep: overrides?.matcher_sweep ?? createMatcherSweepJob(),
    gap_scan: overrides?.gap_scan ?? createGapScanJob(),
    proposer_run: overrides?.proposer_run ?? createProposerRunJob(),
    judge_run: overrides?.judge_run ?? createJudgeRunJob(),
  }
}

function isExecutableStageDefinition(
  stage: NightlyWorkflowStageDefinition,
): stage is NightlyWorkflowStageDefinition & {
  jobName: NightlyStageJobName
} {
  return stage.jobName !== 'nightly_digest'
}

function serializeStageSummaries(
  stages: NightlyStageExecutionSummary[],
): JsonValue[] {
  return stages.map((stage) => ({
    job_name: stage.jobName,
    run_id: stage.runId,
    status: stage.status,
    attempts: stage.attempts,
    decision_count: stage.decisionCount,
    error_message: stage.errorMessage,
  }))
}

function appendWorkflowAuditEntry(
  entries: AuditLogInsert[],
  input: {
    runId: string
    createdAt: string
    eventType: string
    message: string
    metadata?: JsonValue
  },
) {
  entries.push({
    runId: input.runId,
    actorType: 'scheduler',
    eventType: input.eventType,
    resourceType: 'scheduler_workflow_stage',
    resourceId: input.runId,
    message: input.message,
    metadata: input.metadata,
    createdAt: input.createdAt,
  })
}

export function createSupabaseNightlyDigestRepository(options?: {
  supabaseUrl?: string
  serviceRoleKey?: string
  client?: SupabaseClient
}): NightlyDigestRepository {
  const client =
    options?.client ??
    createClient(
      ensureEnv(
        options?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
        'NEXT_PUBLIC_SUPABASE_URL',
      ),
      ensureEnv(
        options?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_SERVICE_ROLE_KEY',
      ),
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    )

  const supabase = toUntypedClient(client)

  return {
    async getDigestByRunDate(runDate) {
      const { data, error } = await supabase
        .from('nightly_digest')
        .select(
          'digest_id, run_date, status, started_at, finished_at, new_gap_count, new_proposal_count, judge_score_histogram, pending_owner_review_count, failed_stages, summary',
        )
        .eq('run_date', runDate)
        .maybeSingle()

      if (error) {
        throw new Error(error.message)
      }

      return data ? normalizeDigestRecord(data) : null
    },

    async upsertDigest(input) {
      const { data, error } = await supabase
        .from('nightly_digest')
        .upsert(
          {
            run_date: input.runDate,
            status: input.status,
            started_at: input.startedAt,
            finished_at: input.finishedAt,
            new_gap_count: input.newGapCount,
            new_proposal_count: input.newProposalCount,
            judge_score_histogram: input.judgeScoreHistogram,
            pending_owner_review_count: input.pendingOwnerReviewCount,
            failed_stages: input.failedStages,
            summary: input.summary,
          },
          { onConflict: 'run_date' },
        )
        .select()
        .single()

      if (error || !data) {
        throw error ?? new Error(`failed to upsert nightly digest for ${input.runDate}`)
      }

      return normalizeDigestRecord(data)
    },

    async countPendingOwnerReview() {
      const { data, error } = await supabase
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .select('id')
        .eq('owner_approval', 'pending_owner_review')

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data) ? data.length : 0
    },
  }
}

export function createNightlyDigestJob(
  options: NightlyDigestJobOptions,
): SchedulerJobHandler {
  const workflow = options.workflow ?? loadNightlyWorkflowDefinition()
  const stageJobs = resolveStageJobs(options.stageJobs)
  const repository =
    options.repository ?? createSupabaseNightlyDigestRepository()
  const stageDefinitions = workflow.stages.filter(isExecutableStageDefinition)

  return {
    jobName: 'nightly_digest',
    async run(context) {
      const now = options.now ?? context.now
      const currentTime = now()
      const runDate = formatDateInTimezone(currentTime, workflow.timezone)
      const startedAt = currentTime.toISOString()
      const workflowAuditEntries: AuditLogInsert[] = []
      const existingDigest = await repository.getDigestByRunDate(runDate)
      const stageSummaries: NightlyStageExecutionSummary[] = []
      let latestGapCount = 0
      let latestProposalCount = 0
      let latestJudgeHistogram: Record<string, number> = {}
      let digestInitialized = false
      let digestFinalized = false

      if (existingDigest?.status === 'completed') {
        appendWorkflowAuditEntry(workflowAuditEntries, {
          runId: context.runId,
          createdAt: startedAt,
          eventType: 'scheduler.workflow.noop_already_completed',
          message: `Skipped nightly workflow for ${runDate}; digest already completed.`,
          metadata: {
            digest_id: existingDigest.digestId,
            run_date: runDate,
          },
        })

        return {
          summary: {
            run_date: runDate,
            digest_id: existingDigest.digestId,
            skipped_existing_completed: true,
          },
          auditEntries: workflowAuditEntries,
        }
      }

      try {
        await repository.upsertDigest({
          runDate,
          status: 'running',
          startedAt,
          finishedAt: null,
          newGapCount: 0,
          newProposalCount: 0,
          judgeScoreHistogram: {},
          pendingOwnerReviewCount: 0,
          failedStages: [],
          summary: existingDigest?.summary ?? null,
        })
        digestInitialized = true

        let upstreamFailure:
          | {
              jobName: NightlyStageJobName
              runId: string | null
              errorMessage: string
            }
          | null = null

        for (const stage of stageDefinitions) {
          if (upstreamFailure && stage.skipOnUpstreamFailure) {
            const failure = upstreamFailure
            const skippedAt = now().toISOString()
            const skippedRun = await options.store.recordSkippedUpstreamRun({
              jobName: stage.jobName,
              scheduledAt: context.scheduledAt,
              startedAt: skippedAt,
              triggeredBy: context.triggeredBy,
              cronExpression: context.cronExpression,
              upstreamJobName: failure.jobName,
              upstreamRunId: failure.runId,
            })

            appendWorkflowAuditEntry(workflowAuditEntries, {
              runId: context.runId,
              createdAt: skippedAt,
              eventType: 'scheduler.workflow.stage.skipped_upstream_failed',
              message: `${stage.jobName} skipped because ${failure.jobName} failed.`,
              metadata: {
                stage_job_name: stage.jobName,
                skipped_run_id: skippedRun.runId,
                upstream_job_name: failure.jobName,
                upstream_run_id: failure.runId,
              },
            })

            stageSummaries.push({
              jobName: stage.jobName,
              runId: skippedRun.runId,
              status: 'skipped_upstream_failed',
              attempts: 0,
              decisionCount: 0,
              errorMessage: failure.errorMessage,
            })
            continue
          }

          let attempt = 0
          let completedResult: JobExecutionResult | null = null
          let lastErrorMessage: string | null = null
          let lastFailureRunId: string | null = null

          while (attempt < stage.retry.maxAttempts) {
            attempt += 1
            const attemptStartedAt = now().toISOString()

            appendWorkflowAuditEntry(workflowAuditEntries, {
              runId: context.runId,
              createdAt: attemptStartedAt,
              eventType: 'scheduler.workflow.stage.started',
              message: `${stage.jobName} attempt ${attempt} started.`,
              metadata: {
                stage_job_name: stage.jobName,
                attempt,
                timeout_ms: stage.timeoutMs,
                workflow_run_id: context.runId,
              },
            })

            try {
              const result = await withStageSpan(stage.jobName, async () =>
                runWithTimeout(
                  stage.timeoutMs,
                  (signal) =>
                    executeSchedulerJob(stageJobs[stage.jobName], options.store, {
                      now,
                      triggeredBy: `${context.triggeredBy}:nightly:${context.runId}`,
                      scheduledAt: context.scheduledAt,
                      cronExpression: context.cronExpression,
                      prWorker: options.prWorker ?? null,
                      signal,
                    }),
                  stage.jobName,
                  options.unwindGraceMs ?? DEFAULT_UNWIND_GRACE_MS,
                ),
              )
              if (result.exitCode !== 0) {
                lastFailureRunId = result.run.runId
                throw new Error(
                  result.errorMessage ??
                    `${stage.jobName} exited with code ${result.exitCode}`,
                )
              }

              completedResult = result
              lastErrorMessage = completedResult.errorMessage

              appendWorkflowAuditEntry(workflowAuditEntries, {
                runId: context.runId,
                createdAt: now().toISOString(),
                eventType: 'scheduler.workflow.stage.completed',
                message: `${stage.jobName} completed on attempt ${attempt}.`,
                metadata: {
                  stage_job_name: stage.jobName,
                  attempt,
                  stage_run_id: completedResult.run.runId,
                  status: completedResult.run.status,
                },
              })
              break
            } catch (error) {
              await captureStageError(stage.jobName, error)
              lastErrorMessage = toErrorMessage(error)

              if (
                error instanceof StageTimeoutError ||
                lastErrorMessage.includes('timed out')
              ) {
                const timeoutMs =
                  error instanceof StageTimeoutError ? error.timeoutMs : stage.timeoutMs
                appendWorkflowAuditEntry(workflowAuditEntries, {
                  runId: context.runId,
                  createdAt: now().toISOString(),
                  eventType: 'scheduler.workflow.stage.aborted',
                  message: `${stage.jobName} aborted after timing out on attempt ${attempt}.`,
                  metadata: {
                    stage_job_name: stage.jobName,
                    attempt,
                    timeout_ms: timeoutMs,
                    unwind_grace_ms:
                      options.unwindGraceMs ?? DEFAULT_UNWIND_GRACE_MS,
                  },
                })
              }

              appendWorkflowAuditEntry(workflowAuditEntries, {
                runId: context.runId,
                createdAt: now().toISOString(),
                eventType:
                  attempt < stage.retry.maxAttempts
                    ? 'scheduler.workflow.stage.retrying'
                    : 'scheduler.workflow.stage.failed',
                message:
                  attempt < stage.retry.maxAttempts
                    ? `${stage.jobName} failed on attempt ${attempt}; retrying.`
                    : `${stage.jobName} failed after ${attempt} attempts.`,
                metadata: {
                  stage_job_name: stage.jobName,
                  attempt,
                  error: lastErrorMessage,
                },
              })

              if (attempt < stage.retry.maxAttempts) {
                await (options.sleep ?? sleep)(delayForAttempt(stage.retry, attempt))
              }
            }
          }

          if (!completedResult) {
            upstreamFailure = {
              jobName: stage.jobName,
              runId: lastFailureRunId,
              errorMessage: lastErrorMessage ?? `${stage.jobName} failed`,
            }
            stageSummaries.push({
              jobName: stage.jobName,
              runId: lastFailureRunId,
              status: 'failed',
              attempts: attempt,
              decisionCount: 0,
              errorMessage: upstreamFailure.errorMessage,
            })
            continue
          }

          stageSummaries.push({
            jobName: stage.jobName,
            runId: completedResult.run.runId,
            status: completedResult.run.status,
            attempts: attempt,
            decisionCount: completedResult.decisions.length,
            errorMessage: completedResult.errorMessage,
          })

          if (stage.jobName === 'gap_scan') {
            latestGapCount = extractCount(completedResult.run.outcomeSummary, [
              'new_gap_count',
              'gap_candidates',
              'gaps_detected',
            ])
          }

          if (stage.jobName === 'proposer_run') {
            latestProposalCount = completedResult.decisions.length
          }

          if (stage.jobName === 'judge_run') {
            latestJudgeHistogram = extractHistogram(completedResult.run.outcomeSummary)
          }
        }

        const digestStageStartedAt = now().toISOString()
        appendWorkflowAuditEntry(workflowAuditEntries, {
          runId: context.runId,
          createdAt: digestStageStartedAt,
          eventType: 'scheduler.workflow.stage.started',
          message: 'nightly_digest summary stage started.',
          metadata: {
            stage_job_name: 'nightly_digest',
            workflow_run_id: context.runId,
          },
        })

        const pendingOwnerReviewCount = await withStageSpan(
          'nightly_digest',
          () => repository.countPendingOwnerReview(),
        )
        const failedStages = stageSummaries
          .filter((stage) => stage.status === 'failed')
          .map((stage) => stage.jobName)

        const finishedAt = now().toISOString()
        const summaryText = buildSummaryText({
          runDate,
          newGapCount: latestGapCount,
          newProposalCount: latestProposalCount,
          pendingOwnerReviewCount,
          failedStages,
        })

        const digest = await repository.upsertDigest({
          runDate,
          status: failedStages.length === 0 ? 'completed' : 'completed_with_failures',
          startedAt,
          finishedAt,
          newGapCount: latestGapCount,
          newProposalCount: latestProposalCount,
          judgeScoreHistogram: latestJudgeHistogram,
          pendingOwnerReviewCount,
          failedStages,
          summary: summaryText,
        })
        digestFinalized = true

        appendWorkflowAuditEntry(workflowAuditEntries, {
          runId: context.runId,
          createdAt: finishedAt,
          eventType: 'scheduler.workflow.stage.completed',
          message: 'nightly_digest summary stage completed.',
          metadata: {
            stage_job_name: 'nightly_digest',
            digest_id: digest.digestId,
            failed_stages: failedStages,
          },
        })

        stageSummaries.push({
          jobName: 'nightly_digest',
          runId: context.runId,
          status: 'completed_in_current_run',
          attempts: 1,
          decisionCount: 0,
          errorMessage: null,
        })

        return {
          summary: {
            run_date: runDate,
            digest_id: digest.digestId,
            new_gap_count: latestGapCount,
            new_proposal_count: latestProposalCount,
            judge_score_histogram: latestJudgeHistogram,
            pending_owner_review_count: pendingOwnerReviewCount,
            failed_stages: failedStages,
            stage_results: serializeStageSummaries(stageSummaries),
            summary_text: summaryText,
          },
          auditEntries: workflowAuditEntries,
        }
      } catch (error) {
        if (digestInitialized) {
          const finishedAt = now().toISOString()
          const failedStages = stageSummaries
            .filter((stage) => stage.status === 'failed')
            .map((stage) => stage.jobName)

          await repository.upsertDigest({
            runDate,
            status: 'failed',
            startedAt,
            finishedAt,
            newGapCount: latestGapCount,
            newProposalCount: latestProposalCount,
            judgeScoreHistogram: latestJudgeHistogram,
            pendingOwnerReviewCount: 0,
            failedStages,
            summary: toErrorMessage(error),
          })
          digestFinalized = true
        }

        throw error
      } finally {
        if (digestInitialized && !digestFinalized) {
          const currentDigest = await repository.getDigestByRunDate(runDate)
          if (currentDigest?.status === 'running') {
            await repository.upsertDigest({
              runDate,
              status: 'failed',
              startedAt,
              finishedAt: now().toISOString(),
              newGapCount: latestGapCount,
              newProposalCount: latestProposalCount,
              judgeScoreHistogram: latestJudgeHistogram,
              pendingOwnerReviewCount: 0,
              failedStages: stageSummaries
                .filter((stage) => stage.status === 'failed')
                .map((stage) => stage.jobName),
              summary: 'aborted without finalization',
            })
          }
        }
      }
    },
  }
}
