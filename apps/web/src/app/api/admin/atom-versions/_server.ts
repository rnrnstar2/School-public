import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

import type {
  AtomVersionListFilters,
  AtomVersionRepository,
  AtomVersionStatus,
  LessonAtomAuditInsert,
  LessonAtomRow,
  LessonAtomVersionRow,
} from './_lib'

interface UntypedSupabaseResult<T> {
  data: T | null
  error: unknown
}

interface UntypedQueryBuilder {
  select: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  in: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  update: (values: Record<string, unknown>) => UntypedQueryBuilder
  insert: (values: Record<string, unknown>) => Promise<UntypedSupabaseResult<Record<string, unknown>>>
  maybeSingle: () => Promise<UntypedSupabaseResult<Record<string, unknown>>>
  then: PromiseLike<UntypedSupabaseResult<Record<string, unknown>[]>>['then']
}

interface UntypedServiceClient {
  from: (table: string) => UntypedQueryBuilder
}

function parseAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminUser(user: User | null) {
  if (!user) {
    return false
  }

  const adminEmails = parseAdminEmails()
  const normalizedEmail = user.email?.toLowerCase()
  const appRole = user.app_metadata?.role
  const userRole = user.user_metadata?.role

  return (
    appRole === 'admin' ||
    userRole === 'admin' ||
    (normalizedEmail ? adminEmails.has(normalizedEmail) : false)
  )
}

export function isOwnerUser(user: User | null) {
  if (!user) {
    return false
  }

  const appRole = user.app_metadata?.role
  const userRole = user.user_metadata?.role

  return appRole === 'owner' || userRole === 'owner'
}

export interface RequireOwnerRouteUserOptions {
  requireAppMetadataRole?: boolean
}

export class OwnerAppMetadataRoleRequiredError extends Error {
  constructor() {
    super('owner app_metadata role required')
    this.name = 'OwnerAppMetadataRoleRequiredError'
  }
}

export async function requireAdminRouteUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user && isAdminUser(user) ? user : null
}

export async function requireOwnerRouteUser(
  options: RequireOwnerRouteUserOptions = {},
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isOwnerUser(user)) {
    return null
  }

  if (options.requireAppMetadataRole && user.app_metadata?.role !== 'owner') {
    throw new OwnerAppMetadataRoleRequiredError()
  }

  return user
}

function normalizeAtomRow(row: Record<string, unknown>): LessonAtomRow {
  return {
    atom_id: String(row.atom_id ?? ''),
    current_version_id:
      typeof row.current_version_id === 'string' ? row.current_version_id : null,
    source_path: String(row.source_path ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function normalizeVersionRow(row: Record<string, unknown>): LessonAtomVersionRow {
  return {
    version_id: String(row.version_id ?? ''),
    atom_id: String(row.atom_id ?? ''),
    status: String(row.status ?? 'draft') as AtomVersionStatus,
    yaml_hash: typeof row.yaml_hash === 'string' ? row.yaml_hash : null,
    yaml_content:
      row.yaml_content && typeof row.yaml_content === 'object' && !Array.isArray(row.yaml_content)
        ? (row.yaml_content as Record<string, unknown>)
        : {},
    body_markdown: typeof row.body_markdown === 'string' ? row.body_markdown : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    imported_at: String(row.imported_at ?? ''),
    imported_by: typeof row.imported_by === 'string' ? row.imported_by : 'unknown',
  }
}

function ensureServiceClient() {
  const client = createServiceClient()

  if (!client) {
    throw new Error('Service client not available.')
  }

  return client as unknown as UntypedServiceClient
}

export function createAtomVersionRepository(): AtomVersionRepository {
  const client = ensureServiceClient()

  return {
    async listVersions(filters: AtomVersionListFilters) {
      let query = client
        .from('lesson_atom_versions')
        .select(
          'version_id, atom_id, status, yaml_hash, yaml_content, body_markdown, metadata, imported_at, imported_by',
        )
        .order('imported_at', { ascending: false })

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters.atomId) {
        query = query.eq('atom_id', filters.atomId)
      }

      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      const { data, error } = await query

      if (error) {
        throw error
      }

      return Array.isArray(data)
        ? data.map((row: Record<string, unknown>) => normalizeVersionRow(row))
        : []
    },

    async getVersionById(versionId: string) {
      const { data, error } = await client
        .from('lesson_atom_versions')
        .select(
          'version_id, atom_id, status, yaml_hash, yaml_content, body_markdown, metadata, imported_at, imported_by',
        )
        .eq('version_id', versionId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data ? normalizeVersionRow(data) : null
    },

    async getAtomById(atomId: string) {
      const { data, error } = await client
        .from('lesson_atoms')
        .select('atom_id, current_version_id, source_path, updated_at')
        .eq('atom_id', atomId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data ? normalizeAtomRow(data) : null
    },

    async listAtomsByIds(atomIds: string[]) {
      if (atomIds.length === 0) {
        return []
      }

      const { data, error } = await client
        .from('lesson_atoms')
        .select('atom_id, current_version_id, source_path, updated_at')
        .in('atom_id', atomIds)

      if (error) {
        throw error
      }

      return Array.isArray(data)
        ? data.map((row: Record<string, unknown>) => normalizeAtomRow(row))
        : []
    },

    async listVersionsByAtomId(atomId: string) {
      const { data, error } = await client
        .from('lesson_atom_versions')
        .select(
          'version_id, atom_id, status, yaml_hash, yaml_content, body_markdown, metadata, imported_at, imported_by',
        )
        .eq('atom_id', atomId)
        .order('imported_at', { ascending: false })

      if (error) {
        throw error
      }

      return Array.isArray(data)
        ? data.map((row: Record<string, unknown>) => normalizeVersionRow(row))
        : []
    },

    async updateVersionStatus(versionId: string, status: AtomVersionStatus) {
      const { error } = await client
        .from('lesson_atom_versions')
        .update({ status })
        .eq('version_id', versionId)

      if (error) {
        throw error
      }
    },

    async updateAtomCurrentVersion(atomId: string, currentVersionId: string | null) {
      const { error } = await client
        .from('lesson_atoms')
        .update({ current_version_id: currentVersionId })
        .eq('atom_id', atomId)

      if (error) {
        throw error
      }
    },

    async insertAudit(entry: LessonAtomAuditInsert) {
      const { error } = await client.from('lesson_atom_audit').insert(entry as never)

      if (error) {
        throw error
      }
    },
  }
}
