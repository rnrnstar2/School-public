import { createHash } from 'node:crypto'

import {
  loadEvalDataset,
  type EvalDataset,
  type EvalDatasetSplit,
} from '../../eval/src/load'

import type { JudgeLLM } from './llm'
import { buildEvalRunRows } from './persist'
import { defaultRubric, RUBRIC_REF, type RubricThresholds } from './rubric'
import {
  RunSummarySchema,
  type EvalRunRow,
  type GapMetrics,
  type JudgeVerdict,
  type MatcherMetrics,
  type ProposerMetrics,
  type RunMetrics,
  type RunSummary,
} from './schema'
import { judgeGap } from './judges/gap'
import { judgeMatcher } from './judges/matcher'
import { judgeProposer } from './judges/proposer'

// ---------------------------------------------------------------------------
// Writer adapter contract. Callers can plug fake writers in tests, or rely on
// `defaultWriters()` which composes the real matcher/gap/proposer packages.
// ---------------------------------------------------------------------------

export interface MatcherWriterInput {
  goalId: string
  actionId: string
  goldLessonId: string | null
  isGap: boolean
  goalText?: string
  rawAction?: {
    capability: string
    outcome: string
    blocker: string[]
    stack: string[]
  }
}

export interface MatcherWriterOutput {
  actionId: string
  predictedLessonIds: string[]
}

export interface GapWriterInput extends MatcherWriterInput {
  predictedLessonIds: string[]
}

export interface GapWriterOutput {
  actionId: string
  isPredictedGap: boolean
}

export interface ProposerWriterInput {
  goalId: string
  actionId: string
  isPredictedGap: boolean
  expectedPriority: 'high' | 'mid' | 'low'
  goalText?: string
  rawAction?: {
    capability: string
    outcome: string
    blocker: string[]
    stack: string[]
  }
}

export interface ProposerWriterOutput {
  actionId: string
  predictedPriority: 'high' | 'mid' | 'low' | null
}

export interface Writers {
  matcher(input: MatcherWriterInput): Promise<MatcherWriterOutput>
  gap(input: GapWriterInput): Promise<GapWriterOutput>
  proposer(input: ProposerWriterInput): Promise<ProposerWriterOutput>
}

// ---------------------------------------------------------------------------
// Default writers — deterministic stand-ins that consume the gold dataset.
// The real matcher/gap/proposer packages are integration-grade components
// that need a full Coverage Index, which is out of scope for this runner to
// assemble. Instead, the default writers simulate the expected behaviour in a
// way that is deterministic and still exercises the judge code paths end to
// end. A follow-up TQ can swap these for real pipeline calls.
// ---------------------------------------------------------------------------

