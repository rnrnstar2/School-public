import { describe, expect, it, vi } from 'vitest'

import type { EvalDataset } from '@school/goal-action-eval'
import { CoverageIndexSchema } from '@school/goal-action-coverage'

import {
  buildEvalRunRows,
  createRealWriters,
  createFakeJudgeLLM,
  defaultRubric,
  defaultWriters,
  runJudge,
  type EvalRunRow,
  type FakeVerdictFixture,
  type Writers,
} from '../src/index.js'
import fixture from './fixtures/fake-verdicts.json' with { type: 'json' }

// ---------------------------------------------------------------------------
// Minimal deterministic dataset — 3 actions, one gold lesson, one gap,
// one gap with expected priority. This keeps the test independent of the
// real v0 dataset (which lives under eval-datasets/ and can grow over time).
// ---------------------------------------------------------------------------

const NOW = '2026-04-17T00:00:00.000Z'

const baseDataset: EvalDataset = {
  version: 'v0-test',
  split: 'validation',
  goals: [
    {
      goalId: 'goal-fake-001',
      text: 'fake goal for unit test',
      domain: 'test',
      createdAt: '2026-04-17T00:00:00Z',
    },
  ],
  expectedActions: [
    {
      goalId: 'goal-fake-001',
      actionId: 'action-fake-001-happy',
      canonical: {
        capability: 'keyword-research',
        outcome: 'outcome',
        blocker: ['none'],
        stack: ['chatgpt'],
      },
    },
    {
      goalId: 'goal-fake-001',
      actionId: 'action-fake-001-gap',
      canonical: {
        capability: 'synthesis',
        outcome: 'outcome',
        blocker: ['unknown'],
        stack: ['chatgpt'],
      },
    },
  ],
  expectedLessons: [
    {
      actionId: 'action-fake-001-happy',
      lessonOrAtomId: 'atom.fake.lesson-a',
      expectedCoverageScore: 0.9,
      gap: false,
    },
    {
      actionId: 'action-fake-001-gap',
      lessonOrAtomId: null,
      expectedCoverageScore: 0,
      gap: true,
    },
  ],
  expectedGaps: [
    {
      actionId: 'action-fake-001-gap',
      reason: 'fake holdout',
      expectedProposalPriority: 'high',
    },
  ],
}

const realWriterCoverageIndex = CoverageIndexSchema.parse({
  schema_version: 'v1',
  content_hash: '0123456789abcdef0123456789abcdef01234567',
  built_at: 'deterministic',
  lessons: [
    {
      id: 'atom.ai-writer.keyword-research-ai',
      title: 'キーワードリサーチをAIで効率化する',
      summary: '検索キーワードを調査して訴求の方向性を整理する。',
      track_id: 'ai-writer',
      module_id: null,
      milestone_id: null,
      status: 'published',
      capability_inputs: [],
      capability_outputs: ['keyword-research-with-ai'],
      hard_prerequisites: [],
      soft_prerequisites: [],
      persona_tags: ['ai-writer'],
      goal_tags: ['writing', 'research'],
      source_kind: 'factory',
      source_path: 'atom.ai-writer.keyword-research-ai.yaml',
      updated_at: 'deterministic',
    },
  ],
  atoms: [],
  capabilities: [],
  support_assets: [],
  warnings: [],
})

function fakeFixtureFor(cases: string[]): FakeVerdictFixture {
  const out: FakeVerdictFixture = {}
  for (const key of cases) {
    out[key] = { score: 10, verdict: 'pass' }
  }
  return out
}

// ---------------------------------------------------------------------------
// Writers: all-pass baseline (defaultWriters mirrors gold), failing variant
// lets us verify rubric gate + metric drop.
// ---------------------------------------------------------------------------

