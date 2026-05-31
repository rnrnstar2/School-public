import { EvalRunRowSchema, type EvalRunRow, type JudgeTarget, type RunSummary } from './schema'
import { RUBRIC_REF } from './rubric'

/**
 * Build a `decision_ledger.evaluation_runs` Insert-shape row from a completed
 * RunSummary. The caller is responsible for DB insertion; this helper just
 * encodes the row contract.
 *
 * One row per writer target (matcher, gap, proposer) is emitted, plus one
 * aggregate row that encodes the whole run's verdict. Each row uses
 * max_score = 10 and the target-specific metric as `score` scaled to 0..10.
 */
export function buildEvalRunRows(summary: RunSummary): EvalRunRow[] {
  const rows: EvalRunRow[] = []

  rows.push(
    buildTargetRow({
      target: 'matcher',
      summary,
      score: scoreFromFraction(summary.metrics.matcher.recallAt3),
      verdict: summary.verdicts.filter((v) => v.target === 'matcher'),
      metric: summary.metrics.matcher,
    }),
  )

  rows.push(
    buildTargetRow({
      target: 'gap',
      summary,
      score: scoreFromFraction(summary.metrics.gap.precision),
      verdict: summary.verdicts.filter((v) => v.target === 'gap'),
      metric: summary.metrics.gap,
    }),
  )

  rows.push(
    buildTargetRow({
      target: 'proposer',
      summary,
      score: scoreFromFraction(summary.metrics.proposer.agreement),
      verdict: summary.verdicts.filter((v) => v.target === 'proposer'),
      metric: summary.metrics.proposer,
    }),
  )

  return rows
}

function scoreFromFraction(value: number): number {
  return Math.round(value * 10 * 100) / 100
}

function buildTargetRow(args: {
  target: JudgeTarget
  summary: RunSummary
  score: number
  verdict: Array<{
    verdict: 'pass' | 'fail'
    failReasons: string[]
  }>
  metric: Record<string, number>
}): EvalRunRow {
  // A target row is `'pass'` only if (a) no case-level fail verdict for that
  // target exists, AND (b) no synthetic `run_summary` verdict (from the
  // runner's per-target rubric gate) for that target carries `fail`. Both
  // checks collapse into filtering the target-scoped verdict list for any
  // `'fail'` entry — runner is responsible for tagging rubric misses with the
  // correct `target` so the filter catches them.
  const failing = args.verdict.filter((v) => v.verdict === 'fail')
  const rowVerdict: EvalRunRow['verdict'] = failing.length === 0 ? 'pass' : 'fail'

  const failReasons = Array.from(
    new Set(
      failing.flatMap((v) => v.failReasons ?? []),
    ),
  ).sort()

  const row = {
    evaluator: args.summary.evaluator,
    score: args.score,
    max_score: 10 as const,
    verdict: rowVerdict,
    rubric_ref: RUBRIC_REF,
    fail_reasons: failReasons,
    details: {
      run_id: args.summary.runId,
      dataset_version: args.summary.datasetVersion,
      split: args.summary.split,
      target: args.target,
      metric: args.metric,
    },
    action_id: null,
    goal_id: null,
    evaluated_at: args.summary.runAt,
  }

  return EvalRunRowSchema.parse(row)
}
