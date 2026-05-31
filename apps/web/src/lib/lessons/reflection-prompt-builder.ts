export interface BuildReflectionPromptInput {
  atomPrompt: string
  blockers?: string[] | null
  recentFeedback?: string | null
}

function firstNonEmptyBlocker(blockers: string[] | null | undefined) {
  if (!blockers) {
    return null
  }

  for (const blocker of blockers) {
    const normalized = blocker.trim()
    if (normalized) {
      return normalized
    }
  }

  return null
}

function normalizeFeedback(feedback: string | null | undefined) {
  const normalized = feedback?.trim()
  return normalized ? normalized : null
}

export function buildReflectionPrompt({
  atomPrompt,
  blockers,
  recentFeedback,
}: BuildReflectionPromptInput) {
  const blocker = firstNonEmptyBlocker(blockers)
  const feedback = normalizeFeedback(recentFeedback)

  if (blocker) {
    const personalizedPrompt = `〈${blocker}〉を踏まえて、${atomPrompt}`
    return feedback
      ? `${personalizedPrompt}\n\n直近のフィードバック「${feedback}」も手がかりに振り返ってみましょう。`
      : personalizedPrompt
  }

  if (feedback) {
    return `直近のフィードバック「${feedback}」も踏まえて、${atomPrompt}`
  }

  return atomPrompt
}
