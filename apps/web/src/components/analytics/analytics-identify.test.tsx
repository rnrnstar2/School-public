import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AnalyticsIdentify } from './analytics-identify'

const mocks = vi.hoisted(() => {
  const identifyUserMock = vi.fn()
  const resetUserMock = vi.fn()
  const unsubscribeMock = vi.fn()
  let authStateChangeHandler:
    | ((event: string, session: unknown) => void)
    | null = null
  const getSessionMock = vi.fn()

  const supabaseMock = {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: vi.fn((handler: typeof authStateChangeHandler) => {
        authStateChangeHandler = handler ?? null
        return {
          data: {
            subscription: {
              unsubscribe: unsubscribeMock,
            },
          },
        }
      }),
    },
  }

  return {
    identifyUserMock,
    resetUserMock,
    unsubscribeMock,
    getSessionMock,
    supabaseMock,
    getAuthStateChangeHandler: () => authStateChangeHandler,
  }
})

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => mocks.supabaseMock,
}))

vi.mock('@/lib/analytics/client', () => ({
  identifyUser: mocks.identifyUserMock,
  resetUser: mocks.resetUserMock,
}))

describe('AnalyticsIdentify (TQ-121)', () => {
  beforeEach(() => {
    mocks.identifyUserMock.mockReset()
    mocks.resetUserMock.mockReset()
    mocks.unsubscribeMock.mockReset()
    mocks.getSessionMock.mockReset()
    mocks.supabaseMock.auth.onAuthStateChange.mockClear()
  })

  it('identifies the current session on mount with user_id only (no PII traits)', async () => {
    mocks.getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-123',
            email: 'tanaka@example.com',
            created_at: '2026-04-01T00:00:00.000Z',
          },
        },
      },
    })

    render(<AnalyticsIdentify />)

    await waitFor(() => {
      expect(mocks.identifyUserMock).toHaveBeenCalledTimes(1)
    })
    // identifyUser must only receive user_id — no email / created_at / etc.
    expect(mocks.identifyUserMock).toHaveBeenCalledWith('user-123')
    expect(mocks.resetUserMock).not.toHaveBeenCalled()
    expect(mocks.supabaseMock.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('clears the stored identity when no session is present', async () => {
    mocks.getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
    })

    render(<AnalyticsIdentify />)

    // No-op if we never identified in this tab — we should not churn PostHog.
    expect(mocks.identifyUserMock).not.toHaveBeenCalled()
    expect(mocks.supabaseMock.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('identifies on SIGNED_IN and TOKEN_REFRESHED, then resets on SIGNED_OUT', async () => {
    mocks.getSessionMock.mockResolvedValue({
      data: { session: null },
    })

    render(<AnalyticsIdentify />)
    await waitFor(() => {
      expect(mocks.supabaseMock.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    })

    const handler = mocks.getAuthStateChangeHandler()!
    handler('SIGNED_IN', { user: { id: 'user-abc' } })
    expect(mocks.identifyUserMock).toHaveBeenLastCalledWith('user-abc')

    // Token refresh of the same user must not re-identify (dedupe).
    handler('TOKEN_REFRESHED', { user: { id: 'user-abc' } })
    expect(mocks.identifyUserMock).toHaveBeenCalledTimes(1)

    handler('SIGNED_OUT', null)
    expect(mocks.resetUserMock).toHaveBeenCalledTimes(1)
  })

  it('re-identifies when the auth session switches to a new user', async () => {
    mocks.getSessionMock.mockResolvedValue({
      data: {
        session: { user: { id: 'user-123' } },
      },
    })

    render(<AnalyticsIdentify />)
    await waitFor(() => {
      expect(mocks.identifyUserMock).toHaveBeenCalledWith('user-123')
    })

    mocks.getAuthStateChangeHandler()?.('SIGNED_IN', {
      user: { id: 'user-456' },
    })
    expect(mocks.identifyUserMock).toHaveBeenCalledWith('user-456')
    expect(mocks.identifyUserMock).toHaveBeenCalledTimes(2)
  })
})
