import type { NextAction } from './types'

export interface BuildBridgeQuestionInput {
  goalText: string
  lessonTitle: string
  experienceSummary?: string | null
}

export function buildBridgeQuestion({
  goalText,
  lessonTitle,
  experienceSummary,
}: BuildBridgeQuestionInput): string | undefined {
  void experienceSummary

  const normalizedGoalText = goalText.trim()
  const normalizedLessonTitle = lessonTitle.trim()

  if (!normalizedGoalText || !normalizedLessonTitle) {
    return undefined
  }

  return `「${normalizedGoalText}」を達成するために、「${normalizedLessonTitle}」ではどんな問いが解けますか?`
}

export function attachBridgeQuestionToNextAction(
  nextAction: NextAction,
  input: Pick<BuildBridgeQuestionInput, 'goalText' | 'experienceSummary'>,
): NextAction {
  const { bridgeQuestion: existingBridgeQuestion, ...baseAction } = nextAction
  void existingBridgeQuestion

  if (nextAction.type !== 'lesson') {
    return baseAction
  }

  const bridgeQuestion = buildBridgeQuestion({
    goalText: input.goalText,
    lessonTitle: nextAction.message,
    experienceSummary: input.experienceSummary,
  })

  if (!bridgeQuestion) {
    return baseAction
  }

  return {
    ...baseAction,
    bridgeQuestion,
  }
}
