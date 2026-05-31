'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminUser } from '@/lib/admin-auth'

import { patchAtomVersion, type AdminAtomVersionPatchInput } from '../api'

export interface AtomVersionActionResult {
  ok: boolean
  error?: string
}

export async function mutateAtomVersionAction(
  versionId: string,
  payload: AdminAtomVersionPatchInput,
): Promise<AtomVersionActionResult> {
  try {
    await requireAdminUser()
    await patchAtomVersion(versionId, payload)

    revalidatePath('/admin/atom-versions')
    revalidatePath(`/admin/atom-versions/${versionId}`)

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update atom version.',
    }
  }
}