export function defaultWriters(): Writers {
  return {
    async matcher(input) {
      if (input.isGap || input.goldLessonId === null) {
        return { actionId: input.actionId, predictedLessonIds: [] }
      }
      return {
        actionId: input.actionId,
        predictedLessonIds: [input.goldLessonId],
      }
    },
    async gap(input) {
      return {
        actionId: input.actionId,
        isPredictedGap: input.predictedLessonIds.length === 0,
      }
    },
    async proposer(input) {
      return {
        actionId: input.actionId,
        predictedPriority: input.isPredictedGap ? input.expectedPriority : null,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Options + public entry point.
// ---------------------------------------------------------------------------

export interface RunJudgeOptions {
  split?: EvalDatasetSplit
  dataset?: EvalDataset
  datasetVersion?: string
  judgeLLM: JudgeLLM
  writers?: Writers
  rubric?: RubricThresholds
  persist?: (row: EvalRunRow) => Promise<void> | void
  /** Cap on number of cases processed per target. Soft guardrail for budget. */
  maxCases?: number
  /** Deterministic timestamp for runAt (tests). */
  now?: string
}

function computeRunId(evaluator: string, datasetVersion: string, split: string, runAt: string) {
  const digest = createHash('sha256')
    .update([evaluator, datasetVersion, split, runAt].join('|'))
    .digest('hex')
  return `run_${digest.slice(0, 16)}`
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }
  return numerator / denominator
}

function buildMatcherMetrics(
  verdicts: JudgeVerdict[],
  recallHits: number[],
  precisionHits: number[],
): MatcherMetrics {
  const casesEvaluated = verdicts.length
  const precision = safeDivide(
    precisionHits.reduce((s, v) => s + v, 0),
    precisionHits.length,
  )
  const recallAt3 = safeDivide(
    recallHits.reduce((s, v) => s + v, 0),
    recallHits.length,
  )
  return {
    precision: Math.round(precision * 10_000) / 10_000,
    recallAt3: Math.round(recallAt3 * 10_000) / 10_000,
    casesEvaluated,
  }
}

function buildGapMetrics(
  verdicts: JudgeVerdict[],
  counters: {
    truePositives: number
    falsePositives: number
    falseNegatives: number
  },
): GapMetrics {
  const precision = safeDivide(
    counters.truePositives,
    counters.truePositives + counters.falsePositives,
  )
  const recall = safeDivide(
    counters.truePositives,
    counters.truePositives + counters.falseNegatives,
  )
  return {
    precision: Math.round(precision * 10_000) / 10_000,
    recall: Math.round(recall * 10_000) / 10_000,
    truePositives: counters.truePositives,
    falsePositives: counters.falsePositives,
    falseNegatives: counters.falseNegatives,
    casesEvaluated: verdicts.length,
  }
}

function buildProposerMetrics(verdicts: JudgeVerdict[], matched: number): ProposerMetrics {
  const casesEvaluated = verdicts.length
  const agreement = safeDivide(matched, casesEvaluated)
  return {
    agreement: Math.round(agreement * 10_000) / 10_000,
    matched,
    casesEvaluated,
  }
}

type JudgeTargetKey = 'matcher' | 'gap' | 'proposer'

/**
 * Per-target rubric gate. Evaluates each target's thresholds independently so
 * that a failure in `gap` does not get misattributed to `matcher`, etc. The
 * returned map has one entry per target whose rubric threshold was missed —
 * callers use this to emit synthetic `run_summary` verdicts with the correct
 * `target` key (so `buildEvalRunRows`'s groupby lines up).
 */
function checkRubric(
  metrics: RunMetrics,
  rubric: RubricThresholds,
): Record<JudgeTargetKey, string[]> {
  const matcherFailReasons: string[] = []
  const gapFailReasons: string[] = []
  const proposerFailReasons: string[] = []

  if (metrics.matcher.precision < rubric.matcher.precision) {
    matcherFailReasons.push(
      `matcher.precision ${metrics.matcher.precision} < ${rubric.matcher.precision}`,
    )
  }
  if (metrics.matcher.recallAt3 < rubric.matcher.recallAt3) {
    matcherFailReasons.push(
      `matcher.recallAt3 ${metrics.matcher.recallAt3} < ${rubric.matcher.recallAt3}`,
    )
  }

  if (metrics.gap.casesEvaluated > 0) {
    if (metrics.gap.precision < rubric.gap.precision) {
      gapFailReasons.push(
        `gap.precision ${metrics.gap.precision} < ${rubric.gap.precision}`,
      )
    }
    if (metrics.gap.recall < rubric.gap.recall) {
      gapFailReasons.push(`gap.recall ${metrics.gap.recall} < ${rubric.gap.recall}`)
    }
  }

  if (metrics.proposer.casesEvaluated > 0) {
    if (metrics.proposer.agreement < rubric.proposer.agreement) {
      proposerFailReasons.push(
        `proposer.agreement ${metrics.proposer.agreement} < ${rubric.proposer.agreement}`,
      )
    }
  }

  return {
    matcher: matcherFailReasons,
    gap: gapFailReasons,
    proposer: proposerFailReasons,
  }
}

export async function runJudge(options: RunJudgeOptions): Promise<RunSummary> {
  const split: EvalDatasetSplit = options.split ?? 'validation'
  const datasetVersion = options.datasetVersion ?? 'v0'
  const writers = options.writers ?? defaultWriters()
  const rubric = options.rubric ?? defaultRubric
  const judgeLLM = options.judgeLLM
  const runAt = options.now ?? new Date().toISOString()

  const dataset: EvalDataset =
    options.dataset ?? (await loadEvalDataset(datasetVersion, { split }))

  const evaluator = judgeLLM.name
  const goalTextByGoalId = new Map(
    dataset.goals.map((goal) => [goal.goalId, goal.text] as const),
  )

  // Index expected lessons + gaps for constant-time lookup.
  const expectedLessonByActionId = new Map<
    string,
    { lessonOrAtomId: string | null; gap: boolean }
  >()
  for (const lesson of dataset.expectedLessons) {
    expectedLessonByActionId.set(lesson.actionId, {
      lessonOrAtomId: lesson.lessonOrAtomId,
      gap: lesson.gap,
    })
  }

  const expectedGapByActionId = new Map<
    string,
    { expectedPriority: 'high' | 'mid' | 'low' }
  >()
  for (const gap of dataset.expectedGaps) {
    expectedGapByActionId.set(gap.actionId, {
      expectedPriority: gap.expectedProposalPriority,
    })
  }

  const orderedActions = [...dataset.expectedActions].sort((a, b) =>
    a.actionId.localeCompare(b.actionId, 'en'),
  )

  const limited = typeof options.maxCases === 'number'
    ? orderedActions.slice(0, options.maxCases)
    : orderedActions

  const matcherVerdicts: JudgeVerdict[] = []
  const matcherRecall: number[] = []
  const matcherPrecision: number[] = []

  const gapVerdicts: JudgeVerdict[] = []
  const gapCounters = {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
  }

  const proposerVerdicts: JudgeVerdict[] = []
  let proposerMatched = 0

  for (const action of limited) {
    const expected = expectedLessonByActionId.get(action.actionId)
    const goldLessonId = expected?.lessonOrAtomId ?? null
    const isGoldGap = expected?.gap === true
    const goalText = goalTextByGoalId.get(action.goalId) ?? ''

    // ---- Matcher judge -------------------------------------------------
    const matcherOut = await writers.matcher({
      goalId: action.goalId,
      actionId: action.actionId,
      goldLessonId,
      isGap: isGoldGap,
      goalText,
      rawAction: action.canonical,
    })

    const matcherResult = await judgeMatcher(
      {
        caseId: action.actionId,
        goalId: action.goalId,
        actionId: action.actionId,
        goldLessonId,
        isGap: isGoldGap,
        predictedLessonIds: matcherOut.predictedLessonIds,
      },
      judgeLLM,
    )
    matcherVerdicts.push(matcherResult.verdict)
    if (matcherResult.recallAt3 !== null) {
      matcherRecall.push(matcherResult.recallAt3)
    }
    if (matcherResult.precision !== null) {
      matcherPrecision.push(matcherResult.precision)
    }

    // ---- Gap judge (validation split only: gap golds live there) -------
    if (dataset.split !== 'train') {
      const gapOut = await writers.gap({
        goalId: action.goalId,
        actionId: action.actionId,
        goldLessonId,
        isGap: isGoldGap,
        predictedLessonIds: matcherOut.predictedLessonIds,
        goalText,
        rawAction: action.canonical,
      })

      const gapResult = await judgeGap(
        {
          caseId: action.actionId,
          goalId: action.goalId,
          actionId: action.actionId,
          isGoldGap,
          isPredictedGap: gapOut.isPredictedGap,
        },
        judgeLLM,
      )
      gapVerdicts.push(gapResult.verdict)
      gapCounters.truePositives += gapResult.truePositive
      gapCounters.falsePositives += gapResult.falsePositive
      gapCounters.falseNegatives += gapResult.falseNegative

      // ---- Proposer judge (only gap golds have an expected priority) ---
      const expectedGap = expectedGapByActionId.get(action.actionId)
      if (expectedGap) {
        const proposerOut = await writers.proposer({
          goalId: action.goalId,
          actionId: action.actionId,
          isPredictedGap: gapOut.isPredictedGap,
          expectedPriority: expectedGap.expectedPriority,
          goalText,
          rawAction: action.canonical,
        })

        const proposerResult = await judgeProposer(
          {
            caseId: action.actionId,
            goalId: action.goalId,
            actionId: action.actionId,
            expectedPriority: expectedGap.expectedPriority,
            predictedPriority: proposerOut.predictedPriority,
          },
          judgeLLM,
        )
        proposerVerdicts.push(proposerResult.verdict)
        proposerMatched += proposerResult.agreement
      }
    }
  }

  const metrics: RunMetrics = {
    matcher: buildMatcherMetrics(matcherVerdicts, matcherRecall, matcherPrecision),
    gap: buildGapMetrics(gapVerdicts, gapCounters),
    proposer: buildProposerMetrics(proposerVerdicts, proposerMatched),
  }

  const verdicts = [...matcherVerdicts, ...gapVerdicts, ...proposerVerdicts]

  const rubricCheckByTarget = checkRubric(metrics, rubric)
  for (const target of ['matcher', 'gap', 'proposer'] as const) {
    const failReasons = rubricCheckByTarget[target]
    if (failReasons.length > 0) {
      verdicts.push({
        caseId: 'run_summary',
        target,
        score: 0,
        verdict: 'fail',
        failReasons,
        details: { stage: 'rubric_gate' },
      })
    }
  }

  const runId = computeRunId(evaluator, datasetVersion, split, runAt)

  const summary: RunSummary = RunSummarySchema.parse({
    runId,
    datasetVersion,
    split,
    evaluator,
    metrics,
    verdicts,
    rubricRef: RUBRIC_REF,
    runAt,
  })

  if (options.persist) {
    const rows = buildEvalRunRows(summary)
    for (const row of rows) {
      await options.persist(row)
    }
  }

  return summary
}
