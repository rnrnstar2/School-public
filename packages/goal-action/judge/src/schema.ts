import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// JudgeCase: input to a single case evaluation (one gold action or one gold
// goal depending on which judge is invoked).
// ---------------------------------------------------------------------------

export const JudgeCaseSchema = z
  .object({
    caseId: z.string().min(1),
    goalId: z.string().min(1),
    actionId: z.string().min(1),
  })
  .strict()
export type JudgeCase = z.infer<typeof JudgeCaseSchema>

export const JudgeVerdictStatusSchema = z.enum(['pass', 'fail'])
export type JudgeVerdictStatus = z.infer<typeof JudgeVerdictStatusSchema>

export const JudgeTargetSchema = z.enum(['matcher', 'gap', 'proposer'])
export type JudgeTarget = z.infer<typeof JudgeTargetSchema>

// ---------------------------------------------------------------------------
// JudgeVerdict: per-case output from a single judge invocation.
// ---------------------------------------------------------------------------

export const JudgeVerdictSchema = z
  .object({
    caseId: z.string().min(1),
    target: JudgeTargetSchema,
    score: z.number().min(0).max(10),
    verdict: JudgeVerdictStatusSchema,
    failReasons: z.array(z.string()),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>

// ---------------------------------------------------------------------------
// Per-writer metrics (matcher/gap/proposer).
// ---------------------------------------------------------------------------

export const MatcherMetricsSchema = z
  .object({
    precision: z.number().min(0).max(1),
    recallAt3: z.number().min(0).max(1),
    casesEvaluated: z.number().int().min(0),
  })
  .strict()
export type MatcherMetrics = z.infer<typeof MatcherMetricsSchema>

export const GapMetricsSchema = z
  .object({
    precision: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    truePositives: z.number().int().min(0),
    falsePositives: z.number().int().min(0),
    falseNegatives: z.number().int().min(0),
    casesEvaluated: z.number().int().min(0),
  })
  .strict()
export type GapMetrics = z.infer<typeof GapMetricsSchema>

export const ProposerMetricsSchema = z
  .object({
    agreement: z.number().min(0).max(1),
    matched: z.number().int().min(0),
    casesEvaluated: z.number().int().min(0),
  })
  .strict()
export type ProposerMetrics = z.infer<typeof ProposerMetricsSchema>

export const RunMetricsSchema = z
  .object({
    matcher: MatcherMetricsSchema,
    gap: GapMetricsSchema,
    proposer: ProposerMetricsSchema,
  })
  .strict()
export type RunMetrics = z.infer<typeof RunMetricsSchema>

// ---------------------------------------------------------------------------
// RunSummary: top-level return value of runJudge().
// ---------------------------------------------------------------------------

export const RunSplitSchema = z.enum(['train', 'validation', 'all'])
export type RunSplit = z.infer<typeof RunSplitSchema>

export const RunSummarySchema = z
  .object({
    runId: z.string().min(1),
    datasetVersion: z.string().min(1),
    split: RunSplitSchema,
    evaluator: z.string().min(1),
    metrics: RunMetricsSchema,
    verdicts: z.array(JudgeVerdictSchema),
    rubricRef: z.string().min(1),
    runAt: z.string().min(1),
  })
  .strict()
export type RunSummary = z.infer<typeof RunSummarySchema>

// ---------------------------------------------------------------------------
// EvalRunRow: shape suitable for decision_ledger.evaluation_runs INSERT.
// Mirrors `EvaluationRunInsert` from
// apps/web/src/lib/supabase/decision-ledger.ts but is re-declared locally so
// the judge package does not depend on the web app.
// ---------------------------------------------------------------------------

const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const JsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonSchema), z.record(z.string(), JsonSchema)]),
)

export const EvalRunRowSchema = z
  .object({
    evaluator: z.string().min(1),
    score: z.number().min(0).max(10).nullable(),
    max_score: z.literal(10),
    verdict: z.enum(['pass', 'fail', 'warn', 'pending', 'skipped']),
    rubric_ref: z.string().min(1),
    fail_reasons: z.array(z.string()),
    details: z.record(z.string(), JsonSchema),
    action_id: z.string().nullable(),
    goal_id: z.string().nullable(),
    evaluated_at: z.string().min(1),
  })
  .strict()
export type EvalRunRow = z.infer<typeof EvalRunRowSchema>
