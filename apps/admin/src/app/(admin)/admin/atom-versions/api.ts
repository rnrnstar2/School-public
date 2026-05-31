import 'server-only'

import { cookies } from 'next/headers'

export type AdminAtomVersionStatus =
  | 'draft'
  | 'reviewed'
  | 'experimental'
  | 'stable'
  | 'archived'

export interface AdminAtomSummary {
  atom_id: string
  current_version_id: string | null
  source_path: string
  updated_at: string
}

export interface AdminAtomVersionSummary {
  version_id: string
  atom_id: string
  title: string | null
  status: AdminAtomVersionStatus
  imported_at: string
  imported_by: string
}

export interface AdminAtomVersionListItem extends AdminAtomVersionSummary {
  is_current: boolean
  atom: AdminAtomSummary
  current_active_version: AdminAtomVersionSummary | null
}

export interface AdminAtomVersionDetail {
  version: {
    version_id: string
    atom_id: string
    status: AdminAtomVersionStatus
    yaml_hash: string | null
    yaml_content: Record<string, unknown>
    body_markdown: string | null
    metadata: Record<string, unknown>
    imported_at: string
    imported_by: string
  }
  title: string | null
  atom: AdminAtomSummary
  current_active_version: AdminAtomVersionSummary | null
  comparison_version: AdminAtomVersionSummary | null
  comparison_basis: 'current_active' | 'previous_active' | 'none'
  diff_text: string
}

export interface AdminAtomVersionPatchInput {
  action: 'promote' | 'rollback' | 'archive'
  target_status?: 'reviewed' | 'experimental' | 'stable'
}

function resolveWebAppBaseUrl() {
  const explicitUrl =
    process.env.WEB_APP_URL ??
    process.env.NEXT_PUBLIC_WEB_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '')
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://school.vercel.app'
    : 'http://127.0.0.1:3000'
}

async function buildForwardedHeaders() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')

  return cookieHeader ? { cookie: cookieHeader } : {}
}

async function fetchFromWebApi<T>(path: string, init?: RequestInit): Promise<T> {
  const forwardedHeaders = await buildForwardedHeaders()
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  if (forwardedHeaders.cookie) {
    headers.set('cookie', forwardedHeaders.cookie)
  }

  const response = await fetch(`${resolveWebAppBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })

  const json = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json && typeof json.message === 'string'
        ? json.message
        : 'Web API request failed.'
    throw new Error(message)
  }

  return json as T
}

export async function fetchAtomVersions(params: {
  status?: AdminAtomVersionStatus | 'all'
  atomId?: string
  limit?: number
}) {
  const searchParams = new URLSearchParams()

  if (params.status) {
    searchParams.set('status', params.status)
  }

  if (params.atomId) {
    searchParams.set('atom_id', params.atomId)
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const response = await fetchFromWebApi<{
    data: {
      versions: AdminAtomVersionListItem[]
    }
  }>(`/api/admin/atom-versions?${searchParams.toString()}`)

  return response.data.versions
}

export async function fetchAtomVersionDetail(versionId: string) {
  const response = await fetchFromWebApi<{ data: AdminAtomVersionDetail }>(
    `/api/admin/atom-versions/${versionId}`,
  )

  return response.data
}

export async function patchAtomVersion(
  versionId: string,
  payload: AdminAtomVersionPatchInput,
) {
  const response = await fetchFromWebApi<{
    data: {
      atom_id: string
      version_id: string
      action: string
      status: AdminAtomVersionStatus
      current_version_id: string | null
    }
  }>(`/api/admin/atom-versions/${versionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return response.data
}
