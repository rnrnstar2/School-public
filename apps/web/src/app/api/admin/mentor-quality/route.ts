/**
 * TQ-238: Owner-facing mentor-quality dashboard data API.
 *
 * Returns the aggregated snapshot derived from `decision_ledger.agent_runs`
 * and `decision_ledger.evaluation_runs`. Admin auth is required (the data
 * spans every learner). This route mirrors the page loader so external
 * tooling (or a future client-side refresh) can consume the same shape.
 */

import { jsonResponse } from '@/lib/api/response'
import {
  loadMentorQualitySnapshot,
  createSupabaseMentorQualityRepository,
  SERVICE_CLIENT_UNAVAILABLE,
} from '@/lib/admin/mentor-quality-loader'

import { requireAdminRouteUser } from '../atom-versions/_server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await requireAdminRouteUser()

  if (!user) {
    return jsonResponse(
      {
        error: 'forbidden',
        message: 'Admin role is required.',
      },
      { status: 403 },
      request,
    )
  }

  try {
    const repository = createSupabaseMentorQualityRepository()
    const snapshot = await loadMentorQualitySnapshot(repository)

    return jsonResponse(
      {
        data: snapshot,
      },
      undefined,
      request,
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Mentor-quality snapshot failed.'

    if (message === SERVICE_CLIENT_UNAVAILABLE) {
      return jsonResponse(
        {
          error: 'service_unavailable',
          message,
        },
        { status: 503 },
        request,
      )
    }

    console.error('[admin][mentor-quality][get]', error)
    return jsonResponse(
      {
        error: 'mentor_quality_load_failed',
        message: 'Failed to load mentor-quality snapshot.',
      },
      { status: 500 },
      request,
    )
  }
}
