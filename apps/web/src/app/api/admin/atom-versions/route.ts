import { z } from 'zod/v4'

import { jsonResponse } from '@/lib/api/response'

import { ATOM_VERSION_STATUSES, listAtomVersions } from './_lib'
import { createAtomVersionRepository, requireAdminRouteUser } from './_server'

export const dynamic = 'force-dynamic'

const statusSchema = z.enum([...ATOM_VERSION_STATUSES, 'all'])

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

  const searchParams = new URL(request.url).searchParams
  const statusResult = statusSchema.safeParse(searchParams.get('status') ?? 'all')
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50

  if (!statusResult.success) {
    return jsonResponse(
      {
        error: 'invalid_status',
        message: 'status must be one of draft, reviewed, experimental, stable, archived, or all.',
      },
      { status: 400 },
      request,
    )
  }

  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    return jsonResponse(
      {
        error: 'invalid_limit',
        message: 'limit must be between 1 and 200.',
      },
      { status: 400 },
      request,
    )
  }

  try {
    const repository = createAtomVersionRepository()
    const versions = await listAtomVersions(repository, {
      status: statusResult.data,
      atomId: searchParams.get('atom_id')?.trim() || undefined,
      limit,
    })

    return jsonResponse(
      {
        data: {
          versions,
          filters: {
            status: statusResult.data,
            atom_id: searchParams.get('atom_id')?.trim() || null,
            limit,
          },
        },
      },
      undefined,
      request,
    )
  } catch (error) {
    console.error('[admin][atom-versions][list]', error)
    return jsonResponse(
      {
        error: 'atom_versions_list_failed',
        message: 'Failed to load atom versions.',
      },
      { status: 500 },
      request,
    )
  }
}
