/**
 * TQ-238: Owner-facing mentor-quality metrics.
 *
 * Pure aggregation helpers over `decision_ledger.agent_runs` and
 * `decision_ledger.evaluation_runs` rows. The DB itself is read by the
 * route / page using a service-role client — these helpers only operate on
 * normalized in-memory rows so they are deterministic and trivially
 * testable.
 *
 * Schema notes (see `apps/web/supabase/migrations/20260416000000_decision_ledger.sql`):
 * - `agent_runs.metadata jsonb` is where `model`, `cost_usd`, `latency_ms`,
 *   `plan_id`, `step_id`, `user_id` live (no dedicated columns yet).
 * - `evaluation_runs.details jsonb` is where the 4-axis sub-scores live
 *   (`ai_utilization`, `non_eng_friendly`, `shortest_path`, `fit`). The
 *   parent `score` / `verdict` columns remain authoritative for pass/fail.
 *
 * Out of scope for TQ-238:
 * - Persisting metric snapshots
 * - Realtime streaming
 * - Owner alerts / thresholds
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface AgentRunRecord {
  id: string
  agentType: string
  runStatus: string
  startedAt: string
  finishedAt: string | null
  metadata: Record<string, unknown> | null
}

export interface EvaluationRunRecord {
  id: string
  agentRunId: string | null
  goalId: string | null
  actionId: string | null
  evaluator: string
  score: number | null
  maxScore: number
  verdict: string
  evaluatedAt: string
  details: Record<string, unknown> | null
}

export const QUALITY_AXES = [
  'ai_utilization',
  'non_eng_friendly',
  'shortest_path',
  'fit',
] as const
export type QualityAxis = (typeof QUALITY_AXES)[number]

export interface QualityScoreSeriesPoint {
  /** ISO date (YYYY-MM-DD) of the bucket. */
  date: string
  /** Number of evaluation_runs aggregated. */
  count: number
  /** Mean score on `ai_utilization` axis (0–1) or null if no rows. */
  ai_utilization: number | null
  /** Mean score on `non_eng_friendly` axis (0–1) or null. */
  non_eng_friendly: number | null
  /** Mean score on `shortest_path` axis (0–1) or null. */
  shortest_path: number | null
  /** Mean score on `fit` axis (0–1) or null. */
  fit: number | null
}

export interface CostMonthBucket {
  /** YYYY-MM. */
  month: string
  /** Total cost (USD) summed across runs in this bucket. */
  totalCostUsd: number
  /** Number of runs in this bucket. */
  runs: number
  /** Distinct plan_ids encountered. */
  plans: number
  /** Average cost per plan. 0 if `plans === 0`. */
  costPerPlanUsd: number
}

export type AgentRunStatusBucket =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'running'
  | 'other'

export interface SubAgentFailureStats {
  total: number
  byStatus: Record<AgentRunStatusBucket, number>
  /** failed + timeout share of total (0–1). 0 when total = 0. */
  failureRate: number
}

export interface ModelUsageRow {
  model: string
  runs: number
  /** Sum of cost_usd in metadata; 0 when absent. */
  totalCostUsd: number
  /** Mean latency_ms over runs that exposed it; null when none. */
  avgLatencyMs: number | null
}

export interface RecentPlanRunSummary {
  planId: string | null
  /** Latest finished_at (or started_at) across this plan's runs (ISO). */
  lastActivityAt: string
  runs: number
  /** Average score (0–1) across evaluation_runs tied to this plan. null when none. */
  averageScore: number | null
  /** Distinct models encountered for this plan. */
  models: string[]
  /** Sum of cost_usd in metadata across this plan's runs. */
  totalCostUsd: number
}

export interface MentorQualitySnapshot {
  generatedAt: string
  qualityTimeline: QualityScoreSeriesPoint[]
  costByMonth: CostMonthBucket[]
  subAgentFailures: SubAgentFailureStats
  modelUsage: ModelUsageRow[]
  recentPlans: RecentPlanRunSummary[]
}

