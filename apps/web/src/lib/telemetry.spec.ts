import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  captureServerEventMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/analytics/server', () => ({
  captureServerEvent: mocks.captureServerEventMock,
}))

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mocks.addBreadcrumbMock,
  captureException: mocks.captureExceptionMock,
}))

describe('emitTelemetryEvent', () => {
  beforeEach(() => {
    mocks.createServiceClientMock.mockReset()
    mocks.captureServerEventMock.mockReset()
    mocks.addBreadcrumbMock.mockReset()
    mocks.captureExceptionMock.mockReset()
  })

  it.each([
    'plan_generated',
    'lesson_started',
    'lesson_completed',
    'stuck_reported',
    'artifact_submitted',
    'evidence_passed',
    'plan_revised',
    'lesson_skipped',
    'unsupported_goal_detected',
  ] as const)('writes %s to telemetry_events and PostHog', async (eventName) => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const fromMock = vi.fn().mockReturnValue({
      insert: insertMock,
    })

    mocks.createServiceClientMock.mockReturnValue({
      from: fromMock,
    })

    const { emitTelemetryEvent } = await import('./telemetry')

    await emitTelemetryEvent({
      userId: 'user-123',
      eventName,
      planId: 'plan-123',
      properties: {
        lesson_id: 'lesson-001',
      },
      requestId: 'req-123',
    })

    expect(fromMock).toHaveBeenCalledWith('telemetry_events')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        event_name: eventName,
        plan_id: 'plan-123',
        source: 'server',
        request_id: 'req-123',
      }),
    )
    expect(mocks.captureServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: eventName,
        distinctId: 'user-123',
      }),
    )
    expect(mocks.addBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'telemetry',
        message: eventName,
      }),
    )
    expect(mocks.captureExceptionMock).not.toHaveBeenCalled()
  })
})