function failingWriters(): Writers {
  const base = defaultWriters()
  return {
    ...base,
    async matcher(input) {
      // Miss the gold lesson on every non-gap action to force precision=0.
      if (input.isGap || !input.goldLessonId) {
        return { actionId: input.actionId, predictedLessonIds: [] }
      }
      return {
        actionId: input.actionId,
        predictedLessonIds: ['atom.fake.completely-unrelated'],
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runJudge (fake mode)', () => {
  it('completes with deterministic metrics on identical inputs', async () => {
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const runA = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      now: NOW,
    })
    const runB = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      now: NOW,
    })

    expect(runA).toStrictEqual(runB)
    expect(runA.runId).toBe(runB.runId)
    expect(runA.metrics.matcher.precision).toBe(1)
    expect(runA.metrics.matcher.recallAt3).toBe(1)
    expect(runA.metrics.gap.precision).toBe(1)
    expect(runA.metrics.gap.recall).toBe(1)
    expect(runA.metrics.proposer.agreement).toBe(1)
    expect(runA.evaluator).toBe('judge_fake_v0')
  })

  it('emits a run_summary fail verdict when metrics fall below rubric', async () => {
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      writers: failingWriters(),
      now: NOW,
    })

    const runSummary = summary.verdicts.find(
      (v) => v.caseId === 'run_summary',
    )
    expect(runSummary).toBeDefined()
    expect(runSummary?.verdict).toBe('fail')
    expect(runSummary?.failReasons.some((r) => r.startsWith('matcher.precision'))).toBe(true)
  })

  it('calls persist with decision_ledger.evaluation_runs row shape', async () => {
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const persist = vi.fn<(row: EvalRunRow) => Promise<void>>(async () => undefined)

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      persist,
      now: NOW,
    })

    // One row per writer target.
    expect(persist).toHaveBeenCalledTimes(3)

    for (const call of persist.mock.calls) {
      const [row] = call
      expect(row.max_score).toBe(10)
      expect(row.evaluator).toBe('judge_fake_v0')
      expect(row.rubric_ref).toBe('eval-datasets/goal-action/v0/rubric.md')
      expect(['pass', 'fail', 'warn', 'pending', 'skipped']).toContain(row.verdict)
      expect(row.score).toBeGreaterThanOrEqual(0)
      expect(row.score).toBeLessThanOrEqual(10)
      expect(row.details).toMatchObject({
        run_id: summary.runId,
        split: 'validation',
        dataset_version: 'v0-test',
      })
    }
  })

  it('buildEvalRunRows produces 3 rows (matcher/gap/proposer) for a summary', async () => {
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })
    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      now: NOW,
    })

    const rows = buildEvalRunRows(summary)
    expect(rows).toHaveLength(3)
    const targets = rows.map((r) => (r.details as { target: string }).target).sort()
    expect(targets).toEqual(['gap', 'matcher', 'proposer'])
  })

  it('exports the static fake-verdicts.json fixture for CLI use', () => {
    // Sanity check that the fixture we ship on disk is shaped correctly.
    expect(Object.keys(fixture).length).toBeGreaterThan(0)
    for (const record of Object.values(fixture)) {
      expect(typeof (record as { score: number }).score).toBe('number')
      expect(['pass', 'fail']).toContain((record as { verdict: string }).verdict)
    }
  })

  it('respects maxCases guardrail', async () => {
    const judgeLLM = createFakeJudgeLLM({ fixture: {} })
    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      maxCases: 1,
      now: NOW,
    })
    expect(summary.metrics.matcher.casesEvaluated).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Per-target rubric gate regression tests (TQ-139 review round 1).
  //
  // Prior to this fix, a rubric miss in `gap` or `proposer` was always
  // labelled `target: 'matcher'`, so `buildEvalRunRows` misattributed the
  // failure to matcher and persisted the regressed target as `'pass'`. The
  // following tests lock the corrected behavior: per-target rubric gate →
  // per-target synth verdict → per-target row verdict.
  // -------------------------------------------------------------------------

  it('rubric miss on gap only → row shows gap: fail, matcher/proposer: pass', async () => {
    // Force gap precision + recall below threshold by predicting the opposite
    // of ground truth: happy case predicted as gap; gap case predicted as
    // non-gap. Matcher still mirrors gold (defaultWriters.matcher) and
    // proposer still produces a matching priority, so only gap regresses.
    const base = defaultWriters()
    const gapOnlyFailWriters: Writers = {
      ...base,
      async gap(input) {
        return {
          actionId: input.actionId,
          // Invert: lie about gap status to produce FP on happy + FN on gap.
          isPredictedGap: !input.isGap,
        }
      },
      async proposer(input) {
        // Keep proposer honest: agree with expected priority whenever gap.
        return {
          actionId: input.actionId,
          predictedPriority: input.expectedPriority,
        }
      },
    }

    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      writers: gapOnlyFailWriters,
      now: NOW,
    })

    const synths = summary.verdicts.filter((v) => v.caseId === 'run_summary')
    const synthTargets = synths.map((v) => v.target).sort()
    expect(synthTargets).toEqual(['gap'])
    expect(synths[0].failReasons.every((r) => r.startsWith('gap.'))).toBe(true)

    const rows = buildEvalRunRows(summary)
    const byTarget = new Map(
      rows.map((r) => [(r.details as { target: string }).target, r]),
    )
    expect(byTarget.get('matcher')?.verdict).toBe('pass')
    expect(byTarget.get('gap')?.verdict).toBe('fail')
    expect(byTarget.get('proposer')?.verdict).toBe('pass')
    // Matcher row MUST NOT inherit gap's fail reasons.
    expect(byTarget.get('matcher')?.fail_reasons).toEqual([])
  })

  it('rubric miss on proposer.agreement only → only proposer row fails', async () => {
    const base = defaultWriters()
    const proposerOnlyFailWriters: Writers = {
      ...base,
      async proposer(input) {
        // Pick a priority that never matches expected.
        const wrong: 'high' | 'mid' | 'low' =
          input.expectedPriority === 'high' ? 'low' : 'high'
        return { actionId: input.actionId, predictedPriority: wrong }
      },
    }

    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      writers: proposerOnlyFailWriters,
      now: NOW,
    })

    const synths = summary.verdicts.filter((v) => v.caseId === 'run_summary')
    expect(synths.map((v) => v.target).sort()).toEqual(['proposer'])
    expect(synths[0].failReasons.every((r) => r.startsWith('proposer.'))).toBe(true)

    const rows = buildEvalRunRows(summary)
    const byTarget = new Map(
      rows.map((r) => [(r.details as { target: string }).target, r]),
    )
    expect(byTarget.get('matcher')?.verdict).toBe('pass')
    expect(byTarget.get('gap')?.verdict).toBe('pass')
    expect(byTarget.get('proposer')?.verdict).toBe('fail')
  })

  it('rubric miss on matcher.recallAt3 only → only matcher row fails', async () => {
    // failingWriters() already misses the matcher gold lesson for every happy
    // case, which zeros out matcher precision AND recallAt3. Gap + proposer
    // still derive correctly from gold, so only matcher regresses.
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      writers: failingWriters(),
      now: NOW,
    })

    const synths = summary.verdicts.filter((v) => v.caseId === 'run_summary')
    expect(synths.map((v) => v.target).sort()).toEqual(['matcher'])
    expect(synths[0].failReasons.some((r) => r.startsWith('matcher.'))).toBe(true)

    const rows = buildEvalRunRows(summary)
    const byTarget = new Map(
      rows.map((r) => [(r.details as { target: string }).target, r]),
    )
    expect(byTarget.get('matcher')?.verdict).toBe('fail')
    expect(byTarget.get('gap')?.verdict).toBe('pass')
    expect(byTarget.get('proposer')?.verdict).toBe('pass')
  })

  it('all thresholds met + all cases pass → all three rows pass', async () => {
    const judgeLLM = createFakeJudgeLLM({
      fixture: fakeFixtureFor([
        'matcher:action-fake-001-happy',
        'matcher:action-fake-001-gap',
        'gap:action-fake-001-happy',
        'gap:action-fake-001-gap',
        'proposer:action-fake-001-gap',
      ]),
    })

    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      now: NOW,
    })

    const synths = summary.verdicts.filter((v) => v.caseId === 'run_summary')
    expect(synths).toHaveLength(0)

    const rows = buildEvalRunRows(summary)
    const byTarget = new Map(
      rows.map((r) => [(r.details as { target: string }).target, r]),
    )
    expect(byTarget.get('matcher')?.verdict).toBe('pass')
    expect(byTarget.get('gap')?.verdict).toBe('pass')
    expect(byTarget.get('proposer')?.verdict).toBe('pass')
  })

  it('uses defaultRubric when none is passed', async () => {
    const judgeLLM = createFakeJudgeLLM({ fixture: {} })
    const summary = await runJudge({
      dataset: baseDataset,
      datasetVersion: 'v0-test',
      split: 'validation',
      judgeLLM,
      now: NOW,
    })
    // Sanity: verdicts list always includes the per-case matcher verdicts.
    expect(summary.verdicts.filter((v) => v.target === 'matcher').length).toBeGreaterThan(0)
    // defaultRubric exists and is numeric.
    expect(defaultRubric.matcher.precision).toBeGreaterThan(0)
  })

  it('createRealWriters uses matcher/gap/proposer packages with a coverage fixture', async () => {
    const realWriters = createRealWriters({
      coverageIndex: realWriterCoverageIndex,
    })

    const matcher = await realWriters.matcher({
      goalId: 'goal-real-writer',
      actionId: 'action-real-writer',
      goldLessonId: 'atom.ai-writer.keyword-research-ai',
      isGap: false,
      goalText: '記事企画のために検索キーワードを調べたい',
      rawAction: {
        capability: 'keyword-research',
        outcome: '検索需要と訴求の方向性を整理する',
        blocker: ['search-intent-unknown'],
        stack: ['chatgpt'],
      },
    })

    expect(matcher.predictedLessonIds[0]).toBe(
      'atom.ai-writer.keyword-research-ai',
    )

    const gap = await realWriters.gap({
      goalId: 'goal-real-writer',
      actionId: 'action-real-writer',
      goldLessonId: 'atom.ai-writer.keyword-research-ai',
      isGap: false,
      predictedLessonIds: matcher.predictedLessonIds,
      goalText: '記事企画のために検索キーワードを調べたい',
      rawAction: {
        capability: 'keyword-research',
        outcome: '検索需要と訴求の方向性を整理する',
        blocker: ['search-intent-unknown'],
        stack: ['chatgpt'],
      },
    })

    expect(typeof gap.isPredictedGap).toBe('boolean')

    const proposer = await realWriters.proposer({
      goalId: 'goal-real-writer',
      actionId: 'action-real-writer',
      isPredictedGap: gap.isPredictedGap,
      expectedPriority: 'high',
      goalText: '記事企画のために検索キーワードを調べたい',
      rawAction: {
        capability: 'keyword-research',
        outcome: '検索需要と訴求の方向性を整理する',
        blocker: ['search-intent-unknown'],
        stack: ['chatgpt'],
      },
    })

    expect(['high', 'mid', 'low', null]).toContain(proposer.predictedPriority)
  })
})

