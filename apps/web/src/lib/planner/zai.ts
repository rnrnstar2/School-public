const DEFAULT_ZAI_CODING_PLAN_ENDPOINT = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
export const DEFAULT_ZAI_MODEL = 'glm-5.1'

export type ZaiStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
      role?: string
    }
    finish_reason?: string | null
  }>
}

function normalizeZaiEndpoint(endpoint: string) {
  return endpoint.includes('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`
}

export function getExternalPlannerConfig() {
  const configuredEndpoint =
    process.env.ZAI_CODING_PLAN_API_URL?.trim() ||
    process.env.ZAI_PLANNER_API_URL?.trim()
  const apiKey = process.env.ZAI_PLANNER_API_KEY?.trim() || process.env.ZAI_API_KEY?.trim()
  const endpoint = configuredEndpoint ? normalizeZaiEndpoint(configuredEndpoint) : apiKey ? DEFAULT_ZAI_CODING_PLAN_ENDPOINT : null
  const model = process.env.ZAI_PLANNER_MODEL?.trim() || DEFAULT_ZAI_MODEL

  if (!endpoint) {
    return {
      available: false as const,
      reason:
        'ZAI の API キーが未設定です。`ZAI_PLANNER_API_KEY` または従来の `ZAI_API_KEY` を設定してください。',
    }
  }

  if (!apiKey) {
    return {
      available: false as const,
      reason: 'ZAI_PLANNER_API_URL はありますが API キーがありません。`ZAI_PLANNER_API_KEY` または `ZAI_API_KEY` が必要です。',
      endpoint,
      model,
    }
  }

  return { available: true as const, endpoint, apiKey, model }
}