// ── helpers ─────────────────────────────────────────────────────────────

function readMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) return null
  const value = metadata[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function readMetadataNumber(
  metadata: Record<string, unknown> | null,
  ...keys: string[]
): number | null {
  if (!metadata) return null
  for (const key of keys) {
    const raw = metadata[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function readPlanId(metadata: Record<string, unknown> | null): string | null {
  return readMetadataString(metadata, 'plan_id') ?? readMetadataString(metadata, 'planId')
}

function readModel(metadata: Record<string, unknown> | null): string | null {
  return readMetadataString(metadata, 'model') ?? readMetadataString(metadata, 'model_id')
}

function readCostUsd(metadata: Record<string, unknown> | null): number {
  const value = readMetadataNumber(metadata, 'cost_usd', 'costUsd')
  return value !== null && value >= 0 ? value : 0
}

function readLatencyMs(metadata: Record<string, unknown> | null): number | null {
  const value = readMetadataNumber(metadata, 'latency_ms', 'latencyMs')
  return value !== null && value >= 0 ? value : null
}

function readAxisScore(
  details: Record<string, unknown> | null,
  axis: QualityAxis,
): number | null {
  if (!details) return null

  // Axis sub-scores may live either as flat keys or under a `scores` object.
  const flat = readMetadataNumber(details, axis)
  if (flat !== null) return clamp01(flat)

  const scoresRaw = details.scores
  if (scoresRaw && typeof scoresRaw === 'object' && !Array.isArray(scoresRaw)) {
    const value = readMetadataNumber(scoresRaw as Record<string, unknown>, axis)
    if (value !== null) return clamp01(value)
  }

  const axisRaw = details.axes
  if (axisRaw && typeof axisRaw === 'object' && !Array.isArray(axisRaw)) {
    const value = readMetadataNumber(axisRaw as Record<string, unknown>, axis)
    if (value !== null) return clamp01(value)
  }

  return null
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) {
    // Some evaluators emit 0–10 or 0–100; normalize a few common scales.
    if (value <= 10) return value / 10
    if (value <= 100) return value / 100
    return 1
  }
  return value
}

function toIsoDate(value: string): string | null {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

function toIsoMonth(value: string): string | null {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 7)
}

function bucketStatus(status: string): AgentRunStatusBucket {
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case 'success':
      return 'success'
    case 'failed':
    case 'error':
      return 'failed'
    case 'timeout':
      return 'timeout'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'running':
      return 'running'
    default:
      return 'other'
  }
}

// ── aggregations ────────────────────────────────────────────────────────

/**
 * Build a per-day mean for each of the 4 quality axes from
 * `evaluation_runs` rows. Days with zero rows are omitted.
 *
 * @param runs Evaluation rows ordered any way; we sort by date ascending.
 * @param windowDays How many trailing days to keep. Default 30.
 */
export function buildQualityTimeline(
  runs: EvaluationRunRecord[],
  options: { windowDays?: number; now?: Date } = {},
): QualityScoreSeriesPoint[] {
  const windowDays = options.windowDays ?? 30
  const now = options.now ?? new Date()
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000

  const buckets = new Map<
    string,
    {
      count: number
      sums: Record<QualityAxis, number>
      hits: Record<QualityAxis, number>
    }
  >()

  for (const run of runs) {
    const ms = Date.parse(run.evaluatedAt)
    if (!Number.isFinite(ms) || ms < cutoff) continue
    const date = toIsoDate(run.evaluatedAt)
    if (!date) continue

    let bucket = buckets.get(date)
    if (!bucket) {
      bucket = {
        count: 0,
        sums: { ai_utilization: 0, non_eng_friendly: 0, shortest_path: 0, fit: 0 },
        hits: { ai_utilization: 0, non_eng_friendly: 0, shortest_path: 0, fit: 0 },
      }
      buckets.set(date, bucket)
    }

    bucket.count += 1
    for (const axis of QUALITY_AXES) {
      const value = readAxisScore(run.details, axis)
      if (value !== null) {
        bucket.sums[axis] += value
        bucket.hits[axis] += 1
      }
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => ({
      date,
      count: bucket.count,
      ai_utilization:
        bucket.hits.ai_utilization > 0
          ? bucket.sums.ai_utilization / bucket.hits.ai_utilization
          : null,
      non_eng_friendly:
        bucket.hits.non_eng_friendly > 0
          ? bucket.sums.non_eng_friendly / bucket.hits.non_eng_friendly
          : null,
      shortest_path:
        bucket.hits.shortest_path > 0
          ? bucket.sums.shortest_path / bucket.hits.shortest_path
          : null,
      fit: bucket.hits.fit > 0 ? bucket.sums.fit / bucket.hits.fit : null,
    }))
}

/**
 * Group `agent_runs.metadata.cost_usd` by month and compute per-plan
 * averages. Rows without a plan_id still contribute to total cost but are
 * counted as a single shared "unscoped" plan.
 */
export function buildCostByMonth(
  runs: AgentRunRecord[],
  options: { months?: number; now?: Date } = {},
): CostMonthBucket[] {
  const months = options.months ?? 6
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).getTime()

  const buckets = new Map<
    string,
    { totalCostUsd: number; runs: number; planIds: Set<string> }
  >()

  for (const run of runs) {
    const ms = Date.parse(run.startedAt)
    if (!Number.isFinite(ms) || ms < cutoff) continue
    const month = toIsoMonth(run.startedAt)
    if (!month) continue

    let bucket = buckets.get(month)
    if (!bucket) {
      bucket = { totalCostUsd: 0, runs: 0, planIds: new Set() }
      buckets.set(month, bucket)
    }

    bucket.totalCostUsd += readCostUsd(run.metadata)
    bucket.runs += 1
    const planId = readPlanId(run.metadata) ?? '__unscoped__'
    bucket.planIds.add(planId)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, bucket]) => ({
      month,
      totalCostUsd: round2(bucket.totalCostUsd),
      runs: bucket.runs,
      plans: bucket.planIds.size,
      costPerPlanUsd:
        bucket.planIds.size > 0
          ? round2(bucket.totalCostUsd / bucket.planIds.size)
          : 0,
    }))
}

