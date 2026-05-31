import type { z } from 'zod/v4'

/**
 * JudgeLLM is the abstraction the judge runner uses to grade writer output.
 *
 * `mode: 'fake'` must be deterministic — same caseId + same prompt must always
 * produce the same response. This is what CI relies on.
 *
 * `mode: 'real'` is where the production GPT-5 mini client plugs in. This TQ
 * ships only the stub; `createGpt5MiniJudgeLLM` throws unless env gates are
 * explicitly set, so CI cannot accidentally bill an API key.
 */
export interface JudgeLLM {
  readonly mode: 'fake' | 'real'
  readonly name: string
  grade(input: {
    caseId: string
    target: 'matcher' | 'gap' | 'proposer'
    system: string
    user: string
    schema: z.ZodSchema<unknown>
  }): Promise<FakeVerdictRecord>
}

export interface FakeVerdictRecord {
  score: number
  verdict: 'pass' | 'fail'
  failReasons?: string[]
  notes?: string
}

export type FakeVerdictFixture = Record<
  string,
  FakeVerdictRecord | undefined
>

export interface CreateFakeJudgeLLMOptions {
  fixture: FakeVerdictFixture
  /**
   * Key derivation used to look a record up from `fixture`.
   * Defaults to `${target}:${caseId}` so fixtures can discriminate per judge.
   */
  keyFor?: (input: { caseId: string; target: 'matcher' | 'gap' | 'proposer' }) => string
  /**
   * Fallback record used when `fixture` does not cover a given key.
   * Defaults to a passing record with score 10 — i.e. fake LLM trusts the
   * writer by default. Tests pass a stricter fallback when they want to
   * observe failures.
   */
  fallback?: FakeVerdictRecord
}

const DEFAULT_FALLBACK: FakeVerdictRecord = {
  score: 10,
  verdict: 'pass',
  failReasons: [],
  notes: 'fixture_missing_fallback',
}

function defaultKeyFor(input: { caseId: string; target: 'matcher' | 'gap' | 'proposer' }) {
  return `${input.target}:${input.caseId}`
}

export function createFakeJudgeLLM(options: CreateFakeJudgeLLMOptions): JudgeLLM {
  const fixture = options.fixture
  const keyFor = options.keyFor ?? defaultKeyFor
  const fallback = options.fallback ?? DEFAULT_FALLBACK

  return {
    mode: 'fake',
    name: 'judge_fake_v0',
    async grade({ caseId, target }) {
      const key = keyFor({ caseId, target })
      const hit = fixture[key] ?? fixture[caseId]
      const record = hit ?? fallback
      return {
        score: record.score,
        verdict: record.verdict,
        failReasons: record.failReasons ?? [],
        notes: record.notes,
      }
    },
  }
}

export interface CreateGpt5MiniJudgeLLMOptions {
  apiKey?: string
  model?: string
}

/**
 * Real GPT-5 mini judge client — **not wired** in this TQ.
 *
 * The real network path is intentionally behind two env gates so CI cannot
 * trigger a billed API call by accident:
 *   - `JUDGE_REAL_ENABLED=1`  — explicit opt-in from the operator
 *   - `OPENAI_API_KEY`        — credentials must be set in the environment
 *
 * If either is missing, construction throws. If both are present, the stub
 * throws with a descriptive "not implemented" error so we have a clean seam
 * for a follow-up TQ to implement the real client.
 */
export function createGpt5MiniJudgeLLM(
  options: CreateGpt5MiniJudgeLLMOptions = {},
): JudgeLLM {
  const envEnabled = process.env.JUDGE_REAL_ENABLED === '1'
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY

  if (!envEnabled) {
    throw new Error(
      'real judge disabled: set JUDGE_REAL_ENABLED=1 to enable the GPT-5 mini client',
    )
  }
  if (!apiKey) {
    throw new Error(
      'real judge disabled: OPENAI_API_KEY must be set (or passed explicitly)',
    )
  }

  const model = options.model ?? 'gpt-5-mini'

  return {
    mode: 'real',
    name: `judge_gpt_5_mini_v0:${model}`,
    async grade() {
      throw new Error(
        'createGpt5MiniJudgeLLM: real network path not implemented in TQ-139; wire in a follow-up PR',
      )
    },
  }
}
