import { z } from 'zod/v4'

import type { JudgeLLM } from '../llm'
import { JudgeVerdictSchema, type JudgeVerdict } from '../schema'

export interface MatcherJudgeCase {
  caseId: string
  goalId: string
  actionId: string
  /** Gold lesson id from `expected-lessons.jsonl` (null when the action is a gap). */
  goldLessonId: string | null
  /** Whether the dataset marks this action as a gap (no gold lesson id). */
  isGap: boolean
  /**
   * Top-k lesson ids returned by the Matcher, ordered by rank (best first).
   * The judge uses up to 3 for precision/recall@3.
   */
  predictedLessonIds: string[]
}

export interface MatcherJudgeResult {
  verdict: JudgeVerdict
  /** 1 if goldLessonId found in top-3, 0 otherwise; null when case is a gap. */
  recallAt3: number | null
  /** 1 if top-1 matches gold; 0 otherwise; null when case is a gap. */
  precision: number | null
}

const FakeVerdictResponseSchema = z
  .object({
    score: z.number().min(0).max(10),
    verdict: z.enum(['pass', 'fail']),
    failReasons: z.array(z.string()).default([]),
  })
  .strict()

function buildPrompt(input: MatcherJudgeCase): { system: string; user: string } {
  const system =
    'You are a judge evaluating a lesson-matcher. Grade whether its top-3 ' +
    'predictions cover the gold lesson for the given action. Reply with a ' +
    'score in [0, 10] and a verdict of "pass" or "fail".'
  const user = JSON.stringify({
    action_id: input.actionId,
    goal_id: input.goalId,
    gold_lesson_id: input.goldLessonId,
    is_gap: input.isGap,
    predicted_lesson_ids: input.predictedLessonIds.slice(0, 3),
  })
  return { system, user }
}

export async function judgeMatcher(
  input: MatcherJudgeCase,
  judgeLLM: JudgeLLM,
): Promise<MatcherJudgeResult> {
  const { system, user } = buildPrompt(input)

  const top3 = input.predictedLessonIds.slice(0, 3)
  const goldId = input.goldLessonId

  const response = await judgeLLM.grade({
    caseId: input.caseId,
    target: 'matcher',
    system,
    user,
    schema: FakeVerdictResponseSchema,
  })

  const recallAt3 = input.isGap || goldId === null
    ? null
    : top3.includes(goldId)
      ? 1
      : 0

  const precision = input.isGap || goldId === null
    ? null
    : top3[0] === goldId
      ? 1
      : 0

  const verdict: JudgeVerdict = JudgeVerdictSchema.parse({
    caseId: input.caseId,
    target: 'matcher',
    score: response.score,
    verdict: response.verdict,
    failReasons: response.failReasons ?? [],
    details: {
      goldLessonId: goldId,
      predictedTop3: top3,
      isGap: input.isGap,
      precision,
      recallAt3,
    },
  })

  return { verdict, recallAt3, precision }
}
