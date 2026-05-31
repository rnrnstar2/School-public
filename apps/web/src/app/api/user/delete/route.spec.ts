import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}))

const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

vi.mock('@/lib/api/guard', () => ({
  applyRateLimit: mocks.applyRateLimitMock,
  RL_WRITE: 'RL_WRITE',
}))

vi.mock('@/lib/api/response', () => ({
  jsonResponse: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createAdminClientMock,
}))

type Operation = {
  table: string
  mode: 'select' | 'delete'
  filter: 'eq' | 'in'
  column: string
  value: unknown
}

function createTableBuilder(table: string, operations: Operation[]) {
  let mode: Operation['mode'] = 'select'

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn().mockImplementation(() => {
    mode = 'select'
    return builder
  })
  builder.delete = vi.fn().mockImplementation(() => {
    mode = 'delete'
    return builder
  })
  builder.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
    operations.push({ table, mode, filter: 'eq', column, value })
    return builder
  })
  builder.in = vi.fn().mockImplementation((column: string, value: unknown) => {
    operations.push({ table, mode, filter: 'in', column, value })
    return builder
  })
  builder.then = (
    resolve: (value: { data: Array<{ plan_id: string }>; error: null }) => void,
    reject?: (reason: unknown) => void,
  ) => {
    try {
      if (mode === 'select' && table === 'compiled_plans') {
        resolve({ data: [{ plan_id: 'plan-123' }], error: null })
        return
      }

      resolve({ data: [], error: null })
    } catch (error) {
      reject?.(error)
    }
  }

  return builder
}

const { DELETE } = await import('./route')

describe('DELETE /api/user/delete', () => {
  beforeEach(() => {
    mocks.applyRateLimitMock.mockReset()
    mocks.createClientMock.mockReset()
    mocks.createAdminClientMock.mockReset()

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test'
  })

  afterAll(() => {
    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
    }

    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    }
  })

  it('deletes milestone_progress before compiled_plans during account deletion', async () => {
    const operations: Operation[] = []
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null })

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => createTableBuilder(table, operations)),
    })
    mocks.createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          deleteUser: deleteUserMock,
        },
      },
    })

    const response = await DELETE(
      new Request('http://localhost:3000/api/user/delete', { method: 'DELETE' }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ success: true })
    expect(operations).toContainEqual({
      table: 'task_progress',
      mode: 'delete',
      filter: 'in',
      column: 'plan_id',
      value: ['plan-123'],
    })
    expect(operations).toContainEqual({
      table: 'milestone_progress',
      mode: 'delete',
      filter: 'eq',
      column: 'user_id',
      value: 'user-123',
    })

    const milestoneDeleteIndex = operations.findIndex(
      (operation) => operation.table === 'milestone_progress' && operation.mode === 'delete',
    )
    const compiledPlansDeleteIndex = operations.findIndex(
      (operation) =>
        operation.table === 'compiled_plans' &&
        operation.mode === 'delete' &&
        operation.filter === 'eq',
    )

    expect(milestoneDeleteIndex).toBeGreaterThan(-1)
    expect(compiledPlansDeleteIndex).toBeGreaterThan(milestoneDeleteIndex)
    expect(deleteUserMock).toHaveBeenCalledWith('user-123')
  })

  it('deletes mentor_sessions, mentor_memory_archive, and other PII tables for GDPR erasure', async () => {
    const operations: Operation[] = []
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null })

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => createTableBuilder(table, operations)),
    })
    mocks.createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          deleteUser: deleteUserMock,
        },
      },
    })

    const response = await DELETE(
      new Request('http://localhost:3000/api/user/delete', { method: 'DELETE' }),
    )

    expect(response.status).toBe(200)

    const expectedUserScopedTables = [
      'mentor_sessions',
      'mentor_memory',
      'mentor_memory_archive',
      'ai_response_feedback',
      'goal_history',
      'goals',
      'artifacts',
      'lesson_chat_messages',
      'certificates',
      'compiled_plans',
      'lesson_feedback',
      'user_progress',
      'workspace_snapshots',
      'learner_profile',
      'learner_state',
      'milestone_progress',
    ]

    for (const table of expectedUserScopedTables) {
      expect(operations).toContainEqual({
        table,
        mode: 'delete',
        filter: 'eq',
        column: 'user_id',
        value: 'user-123',
      })
    }
  })

  it('returns 500 with failedTables when any table delete fails (GDPR retry contract)', async () => {
    const operations: Operation[] = []
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'mentor_memory_archive') {
          // Simulate a failure for this one table
          const builder: Record<string, unknown> = {}
          builder.delete = vi.fn().mockImplementation(() => builder)
          builder.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
            operations.push({ table, mode: 'delete', filter: 'eq', column, value })
            return builder
          })
          builder.then = (
            _resolve: (value: { data: unknown; error: unknown }) => void,
            reject: (reason: unknown) => void,
          ) => {
            reject(new Error('simulated table error'))
          }
          return builder
        }
        return createTableBuilder(table, operations)
      }),
    })
    mocks.createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          deleteUser: deleteUserMock,
        },
      },
    })

    const response = await DELETE(
      new Request('http://localhost:3000/api/user/delete', { method: 'DELETE' }),
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({
      error: 'partial_delete',
      failedTables: expect.arrayContaining(['mentor_memory_archive']),
    })
    // Auth user must NOT be deleted when any table delete failed — retry safety.
    expect(deleteUserMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()

    // Other tables should still be attempted (best-effort purge).
    expect(operations.some((op) => op.table === 'learner_profile' && op.mode === 'delete')).toBe(
      true,
    )

    warnSpy.mockRestore()
  })

  it('returns 500 with partial_delete error when a table returns a Supabase error', async () => {
    const operations: Operation[] = []
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    mocks.applyRateLimitMock.mockResolvedValue(null)
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'artifacts') {
          const builder: Record<string, unknown> = {}
          builder.delete = vi.fn().mockImplementation(() => builder)
          builder.eq = vi.fn().mockImplementation((column: string, value: unknown) => {
            operations.push({ table, mode: 'delete', filter: 'eq', column, value })
            return builder
          })
          builder.then = (
            resolve: (value: { data: unknown; error: { message: string } }) => void,
          ) => {
            resolve({ data: null, error: { message: 'RLS denied' } })
          }
          return builder
        }
        return createTableBuilder(table, operations)
      }),
    })
    mocks.createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          deleteUser: deleteUserMock,
        },
      },
    })

    const response = await DELETE(
      new Request('http://localhost:3000/api/user/delete', { method: 'DELETE' }),
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({
      error: 'partial_delete',
      failedTables: expect.arrayContaining(['artifacts']),
    })
    expect(deleteUserMock).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
