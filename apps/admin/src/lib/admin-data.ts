import 'server-only'

import { cache } from 'react'

import { createAdminClient } from '@/lib/supabase/service'

interface DashboardLatestAtomVersionRow {
  status: string | null
  metadata: Record<string, unknown> | null
}

interface DashboardLatestAtomRow {
  atom_id: string
  updated_at: string
  current_version_id: string | null
  lesson_atom_versions:
    | DashboardLatestAtomVersionRow
    | DashboardLatestAtomVersionRow[]
    | null
}

function resolveDashboardLatestAtomVersion(row: DashboardLatestAtomRow) {
  if (Array.isArray(row.lesson_atom_versions)) {
    return row.lesson_atom_versions[0] ?? null
  }

  return row.lesson_atom_versions
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item)).filter(Boolean)
}

export const getDashboardData = cache(async () => {
  try {
    const supabase = createAdminClient()

    const [atomsCount, versionsCount, personasCount, anchorsCount] = await Promise.all([
      supabase
        .from('lesson_atoms')
        .select('atom_id', { count: 'exact', head: true })
        .not('current_version_id', 'is', null),
      supabase.from('lesson_atom_versions').select('version_id', { count: 'exact', head: true }),
      supabase.from('personas').select('persona_id', { count: 'exact', head: true }),
      supabase.from('lesson_anchors').select('anchor_id', { count: 'exact', head: true }),
    ])

    const countError =
      atomsCount.error ?? versionsCount.error ?? personasCount.error ?? anchorsCount.error

    if (countError) {
      throw countError
    }

    const { data: latest, error: latestError } = await supabase
      .from('lesson_atoms')
      .select(
        'atom_id, updated_at, current_version_id, lesson_atom_versions!lesson_atoms_current_version_id_fkey(status, metadata)',
      )
      .not('current_version_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(4)

    if (latestError) {
      throw latestError
    }

    return {
      stats: {
        atoms: atomsCount.count ?? 0,
        versions: versionsCount.count ?? 0,
        personas: personasCount.count ?? 0,
        anchors: anchorsCount.count ?? 0,
      },
      latestAtoms: ((latest ?? []) as DashboardLatestAtomRow[]).map((row) => {
        const currentVersion = resolveDashboardLatestAtomVersion(row)
        const title = currentVersion?.metadata?.title

        return {
          atomId: row.atom_id,
          updatedAt: row.updated_at,
          title: typeof title === 'string' && title.length > 0 ? title : row.atom_id,
          status: currentVersion?.status ?? 'unknown',
        }
      }),
    }
  } catch (err) {
    console.error(
      'Failed to load dashboard data',
      err instanceof Error ? err.stack : err,
    )
    throw err
  }
})

export interface AdminLessonAtom {
  atom_id: string
  source_path: string
  updated_at: string
  current_version: {
    status: string | null
    imported_at: string | null
  } | null
  capabilities: Array<{
    capability: string
    direction: string
  }>
}

export interface AdminPersona {
  persona_id: string
  source_path: string
  updated_at: string
  current_version: {
    imported_at: string | null
  } | null
}

export interface AdminLessonAnchor {
  anchor_id: string
  persona_id: string
  ordered_atom_ids: string[]
  required_capabilities: string[]
  description: string | null
}

export interface AdminImprovementProposalListItem {
  proposal_id: string
  generated_at: string
  summary: string
  delivered_at: string | null
  delivery_channel: 'discord' | 'email' | null
  acknowledged: boolean
  finding_count: number
}

export interface AdminImprovementProposalFinding {
  finding_id: string
  finding_type: 'confusion' | 'freshness' | 'gap'
  atom_id: string | null
  persona_id: string | null
  capability: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'reported' | 'dismissed' | 'addressed'
}

export interface AdminImprovementProposalDetail
  extends AdminImprovementProposalListItem {
  detailed_markdown: string
  findings: AdminImprovementProposalFinding[]
}

export const getLessonAtoms = cache(async (): Promise<AdminLessonAtom[]> => {
  const supabase = createAdminClient()
  const { data: atoms, error } = await supabase
    .from('lesson_atoms')
    .select('atom_id, source_path, current_version_id, updated_at')
    .order('updated_at', { ascending: false })
    .order('atom_id')

  if (error) {
    throw error
  }

  const atomRows = (atoms ?? []) as Array<{
    atom_id: string
    source_path: string
    current_version_id: string | null
    updated_at: string
  }>
  const versionIds = Array.from(
    new Set(atomRows.map((atom) => atom.current_version_id).filter(Boolean)),
  ) as string[]
  const atomIds = atomRows.map((atom) => atom.atom_id)

  const [versionsResult, capabilitiesResult] = await Promise.all([
    versionIds.length > 0
      ? supabase
          .from('lesson_atom_versions')
          .select('version_id, status, imported_at')
          .in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    atomIds.length > 0
      ? supabase
          .from('lesson_atom_capabilities')
          .select('atom_id, capability, direction')
          .in('atom_id', atomIds)
          .order('capability')
      : Promise.resolve({ data: [], error: null }),
  ])

  if (versionsResult.error) {
    throw versionsResult.error
  }

  if (capabilitiesResult.error) {
    throw capabilitiesResult.error
  }

  const versionById = new Map(
    ((versionsResult.data ?? []) as Array<{
      version_id: string
      status: string | null
      imported_at: string | null
    }>).map((version) => [version.version_id, version]),
  )
  const capabilitiesByAtomId = new Map<string, Array<{ capability: string; direction: string }>>()

  for (const capability of (capabilitiesResult.data ?? []) as Array<{
    atom_id: string
    capability: string
    direction: string
  }>) {
    const current = capabilitiesByAtomId.get(capability.atom_id) ?? []
    current.push({
      capability: capability.capability,
      direction: capability.direction,
    })
    capabilitiesByAtomId.set(capability.atom_id, current)
  }

  return atomRows.map((atom) => ({
    atom_id: atom.atom_id,
    source_path: atom.source_path,
    updated_at: atom.updated_at,
    current_version: atom.current_version_id
      ? versionById.get(atom.current_version_id) ?? null
      : null,
    capabilities: capabilitiesByAtomId.get(atom.atom_id) ?? [],
  }))
})

export const getPersonas = cache(async (): Promise<AdminPersona[]> => {
  const supabase = createAdminClient()
  const { data: personas, error } = await supabase
    .from('personas')
    .select('persona_id, source_path, current_version_id, updated_at')
    .order('updated_at', { ascending: false })
    .order('persona_id')

  if (error) {
    throw error
  }

  const personaRows = (personas ?? []) as Array<{
    persona_id: string
    source_path: string
    current_version_id: string | null
    updated_at: string
  }>
  const versionIds = Array.from(
    new Set(personaRows.map((persona) => persona.current_version_id).filter(Boolean)),
  ) as string[]

  const versionsResult = versionIds.length > 0
    ? await supabase
        .from('persona_versions')
        .select('version_id, imported_at')
        .in('version_id', versionIds)
    : { data: [], error: null }

  if (versionsResult.error) {
    throw versionsResult.error
  }

  const versionById = new Map(
    ((versionsResult.data ?? []) as Array<{
      version_id: string
      imported_at: string | null
    }>).map((version) => [version.version_id, version]),
  )

  return personaRows.map((persona) => ({
    persona_id: persona.persona_id,
    source_path: persona.source_path,
    updated_at: persona.updated_at,
    current_version: persona.current_version_id
      ? versionById.get(persona.current_version_id) ?? null
      : null,
  }))
})

export const getLessonAnchors = cache(async (): Promise<AdminLessonAnchor[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lesson_anchors')
    .select('anchor_id, persona_id, ordered_atom_ids, required_capabilities, description')
    .order('anchor_id')

  if (error) {
    throw error
  }

  return ((data ?? []) as Array<{
    anchor_id: string
    persona_id: string
    ordered_atom_ids: unknown
    required_capabilities: unknown
    description: string | null
  }>).map((anchor) => ({
    anchor_id: anchor.anchor_id,
    persona_id: anchor.persona_id,
    ordered_atom_ids: toStringArray(anchor.ordered_atom_ids),
    required_capabilities: toStringArray(anchor.required_capabilities),
    description: anchor.description,
  }))
})

export const getImprovementProposals = cache(async (
  filter: 'all' | 'acknowledged' | 'unacknowledged',
): Promise<AdminImprovementProposalListItem[]> => {
  const supabase = createAdminClient()
  let query = supabase
    .from('improvement_proposals')
    .select(
      'proposal_id, generated_at, summary, delivered_at, delivery_channel, acknowledged, finding_ids',
    )
    .order('generated_at', { ascending: false })

  if (filter === 'acknowledged') {
    query = query.eq('acknowledged', true)
  }

  if (filter === 'unacknowledged') {
    query = query.eq('acknowledged', false)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return ((data ?? []) as Array<{
    proposal_id: string
    generated_at: string
    summary: string
    delivered_at: string | null
    delivery_channel: 'discord' | 'email' | null
    acknowledged: boolean
    finding_ids: unknown
  }>).map((proposal) => ({
    proposal_id: proposal.proposal_id,
    generated_at: proposal.generated_at,
    summary: proposal.summary,
    delivered_at: proposal.delivered_at,
    delivery_channel: proposal.delivery_channel,
    acknowledged: proposal.acknowledged,
    finding_count: toStringArray(proposal.finding_ids).length,
  }))
})

export const getImprovementProposalById = cache(async (
  proposalId: string,
): Promise<AdminImprovementProposalDetail | null> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('improvement_proposals')
    .select(
      'proposal_id, generated_at, summary, detailed_markdown, delivered_at, delivery_channel, acknowledged, finding_ids',
    )
    .eq('proposal_id', proposalId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const findingIds = toStringArray(data.finding_ids)
  const base = {
    proposal_id: String(data.proposal_id),
    generated_at: String(data.generated_at),
    summary: String(data.summary),
    detailed_markdown: String(data.detailed_markdown),
    delivered_at: typeof data.delivered_at === 'string' ? data.delivered_at : null,
    delivery_channel:
      data.delivery_channel === 'email' || data.delivery_channel === 'discord'
        ? data.delivery_channel
        : null,
    acknowledged: Boolean(data.acknowledged),
    finding_count: findingIds.length,
  }

  if (findingIds.length === 0) {
    return {
      ...base,
      findings: [],
    }
  }

  const findingsResult = await supabase
    .from('improvement_findings')
    .select(
      'finding_id, finding_type, atom_id, persona_id, capability, severity, status',
    )
    .in('finding_id', findingIds)

  if (findingsResult.error) {
    throw findingsResult.error
  }

  const findingById = new Map(
    ((findingsResult.data ?? []) as Array<AdminImprovementProposalFinding>).map((finding) => [
      finding.finding_id,
      finding,
    ]),
  )

  return {
    ...base,
    findings: findingIds
      .map((findingId) => findingById.get(findingId))
      .filter(
        (finding): finding is AdminImprovementProposalFinding => Boolean(finding),
      ),
  }
})
