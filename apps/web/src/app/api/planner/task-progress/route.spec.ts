import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  upsertTaskProgressMock: vi.fn(),
  getLatestActiveCompiledPlanMock: vi.fn(),
  emitTelemetryEventMock: vi.fn(),
  captureServerEventMock: vi.fn(),
}))

vi.mock('@/lib/api/guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/guard')>('@/lib/api/guard')
  return {
    ...actual,
    applyRateLimit: mocks.applyRateLimitMock,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/supabase/task-progress', () => ({
  getTaskProgressByPlan: vi.fn(),
  upsertTaskProgress: mocks.upsertTaskProgressMock,
}))

vi.mock('@/lib/compiled-plans', () => ({
  getLatestActiveCompiledPlan: mocks.getLatestActiveCompiledPlanMock,
}))

vi.mock('@/lib/telemetry', () => ({
  emitTelemetryEvent: mocks.emitTelemetryEventMock,
}))

vi.mock('@/lib/analytics/server', () => ({
  captureServerEvent: mocks.captureServerEventMock,
}))

describe('POST /api/planner/task-progress', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
    })
    mocks.upsertTaskProgressMock.mockResolvedValue({
      data: {
        plan_id: 'plan-123',
        task_id: 'task-1',
        status: 'in-progress',
        title: '保存したタイトル',
        do_text: '実装する',
        learn_text: '学ぶ',
        why_text: '理由',
        relevant_lesson_ids: ['lesson-1'],
        started_at: null,
        completed_at: null,
        elapsed_minutes: null,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
        id: 'row-1',
      },
      error: null,
    })
  })

  it('forwards title to task progress upsert', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost:3000/api/planner/task-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'plan-123',
          taskId: 'task-1',
          status: 'in-progress',
          title: '保存したタイトル',
          doText: '実装する',
          learnText: '学ぶ',
          whyText: '理由',
          relevantLessonIds: ['lesson-1'],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.upsertTaskProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-123',
        taskId: 'task-1',
        status: 'in-progress',
        title: '保存したタイトル',
      }),
    )
  }, 15000)
})