/**
 * Bucket sub-agent run statuses. `failureRate = (failed + timeout) / total`.
 */
export function summarizeSubAgentFailures(
  runs: AgentRunRecord[],
): SubAgentFailureStats {
  const byStatus: Record<AgentRunStatusBucket, number> = {
    success: 0,
    failed: 0,
    timeout: 0,
    cancelled: 0,
    running: 0,
    other: 0,
  }

  for (const run of runs) {
    byStatus[bucketStatus(run.runStatus)] += 1
  }

  const total = runs.length
  const failureRate =
    total > 0 ? (byStatus.failed + byStatus.timeout) / total : 0

  return { total, byStatus, failureRate }
}

/**
 * Group runs by `metadata.model`. Rows without a model are grouped as
 * `'unknown'` so Owner can spot un-tagged sub-agents.
 */
export function summarizeModelUsage(runs: AgentRunRecord[]): ModelUsageRow[] {
  const buckets = new Map<
    string,
    { runs: number; totalCostUsd: number; latencySum: number; latencyHits: number }
  >()

  for (const run of runs) {
    const model = readModel(run.metadata) ?? 'unknown'
    let bucket = buckets.get(model)
    if (!bucket) {
      bucket = { runs: 0, totalCostUsd: 0, latencySum: 0, latencyHits: 0 }
      buckets.set(model, bucket)
    }
    bucket.runs += 1
    bucket.totalCostUsd += readCostUsd(run.metadata)
    const latency = readLatencyMs(run.metadata)
    if (latency !== null) {
      bucket.latencySum += latency
      bucket.latencyHits += 1
    }
  }

  return Array.from(buckets.entries())
    .map(([model, bucket]) => ({
      model,
      runs: bucket.runs,
      totalCostUsd: round2(bucket.totalCostUsd),
      avgLatencyMs:
        bucket.latencyHits > 0
          ? Math.round(bucket.latencySum / bucket.latencyHits)
          : null,
    }))
    .sort((a, b) => b.runs - a.runs)
}

