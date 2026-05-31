import * as Sentry from '@sentry/nextjs'
import type { Json } from '@/lib/supabase/database.types'
import { captureServerEvent } from '@/lib/analytics/server'
import { createServiceClient } from '@/lib/supabase/service'

export type TelemetryEventName =
  | 'plan_generated'
  | 'lesson_started'
  | 'lesson_completed'
  | 'stuck_reported'
  | 'artifact_submitted'
  | 'evidence_passed'
  | 'plan_revised'
  | 'lesson_skipped'
  | 'unsupported_goal_detected'
  | 'mentor_action_executed'

interface EmitTelemetryEventParams {
  userId: string
  eventName: TelemetryEventName
  atomId?: string | null
  atomVersionId?: string | null
  planId?: string | null
  properties?: Record<string, unknown>
  requestId?: string | null
}

function sanitizeProperties(properties: Record<string, unknown> | undefined): Json {
  try {
    return JSON.parse(JSON.stringify(properties ?? {})) as Json
  } catch {
    return {}
  }
}

/**
 * Server-only telemetry emitter.
 *
 * Do not emit these core lesson events from the client. Client code must call a
 * server API route, and the route must invoke this helper once after the
 * authoritative mutation succeeds.
 */
export async function emitTelemetryEvent({
  userId,
  eventName,
  atomId,
  atomVersionId,
  planId,
  properties,
  requestId,
}: EmitTelemetryEventParams): Promise<void> {
  try {
    const payload = {
      user_id: userId,
      event_name: eventName,
      atom_id: atomId ?? null,
      atom_version_id: atomVersionId ?? null,
      plan_id: planId ?? null,
      properties: sanitizeProperties(properties),
      source: 'server' as const,
      request_id: requestId ?? null,
    }

    Sentry.addBreadcrumb({
      category: 'telemetry',
      level: 'info',
      message: eventName,
      data: {
        user_id: userId,
        atom_id: atomId ?? null,
        atom_version_id: atomVersionId ?? null,
        plan_id: planId ?? null,
        request_id: requestId ?? null,
      },
    })

    const serviceClient = createServiceClient()

    if (serviceClient) {
      void serviceClient
        .from('telemetry_events' as never)
        .insert(payload as never)
        .then(({ error }) => {
          if (error) {
            Sentry.captureException(error, {
              tags: {
                telemetry_event: eventName,
              },
              extra: payload,
            })
          }
        })
    }

    captureServerEvent({
      event: eventName,
      distinctId: userId,
      properties: {
        ...properties,
        atom_id: atomId ?? undefined,
        atom_version_id: atomVersionId ?? undefined,
        plan_id: planId ?? undefined,
        request_id: requestId ?? undefined,
        telemetry_source: 'server',
      },
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        telemetry_event: eventName,
      },
      extra: {
        user_id: userId,
        atom_id: atomId ?? null,
        atom_version_id: atomVersionId ?? null,
        plan_id: planId ?? null,
        request_id: requestId ?? null,
        properties: sanitizeProperties(properties),
      },
    })
  }
}