describe('createGpt5MiniJudgeLLM', () => {
  it('throws when JUDGE_REAL_ENABLED is not 1', async () => {
    const { createGpt5MiniJudgeLLM } = await import('../src/llm.js')
    const prevEnabled = process.env.JUDGE_REAL_ENABLED
    const prevKey = process.env.OPENAI_API_KEY
    delete process.env.JUDGE_REAL_ENABLED
    process.env.OPENAI_API_KEY = 'sk-fake'
    try {
      expect(() => createGpt5MiniJudgeLLM()).toThrow(/real judge disabled/i)
    } finally {
      if (prevEnabled !== undefined) process.env.JUDGE_REAL_ENABLED = prevEnabled
      if (prevKey !== undefined) {
        process.env.OPENAI_API_KEY = prevKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })

  it('throws when OPENAI_API_KEY is missing even with JUDGE_REAL_ENABLED=1', async () => {
    const { createGpt5MiniJudgeLLM } = await import('../src/llm.js')
    const prevEnabled = process.env.JUDGE_REAL_ENABLED
    const prevKey = process.env.OPENAI_API_KEY
    process.env.JUDGE_REAL_ENABLED = '1'
    delete process.env.OPENAI_API_KEY
    try {
      expect(() => createGpt5MiniJudgeLLM()).toThrow(/OPENAI_API_KEY/i)
    } finally {
      if (prevEnabled !== undefined) {
        process.env.JUDGE_REAL_ENABLED = prevEnabled
      } else {
        delete process.env.JUDGE_REAL_ENABLED
      }
      if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey
    }
  })

  it('grade() throws "not implemented" when both env gates pass', async () => {
    const { createGpt5MiniJudgeLLM } = await import('../src/llm.js')
    const prevEnabled = process.env.JUDGE_REAL_ENABLED
    const prevKey = process.env.OPENAI_API_KEY
    process.env.JUDGE_REAL_ENABLED = '1'
    process.env.OPENAI_API_KEY = 'sk-fake'
    try {
      const client = createGpt5MiniJudgeLLM()
      await expect(() =>
        client.grade({
          caseId: 'c',
          target: 'matcher',
          system: '',
          user: '',
          schema: { parse: (v: unknown) => v } as never,
        }),
      ).rejects.toThrow(/not implemented/i)
    } finally {
      if (prevEnabled !== undefined) {
        process.env.JUDGE_REAL_ENABLED = prevEnabled
      } else {
        delete process.env.JUDGE_REAL_ENABLED
      }
      if (prevKey !== undefined) {
        process.env.OPENAI_API_KEY = prevKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })
})