/**
 * Per-plan summary across the most recent N plans. `evaluations` are
 * matched against runs by `agent_run_id` (preferred) or fallback to plan_id
 * via metadata (defense-in-depth, since evaluation_runs has no plan_id
 * column).
 */
export function summarizeRecentPlans(
  runs: AgentRunRecord[],
  evaluations: EvaluationRunRecord[],
  options: { limit?: number } = {},
): RecentPlanRunSummary[] {
  const limit = options.limit ?? 10

  // 1. Group runs by plan_id.
  const planBuckets = new Map<
    string,
    {
      runs: AgentRunRecord[]
      lastActivityMs: number
      models: Set<string>
      totalCostUsd: number
    }
  >()

  for (const run of runs) {
    const planId = readPlanId(run.metadata)
    if (!planId) continue

    let bucket = planBuckets.get(planId)
    if (!bucket) {
      bucket = {
        runs: [],
        lastActivityMs: 0,
        models: new Set(),
        totalCostUsd: 0,
      }
      planBuckets.set(planId, bucket)
    }

    bucket.runs.push(run)
    bucket.totalCostUsd += readCostUsd(run.metadata)
    const model = readModel(run.metadata)
    if (model) bucket.models.add(model)

    const activityRaw = run.finishedAt ?? run.startedAt
    const ms = Date.parse(activityRaw)
    if (Number.isFinite(ms) && ms > bucket.lastActivityMs) {
      bucket.lastActivityMs = ms
    }
  }

  // 2. Build run-id → plan_id map for fast eval->plan attribution.
  const runIdToPlanId = new Map<string, string>()
  for (const [planId, bucket] of planBuckets.entries()) {
    for (const run of bucket.runs) {
      runIdToPlanId.set(run.id, planId)
    }
  }

  // 3. Aggregate evaluations per plan.
  const planScores = new Map<string, { sum: number; hits: number }>()
  for (const evaluation of evaluations) {
    let planId: string | null = null
    if (evaluation.agentRunId) {
      planId = runIdToPlanId.get(evaluation.agentRunId) ?? null
    }
    if (!planId) continue

    if (evaluation.score === null || !Number.isFinite(evaluation.score)) continue
    const normalized = clamp01(
      evaluation.maxScore > 0
        ? evaluation.score / evaluation.maxScore
        : evaluation.score,
    )

    let agg = planScores.get(planId)
    if (!agg) {
      agg = { sum: 0, hits: 0 }
      planScores.set(planId, agg)
    }
    agg.sum += normalized
    agg.hits += 1
  }

  // 4. Sort plans by recency and slice.
  const sorted = Array.from(planBuckets.entries()).sort(
    ([, a], [, b]) => b.lastActivityMs - a.lastActivityMs,
  )

  return sorted.slice(0, limit).map(([planId, bucket]) => {
    const score = planScores.get(planId)
    return {
      planId,
      lastActivityAt: new Date(bucket.lastActivityMs).toISOString(),
      runs: bucket.runs.length,
      averageScore:
        score && score.hits > 0 ? round2(score.sum / score.hits) : null,
      models: Array.from(bucket.models).sort(),
      totalCostUsd: round2(bucket.totalCostUsd),
    }
  })
}

/**
 * Top-level snapshot: combines all four aggregations. Pure function — the
 * caller is responsible for fetching + normalizing rows from Supabase.
 */
