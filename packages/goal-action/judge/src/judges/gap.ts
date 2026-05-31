import { z } from 'zod/v4'

import type { JudgeLLM } from '../llm'
import { JudgeVerdictSchema, type JudgeVerdict } from '../schema'

export interface GapJudgeCase {
  caseId: string
  goalId: string
  actionId: string
  /** Whether the gold dataset marks this action as a gap. */
  isGoldGap: boolean
  /** Whether the Gap Detector flagged this action. */
  isPredictedGap: boolean
}

export interface GapJudgeResult {
  verdict: JudgeVerdict
  /** True positive (gold=gap, predicted=gap). */
  truePositive: number
  /** False positive (gold=not-gap, predicted=gap). */
  falsePositive: number
  /** False negative (gold=gap, predicted=not-gap). */
  falseNegative: number
  /** True negative (gold=not-gap, predicted=not-gap). */
  trueNegative: number
}

const FakeVerdictResponseSchema = z
  .object({
    score: z.number().min(0).max(10),
    verdict: z.enum(['pass', 'fail']),
    failReasons: z.array(z.string()).default([]),
  })
  .strict()

function buildPrompt(input: GapJudgeCase): { system: string; user: string } {
  const system =
    'You are a judge evaluating a missing-lesson detector. Decide whether ' +
    'its gap flag agrees with the gold label. Reply with score 0..10 and ' +
    'verdict "pass"/"fail".'
  const user = JSON.stringify({
    action_id: input.actionId,
    goal_id: input.goalId,
    gold_is_gap: input.isGoldGap,
    predicted_is_gap: input.isPredictedGap,
  })
  return { system, user }
}

export async function judgeGap(
  input: GapJudgeCase,
  judgeLLM: JudgeLLM,
): Promise<GapJudgeResult> {
  const { system, user } = buildPrompt(input)

  const response = await judgeLLM.grade({
    caseId: input.caseId,
    target: 'gap',
    system,
    user,
    schema: FakeVerdictResponseSchema,
  })

  const truePositive = input.isGoldGap && input.isPredictedGap ? 1 : 0
  const falsePositive = !input.isGoldGap && input.isPredictedGap ? 1 : 0
  const falseNegative = input.isGoldGap && !input.isPredictedGap ? 1 : 0
  const trueNegative = !input.isGoldGap && !input.isPredictedGap ? 1 : 0

  const verdict: JudgeVerdict = JudgeVerdictSchema.parse({
    caseId: input.caseId,
    target: 'gap',
    score: response.score,
    verdict: response.verdict,
    failReasons: response.failReasons ?? [],
    details: {
      isGoldGap: input.isGoldGap,
      isPredictedGap: input.isPredictedGap,
      truePositive,
      falsePositive,
      falseNegative,
      trueNegative,
    },
  })

  return {
    verdict,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
  }
}
