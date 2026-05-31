import { MockPlannerAdapter } from '@/lib/planner/adapters/mock-planner'
import { ZaiPlannerAdapter, type PlannerStreamEvent } from '@/lib/planner/adapters/zai-planner'
import type { PlannerAdapter, PlannerRequest } from '@/lib/planner/types'
import { getExternalPlannerConfig } from '@/lib/planner/zai'

async function buildLocalPlannerResult(
  request: PlannerRequest,
  message: string,
  status: 'fallback' | 'unavailable' = 'fallback'
) {
  const result = await new MockPlannerAdapter().plan(request)

  return {
    ...result,
    adapter: {
      ...result.adapter,
      status,
      message,
    },
  }
}

export function getPlannerAdapter(): PlannerAdapter {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    return new MockPlannerAdapter()
  }

  return new ZaiPlannerAdapter(externalConfig)
}

export async function generatePlan(request: PlannerRequest) {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    return buildLocalPlannerResult(request, externalConfig.reason, 'unavailable')
  }

  try {
    return await new ZaiPlannerAdapter(externalConfig).plan(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ZAI API request failed.'
    return buildLocalPlannerResult(
      request,
      `ZAI API を試しましたが利用できなかったため、ローカル提案へ切り替えました。詳細: ${message}`
    )
  }
}

export async function generatePlanStream(
  request: PlannerRequest,
  onEvent?: (event: PlannerStreamEvent) => void
) {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    const result = await buildLocalPlannerResult(request, externalConfig.reason, 'unavailable')
    onEvent?.({
      type: 'text-delta',
      text: result.recommendation.supportMessage || result.adapter.message,
    })
    return result
  }

  try {
    return await new ZaiPlannerAdapter(externalConfig).planStream(request, onEvent)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ZAI API request failed.'
    const result = await buildLocalPlannerResult(
      request,
      `ZAI API を試しましたが利用できなかったため、ローカル提案へ切り替えました。詳細: ${message}`
    )
    onEvent?.({
      type: 'text-delta',
      text: result.recommendation.supportMessage || result.adapter.message,
    })
    return result
  }
}