export function buildMentorQualitySnapshot(
  runs: AgentRunRecord[],
  evaluations: EvaluationRunRecord[],
  options: { now?: Date; recentPlanLimit?: number } = {},
): MentorQualitySnapshot {
  const now = options.now ?? new Date()

  return {
    generatedAt: now.toISOString(),
    qualityTimeline: buildQualityTimeline(evaluations, { now }),
    costByMonth: buildCostByMonth(runs, { now }),
    subAgentFailures: summarizeSubAgentFailures(runs),
    modelUsage: summarizeModelUsage(runs),
    recentPlans: summarizeRecentPlans(runs, evaluations, {
      limit: options.recentPlanLimit ?? 10,
    }),
  }
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

// ── row normalizers (for the route / page) ──────────────────────────────

export function normalizeAgentRunRow(row: Record<string, unknown>): AgentRunRecord {
  return {
    id: String(row.id ?? ''),
    agentType: String(row.agent_type ?? 'other'),
    runStatus: String(row.run_status ?? 'other'),
    startedAt: typeof row.started_at === 'string' ? row.started_at : new Date(0).toISOString(),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  }
}

// ── per-user monthly budget cap (TQ-269 / W50) ─────────────────────────
//
// Phase 3 (orchestrator unlock) gates on a hard per-user budget enforced
// before sub-agent dispatch. The values live next to the rest of the
// owner-facing cost telemetry so /admin/digest and the cap helpers read
// the same `agent_runs.metadata.cost_usd` field.
//
// Out of scope here (W50): wiring the enforce call into the conductor /
// sub-agent dispatcher (W47 owns that). This file only exports the pure
// helpers + a typed BudgetCapError so callers can catch and degrade.

/** Default monthly cap (USD) when env override is missing or invalid. */
export const DEFAULT_USER_MONTHLY_BUDGET_CAP_USD = 5.0

/**
 * Resolve the configured per-user monthly cap (USD). Reads
 * `MENTOR_USER_MONTHLY_BUDGET_CAP_USD` from env; falls back to
 * {@link DEFAULT_USER_MONTHLY_BUDGET_CAP_USD} when missing, non-numeric,
 * or non-positive.
 */
export function getConfiguredUserMonthlyBudgetCapUsd(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): number {
  const raw = env.MENTOR_USER_MONTHLY_BUDGET_CAP_USD
  if (!raw) return DEFAULT_USER_MONTHLY_BUDGET_CAP_USD
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_USER_MONTHLY_BUDGET_CAP_USD
  }
  return parsed
}

/**
 * Sum `agent_runs.metadata.cost_usd` for a single user across the current
 * UTC month. The caller is responsible for passing rows already filtered
 * to that user (we do not re-filter on user_id to keep this pure).
 *
 * @param runs Agent runs the caller has already filtered by user_id.
 * @param now  Defaults to `new Date()`. Override in tests for determinism.
 */
export function getUserMonthlyBudgetUsd(
  runs: AgentRunRecord[],
  options: { now?: Date } = {},
): number {
  const now = options.now ?? new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).getTime()

  let total = 0
  for (const run of runs) {
    const ms = Date.parse(run.startedAt)
    if (!Number.isFinite(ms) || ms < monthStart) continue
    total += readCostUsd(run.metadata)
  }
  return round2(total)
}

/**
 * Thrown by {@link enforceUserBudgetCap} when the projected month-to-date
 * spend would exceed the configured cap. Callers (conductor / dispatch)
 * should catch this and respond 429 / degrade gracefully — never let it
 * bubble to a 500.
 */
export class BudgetCapError extends Error {
  readonly userId: string
  readonly currentUsd: number
  readonly estimateUsd: number
  readonly capUsd: number

