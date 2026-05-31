import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { LessonBlock } from '@/types/domain'
import {
  fetchAtomById,
  fetchCurrentAtoms,
  type AtomRecord,
} from '@/lib/atoms/atom-repository'
import {
  buildAtomAliases,
  buildAtomSlugVariants,
  inferAtomDomainSlug,
  resolveAtomLegacyLessonId,
  resolveAtomSlug,
} from '@/lib/atoms/atom-identity'
import { toAtomListViewModel, toAtomViewModel } from '@/lib/atoms/atom-view-model'

type Client = SupabaseClient<Database>

interface Result<T> {
  data: T | null
  error: string | null
}

export interface AtomLessonIdentity {
  id: string
  slug: string
  title: string
  domain_ids: string[]
  created_at: string | null
}

export interface AtomLessonVersion {
  id: string
  lesson_id: string
  status: 'published'
  version: number
  created_at: string | null
}

export interface PublishedLessonSnapshot {
  identity: AtomLessonIdentity
  version: AtomLessonVersion
  blocks: LessonBlock[]
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

async function loadCurrentLessonAtoms() {
  return fetchCurrentAtoms({ minStatus: 'draft', includeBody: false })
}

async function resolveDomainSlugsFromIds(client: Client, domainIds: string[]) {
  const normalizedDomainIds = uniqueNonEmptyStrings(domainIds)

  if (normalizedDomainIds.length === 0) {
    return []
  }

  try {
    const { data, error } = await client
      .from('domains' as never)
      .select('id, slug')
      .in('id', normalizedDomainIds)

    if (error || !data) {
      return []
    }

    return uniqueNonEmptyStrings(
      (data as Array<{ slug: string | null }>).map((row) => row.slug),
    )
  } catch {
    return []
  }
}

function buildAtomIdentity(atom: AtomRecord): AtomLessonIdentity {
  const domainSlug = inferAtomDomainSlug(atom)

  return {
    id: atom.atomId,
    slug: resolveAtomSlug(atom),
    title: atom.title,
    domain_ids: domainSlug ? [domainSlug] : [],
    created_at: null,
  }
}

function buildAtomBlocks(atom: AtomRecord): LessonBlock[] {
  const atomViewModel = toAtomViewModel(atom)
  const blocks: LessonBlock[] = [
    {
      id: `${atom.atomId}-summary`,
      lesson_version_id: atom.versionId,
      type: 'markdown',
      sort_order: 0,
      content: {
        role: 'summary',
        text: atomViewModel.summary,
      },
      created_at: '',
    },
  ]

  atomViewModel.sections.forEach((section, index) => {
    const type =
      section.id === 'why'
        ? 'callout'
        : section.id === 'confirm'
          ? 'rubric'
          : 'markdown'

    const content =
      section.id === 'why'
        ? {
            variant: 'why',
            text: section.markdown,
          }
        : section.id === 'confirm'
          ? {
              criteria: [
                {
                  label: section.title,
                  description: section.markdown,
                },
              ],
            }
          : {
              role: section.id === 'other' ? 'body' : section.id,
              text: section.markdown,
            }

    blocks.push({
      id: `${atom.atomId}-${section.id}-${index + 1}`,
      lesson_version_id: atom.versionId,
      type,
      sort_order: index + 1,
      content,
      created_at: '',
    })
  })

  return blocks
}

function findAtomByAlias(atoms: Awaited<ReturnType<typeof loadCurrentLessonAtoms>>, lessonIdOrSlug: string) {
  const normalized = lessonIdOrSlug.trim()

  if (!normalized) {
    return null
  }

  return atoms.find((atom) => buildAtomAliases(atom).includes(normalized) || buildAtomAliases(atom).includes(normalized.toLowerCase())) ?? null
}

export function buildCanonicalLessonSlugVariants(lessonIdOrSlug: string): string[] {
  return buildAtomSlugVariants(lessonIdOrSlug)
}

export async function resolveLessonIdentityId(params: {
  client: Client
  lessonIdOrSlug: string
}): Promise<Result<string>> {
  void params.client
  const normalized = params.lessonIdOrSlug.trim()

  if (!normalized) {
    return { data: null, error: 'invalid_lesson_id' }
  }

  const directAtom = await fetchAtomById(normalized)
  if (directAtom) {
    return { data: directAtom.atomId, error: null }
  }

  const atoms = await loadCurrentLessonAtoms()
  const matchedAtom = findAtomByAlias(atoms, normalized)

  return { data: matchedAtom?.atomId ?? null, error: null }
}

export async function resolveLessonTitlesByIds(params: {
  client: Client
  lessonIds: string[]
}): Promise<Result<Map<string, string>>> {
  void params.client
  const lessonIds = uniqueNonEmptyStrings(params.lessonIds)
  const titleByLessonId = new Map<string, string>()

  if (lessonIds.length === 0) {
    return { data: titleByLessonId, error: null }
  }

  const atoms = await loadCurrentLessonAtoms()

  for (const lessonId of lessonIds) {
    const matchedAtom =
      atoms.find((atom) => atom.atomId === lessonId) ??
      findAtomByAlias(atoms, lessonId)

    if (matchedAtom) {
      titleByLessonId.set(lessonId, matchedAtom.title)
    }
  }

  return { data: titleByLessonId, error: null }
}

export async function resolveLessonIdentitySlugs(params: {
  client: Client
  lessonIdsOrSlugs: string[]
}): Promise<Result<Record<string, string>>> {
  void params.client
  const normalized = uniqueNonEmptyStrings(params.lessonIdsOrSlugs)
  const result: Record<string, string> = {}

  if (normalized.length === 0) {
    return { data: result, error: null }
  }

  const atoms = await loadCurrentLessonAtoms()

  for (const value of normalized) {
    const matchedAtom =
      atoms.find((atom) => atom.atomId === value) ??
      findAtomByAlias(atoms, value)

    if (matchedAtom) {
      result[value] = resolveAtomSlug(matchedAtom)
      continue
    }

    result[value] = value
  }

  return { data: result, error: null }
}

export async function getPublishedLessonSnapshotBySlug(params: {
  client: Client
  slug: string
}): Promise<Result<PublishedLessonSnapshot>> {
  void params.client
  const resolvedId = await resolveLessonIdentityId({
    client: params.client,
    lessonIdOrSlug: params.slug,
  })

  if (!resolvedId.data) {
    return { data: null, error: resolvedId.error }
  }

  const atom = await fetchAtomById(resolvedId.data)

  if (!atom) {
    return { data: null, error: null }
  }

  return {
    data: {
      identity: buildAtomIdentity(atom),
      version: {
        id: atom.versionId,
        lesson_id: atom.atomId,
        status: 'published',
        version: 1,
        created_at: null,
      },
      blocks: buildAtomBlocks(atom),
    },
    error: null,
  }
}

export async function searchLessons(params: {
  client: Client
  domainIds?: string[]
  query?: string
  limit?: number
}): Promise<Result<AtomLessonIdentity[]>> {
  const atoms = await loadCurrentLessonAtoms()
  const domainSlugs = await resolveDomainSlugsFromIds(params.client, params.domainIds ?? [])
  const query = params.query?.trim().toLowerCase() ?? ''
  const limit = params.limit ?? 20

  const filtered = atoms.filter((atom) => {
    const atomDomainSlug = inferAtomDomainSlug(atom)
    const atomListViewModel = toAtomListViewModel(atom)

    if (domainSlugs.length > 0 && (!atomDomainSlug || !domainSlugs.includes(atomDomainSlug))) {
      return false
    }

    if (!query) {
      return true
    }

    const searchText = [
      atom.atomId,
      atom.title,
      resolveAtomSlug(atom),
      atomListViewModel.summary,
      atom.capabilityOutputs.join(' '),
      atom.goalTags.join(' '),
    ].join(' ').toLowerCase()

    return searchText.includes(query)
  })

  return {
    data: filtered.slice(0, limit).map((atom) => buildAtomIdentity(atom)),
    error: null,
  }
}

export async function searchLessonIdentitiesForPlanning(params: {
  client: Client
  domainSlugs?: string[]
  completedLessonIds?: string[]
  limit?: number
}): Promise<Result<Array<{ id: string; slug: string; title: string; capability_slugs: string[] }>>> {
  void params.client
  const atoms = await loadCurrentLessonAtoms()
  const domainSlugs = uniqueNonEmptyStrings(params.domainSlugs ?? [])
  const completedLessonIds = new Set(
    uniqueNonEmptyStrings(params.completedLessonIds ?? []).flatMap((lessonId) => buildAtomSlugVariants(lessonId)),
  )
  const limit = params.limit ?? 20

  const filteredAtoms = atoms.filter((atom) => {
    const aliases = buildAtomAliases(atom)
    const atomDomainSlug = inferAtomDomainSlug(atom)

    if (aliases.some((alias) => completedLessonIds.has(alias.toLowerCase()))) {
      return false
    }

    if (domainSlugs.length > 0) {
      return Boolean(atomDomainSlug && domainSlugs.includes(atomDomainSlug))
    }

    return true
  })

  return {
    data: filteredAtoms.slice(0, limit).map((atom) => ({
      id: atom.atomId,
      slug: resolveAtomSlug(atom),
      title: atom.title,
      capability_slugs: atom.capabilityOutputs,
    })),
    error: null,
  }
}

export async function resolveLegacyLessonId(params: {
  client: Client
  atomId: string
}): Promise<Result<string>> {
  void params.client
  const atom = await fetchAtomById(params.atomId)

  if (!atom) {
    return { data: null, error: null }
  }

  return { data: resolveAtomLegacyLessonId(atom), error: null }
}
