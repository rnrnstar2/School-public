import { z } from 'zod/v4'

import { jsonResponse } from '@/lib/api/response'

import {
  AtomVersionActionError,
  PROMOTABLE_ATOM_VERSION_STATUSES,
  getAtomVersionDetail,
  mutateAtomVersion,
} from '../_lib'
import { createAtomVersionRepository, requireAdminRouteUser } from '../_server'

export const dynamic = 'force-dynamic'

const patchBodySchema = z.object({
  action: z.enum(['promote', 'rollback', 'archive']),
  target_status: z.enum(PROMOTABLE_ATOM_VERSION_STATUSES).optional(),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
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
    const { versionId } = await context.params
    const repository = createAtomVersionRepository()
    const detail = await getAtomVersionDetail(repository, versionId)

    return jsonResponse({ data: detail }, undefined, request)
  } catch (error) {
    if (error instanceof AtomVersionActionError) {
      return jsonResponse(
        { error: error.code, message: error.message },
        { status: error.statusCode },
        request,
      )
    }

    console.error('[admin][atom-versions][detail]', error)
    return jsonResponse(
      {
        error: 'atom_version_detail_failed',
        message: 'Failed to load atom version detail.',
      },
      { status: 500 },
      request,
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
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

  let rawBody: unknown

  try {
    rawBody = await request.json()
  } catch {
    return jsonResponse(
      {
        error: 'invalid_json',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 },
      request,
    )
  }

  const parsedBody = patchBodySchema.safeParse(rawBody)

  if (!parsedBody.success) {
    return jsonResponse(
      {
        error: 'validation_error',
        message: 'Invalid atom version action payload.',
        details: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
      request,
    )
  }

  try {
    const { versionId } = await context.params
    const repository = createAtomVersionRepository()
    const result = await mutateAtomVersion(repository, user.id, versionId, {
      action: parsedBody.data.action,
      targetStatus: parsedBody.data.target_status,
    })

    return jsonResponse({ data: result }, undefined, request)
  } catch (error) {
    if (error instanceof AtomVersionActionError) {
      return jsonResponse(
        { error: error.code, message: error.message },
        { status: error.statusCode },
        request,
      )
    }

    console.error('[admin][atom-versions][patch]', error)
    return jsonResponse(
      {
        error: 'atom_version_mutation_failed',
        message: 'Failed to update atom version.',
      },
      { status: 500 },
      request,
    )
  }
}