  constructor(args: {
    userId: string
    currentUsd: number
    estimateUsd: number
    capUsd: number
  }) {
    super(
      `User ${args.userId} would exceed monthly budget cap ` +
        `(current=${args.currentUsd.toFixed(2)} + ` +
        `estimate=${args.estimateUsd.toFixed(2)} > ` +
        `cap=${args.capUsd.toFixed(2)} USD)`,
    )
    this.name = 'BudgetCapError'
    this.userId = args.userId
    this.currentUsd = args.currentUsd
    this.estimateUsd = args.estimateUsd
    this.capUsd = args.capUsd
  }
}

export interface EnforceUserBudgetCapResult {
  /** True when the projected total stays at or below the cap. */
  allowed: boolean
  /** Month-to-date spend (USD, 2dp) before this run. */
  currentUsd: number
  /** Estimated additional cost the caller is asking to spend. */
  estimateUsd: number
  /** Cap in effect (after env resolution). */
  capUsd: number
  /** Remaining headroom (USD, 2dp). 0 when over. */
  remainingUsd: number
}

/**
 * Pure budget gate. Returns a result object instead of throwing so the
 * caller can choose between hard-fail (re-throw {@link BudgetCapError})
 * and graceful degradation (skip sub-agent, surface a banner).
 *
 * The throwing variant {@link assertUserBudgetCap} is provided as a
 * convenience for the dispatch path.
 */
export function enforceUserBudgetCap(args: {
  userId: string
  runs: AgentRunRecord[]
  estimateUsd: number
  capUsd?: number
  now?: Date
}): EnforceUserBudgetCapResult {
  const capUsd =
    args.capUsd !== undefined && Number.isFinite(args.capUsd) && args.capUsd > 0
      ? args.capUsd
      : getConfiguredUserMonthlyBudgetCapUsd()
  const estimateUsd =
    Number.isFinite(args.estimateUsd) && args.estimateUsd > 0
      ? args.estimateUsd
      : 0
  const currentUsd = getUserMonthlyBudgetUsd(args.runs, { now: args.now })
  const projected = currentUsd + estimateUsd
  const allowed = projected <= capUsd
  return {
    allowed,
    currentUsd,
    estimateUsd: round2(estimateUsd),
    capUsd: round2(capUsd),
    remainingUsd: allowed ? round2(capUsd - projected) : 0,
  }
}

/**
 * Throwing variant of {@link enforceUserBudgetCap}. Use from sub-agent
 * dispatch when a denied call should propagate as a typed error.
 */
export function assertUserBudgetCap(args: {
  userId: string
  runs: AgentRunRecord[]
  estimateUsd: number
  capUsd?: number
  now?: Date
}): EnforceUserBudgetCapResult {
  const result = enforceUserBudgetCap(args)
  if (!result.allowed) {
    throw new BudgetCapError({
      userId: args.userId,
      currentUsd: result.currentUsd,
      estimateUsd: result.estimateUsd,
      capUsd: result.capUsd,
    })
  }
  return result
}

export function normalizeEvaluationRunRow(
  row: Record<string, unknown>,
): EvaluationRunRecord {
  const score = row.score
  return {
    id: String(row.id ?? ''),
    agentRunId: typeof row.agent_run_id === 'string' ? row.agent_run_id : null,
    goalId: typeof row.goal_id === 'string' ? row.goal_id : null,
    actionId: typeof row.action_id === 'string' ? row.action_id : null,
    evaluator: String(row.evaluator ?? 'judge_model'),
    score:
      typeof score === 'number' && Number.isFinite(score)
        ? score
        : typeof score === 'string' && Number.isFinite(Number(score))
          ? Number(score)
          : null,
    maxScore:
      typeof row.max_score === 'number' && Number.isFinite(row.max_score)
        ? row.max_score
        : 10,
    verdict: String(row.verdict ?? 'pending'),
    evaluatedAt:
      typeof row.evaluated_at === 'string'
        ? row.evaluated_at
        : new Date(0).toISOString(),
    details:
      row.details && typeof row.details === 'object' && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : null,
  }
}
