import { describe, expect, it, vi } from 'vitest'

const { createClientMock, getUserMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import {
  OwnerAppMetadataRoleRequiredError,
  requireOwnerRouteUser,
} from './_server'

describe('requireOwnerRouteUser', () => {
  it('returns the user in strict mode when app_metadata.role is owner', async () => {
    const user = {
      id: 'owner-1',
      app_metadata: { role: 'owner' },
      user_metadata: {},
    }

    getUserMock.mockResolvedValue({ data: { user } })
    createClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
      },
    })

    await expect(
      requireOwnerRouteUser({ requireAppMetadataRole: true }),
    ).resolves.toBe(user)
  })

  it('throws in strict mode when the owner role exists only in user_metadata', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'owner-2',
          app_metadata: {},
          user_metadata: { role: 'owner' },
        },
      },
    })
    createClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
      },
    })

    await expect(
      requireOwnerRouteUser({ requireAppMetadataRole: true }),
    ).rejects.toBeInstanceOf(OwnerAppMetadataRoleRequiredError)
  })
})
