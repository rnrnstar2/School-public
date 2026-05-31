import { z } from 'zod/v4'

import type { JudgeLLM } from '../llm'
import { JudgeVerdictSchema, type JudgeVerdict } from '../schema'

export interface ProposerJudgeCase {
  caseId: string
  goalId: string
  actionId: string
  /** Gold `expectedProposalPriority` from expected-gaps.jsonl. */
  expectedPriority: 'high' | 'mid' | 'low'
  /** Priority emitted by the Proposer for this action, or null if no proposal. */
  predictedPriority: 'high' | 'mid' | 'low' | null
}

export interface ProposerJudgeResult {
  verdict: JudgeVerdict
  /** 1 if predictedPriority === expectedPriority, else 0. */
  agreement: number
}

const FakeVerdictResponseSchema = z
  .object({
    score: z.number().min(0).max(10),
    verdict: z.enum(['pass', 'fail']),
    failReasons: z.array(z.string()).default([]),
  })
  .strict()

function buildPrompt(input: ProposerJudgeCase): { system: string; user: string } {
  const system =
    'You are a judge evaluating a proposal-priority assignment. Grade ' +
    'whether the predicted priority matches the expected priority. Reply ' +
    'with score 0..10 and verdict "pass"/"fail".'
  const user = JSON.stringify({
    action_id: input.actionId,
    goal_id: input.goalId,
    expected_priority: input.expectedPriority,
    predicted_priority: input.predictedPriority,
  })
  return { system, user }
}

export async function judgeProposer(
  input: ProposerJudgeCase,
  judgeLLM: JudgeLLM,
): Promise<ProposerJudgeResult> {
  const { system, user } = buildPrompt(input)

  const response = await judgeLLM.grade({
    caseId: input.caseId,
    target: 'proposer',
    system,
    user,
    schema: FakeVerdictResponseSchema,
  })

  const agreement = input.predictedPriority === input.expectedPriority ? 1 : 0

  const verdict: JudgeVerdict = JudgeVerdictSchema.parse({
    caseId: input.caseId,
    target: 'proposer',
    score: response.score,
    verdict: response.verdict,
    failReasons: response.failReasons ?? [],
    details: {
      expectedPriority: input.expectedPriority,
      predictedPriority: input.predictedPriority,
      agreement,
    },
  })

  return { verdict, agreement }
}
