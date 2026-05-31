import { createServiceClient } from '@/lib/supabase/service'
import { createPublicReadClient } from '@/lib/supabase/public-read'
import { getSupabaseErrorMessage } from '@/lib/supabase/query-fallback'
import { expandPersonaSlugsToTags } from '@/lib/personas/persona-tag-bridge'

export type AtomCapability = {
  capability: string
  direction: 'input' | 'output'
}

export type AtomPrerequisite = {
  prerequisiteAtomId: string
  strength: 'hard' | 'soft'
}

export interface AtomRecord {
  atomId: string
  versionId: string
  status: 'draft' | 'reviewed' | 'experimental' | 'stable' | 'archived'
  yamlContent: Record<string, unknown>
  bodyMarkdown: string | null
  metadata: Record<string, unknown>
  title: string
  personaTags: string[]
  goalTags: string[]
  capabilityInputs: string[]
  capabilityOutputs: string[]
  hardPrerequisites: string[]
  softPrerequisites: string[]
  estimatedMinutes: number | null
  deliverable: { type: string; validation: string }
  evidence: string[]
  mediaSlots: string[]
}

export interface PersonaAnchorRecord {
  anchorId: string
  personaId: string
  orderedAtomIds: string[]
  requiredCapabilities: string[]
  description: string | null
}

const STATUS_RANK: Record<Exclude<AtomRecord['status'], 'archived'>, number> = {
  draft: 0,
  reviewed: 1,
  experimental: 2,
  stable: 3,
}
const TRANSIENT_ATOM_READ_RETRY_DELAYS_MS = [1000, 2000, 4000]
type AtomReadErrorLike =
  | {
      message?: string | null
      details?: string | null
      hint?: string | null
      code?: string | null
    }
  | string
  | null
  | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toDeliverable(value: unknown): { type: string; validation: string } {
  const record = toRecord(value)
  return {
    type: typeof record.type === 'string' ? record.type : '',
    validation: typeof record.validation === 'string' ? record.validation : '',
  }
}

function buildAtomRecord(params: {
  atomId: string
  version: {
    version_id: string
    status: AtomRecord['status']
    yaml_content: unknown
    body_markdown?: string | null
    metadata: unknown
  }
  capabilities: AtomCapability[]
  prerequisites: AtomPrerequisite[]
}): AtomRecord {
  const yamlContent = toRecord(params.version.yaml_content)
  const capabilityInputs = params.capabilities
    .filter((entry) => entry.direction === 'input')
    .map((entry) => entry.capability)
  const capabilityOutputs = params.capabilities
    .filter((entry) => entry.direction === 'output')
    .map((entry) => entry.capability)
  const hardPrerequisites = params.prerequisites
    .filter((entry) => entry.strength === 'hard')
    .map((entry) => entry.prerequisiteAtomId)
  const softPrerequisites = params.prerequisites
    .filter((entry) => entry.strength === 'soft')
    .map((entry) => entry.prerequisiteAtomId)

  return {
    atomId: params.atomId,
    versionId: params.version.version_id,
    status: params.version.status,
    yamlContent,
    bodyMarkdown: params.version.body_markdown ?? null,
    metadata: toRecord(params.version.metadata),
    title: typeof yamlContent.title === 'string' ? yamlContent.title : params.atomId,
    personaTags: toStringArray(yamlContent.persona_tags),
    goalTags: toStringArray(yamlContent.goal_tags),
    capabilityInputs,
    capabilityOutputs,
    hardPrerequisites,
    softPrerequisites,
    estimatedMinutes: toNullableNumber(yamlContent.estimated_minutes),
    deliverable: toDeliverable(yamlContent.deliverable),
    evidence: toStringArray(yamlContent.evidence),
    mediaSlots: toStringArray(yamlContent.media_slots),
  }
}

function normalizeMinStatus(minStatus: Exclude<AtomRecord['status'], 'archived'> | undefined) {
  return minStatus ?? 'reviewed'
}

function statusMatchesMin(
  status: AtomRecord['status'],
  minStatus: Exclude<AtomRecord['status'], 'archived'>,
) {
  if (status === 'archived') {
    return false
  }

  return STATUS_RANK[status] >= STATUS_RANK[minStatus]
}

function hasTag(tags: string[], tag: string | undefined) {
  if (!tag) {
    return true
  }

  return tags.includes(tag)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientAtomReadError(error: AtomReadErrorLike) {
  const message = getSupabaseErrorMessage(error)
  if (!message) {
    return false
  }

  return (
    message.includes('schema cache') ||
    message.includes('DatabaseSchemaMismatch') ||
    message.includes('fetch failed') ||
    message.includes('Failed to fetch') ||
    message.includes('ECONNREFUSED')
  )
}

/**
 * Load options accepted by `loadCurrentAtomRows` / `fetchCurrentAtoms`.
 *
 * These exist so callers can narrow the underlying query scope at the DB
 * layer (push-down filtering) instead of materializing the full atom graph
 * and filtering in JS. Defaults remain backward compatible — omitting opts
 * yields the same rows as before.
 */
export interface AtomLoadOptions {
  /** Restrict to these atom IDs. Equivalent to a `.in('atom_id', ids)` filter. */
  atomIds?: string[]
  /** Hard row cap applied at the DB layer. Useful for paginated views. */
  limit?: number
  /**
   * Skip selecting `body_markdown` for a smaller payload. The returned
   * records will have `bodyMarkdown: null`. Use this only for list views
   * that build summaries through `toAtomListViewModel`; detail, planner,
   * and embedding paths should keep the default body payload.
   */
  includeBody?: boolean
}

async function loadCurrentAtomRows(options?: AtomLoadOptions, attempt = 0): Promise<AtomRecord[]> {
  const client = createPublicReadClient()

  if (!client) {
    return []
  }

  const atomIds = options?.atomIds
  const limit = options?.limit
  const includeBody = options?.includeBody ?? true

  let atomsQuery = client
    .from('lesson_atoms')
    .select('atom_id, current_version_id')
    .not('current_version_id', 'is', null)

  if (atomIds && atomIds.length > 0) {
    atomsQuery = atomsQuery.in('atom_id', atomIds)
  }

  if (typeof limit === 'number' && limit > 0) {
    atomsQuery = atomsQuery.limit(limit)
  }

  const { data: atomRows, error: atomError } = await atomsQuery

  if (atomError) {
    if (isTransientAtomReadError(atomError) && attempt < TRANSIENT_ATOM_READ_RETRY_DELAYS_MS.length) {
      const delay = TRANSIENT_ATOM_READ_RETRY_DELAYS_MS[attempt]
      console.warn(
        `[atom-repository] transient lesson_atoms read failed (${getSupabaseErrorMessage(atomError)}); ` +
          `retrying in ${delay}ms`,
      )
      await sleep(delay)
      return loadCurrentAtomRows(options, attempt + 1)
    }
    return []
  }

  if (!atomRows || atomRows.length === 0) {
    return []
  }

  const typedAtoms = (atomRows as Array<{
    atom_id: string
    current_version_id: string | null
  }>).filter((row) => typeof row.current_version_id === 'string')

  const versionIds = typedAtoms.map((row) => row.current_version_id as string)
  if (versionIds.length === 0) {
    return []
  }

  const atomIdsForRelations = typedAtoms.map((row) => row.atom_id)

  const versionSelect = includeBody
    ? 'version_id, atom_id, status, yaml_content, body_markdown, metadata'
    : 'version_id, atom_id, status, yaml_content, metadata'

  // Chunk .in() queries so the GET URL stays within undici's header size
  // limits (~16KB). With 576 atoms × 36-char UUIDs, a single request blows
  // past ~20KB and throws HeadersOverflowError, returning 0 rows silently.
  const IN_CHUNK = 100

  const boundClient = client
  async function chunkedIn<Row>(
    table: 'lesson_atom_versions' | 'lesson_atom_capabilities' | 'lesson_atom_prerequisites',
    selectCols: string,
    column: string,
    ids: string[],
  ): Promise<{ data: Row[] | null; error: unknown }> {
    if (ids.length === 0) return { data: [], error: null }
    const slices: string[][] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      slices.push(ids.slice(i, i + IN_CHUNK))
    }

    const settled = await Promise.all(
      slices.map((slice) =>
        boundClient
          .from(table)
          .select(selectCols)
          .in(column, slice),
      ),
    )

    const firstError = settled.find((result) => result.error)?.error
    if (firstError) return { data: null, error: firstError }

    const rows = settled.flatMap((result) => (result.data ?? []) as unknown as Row[])
    return { data: rows, error: null }
  }

  const [
    { data: versionRows, error: versionError },
    { data: capabilityRows, error: capabilityError },
    { data: prerequisiteRows, error: prerequisiteError },
  ] = await Promise.all([
    chunkedIn<{ version_id: string; atom_id: string; status: AtomRecord['status']; yaml_content: unknown; body_markdown?: string | null; metadata: unknown }>(
      'lesson_atom_versions', versionSelect, 'version_id', versionIds,
    ),
    chunkedIn<{ atom_id: string; capability: string; direction: AtomCapability['direction'] }>(
      'lesson_atom_capabilities', 'atom_id, capability, direction', 'atom_id', atomIdsForRelations,
    ),
    chunkedIn<{ atom_id: string; prerequisite_atom_id: string; strength: AtomPrerequisite['strength'] }>(
      'lesson_atom_prerequisites', 'atom_id, prerequisite_atom_id, strength', 'atom_id', atomIdsForRelations,
    ),
  ])

  const transientError = [versionError, capabilityError, prerequisiteError].find((error) =>
    isTransientAtomReadError(error as AtomReadErrorLike),
  ) as AtomReadErrorLike
  if (transientError && attempt < TRANSIENT_ATOM_READ_RETRY_DELAYS_MS.length) {
    const delay = TRANSIENT_ATOM_READ_RETRY_DELAYS_MS[attempt]
    console.warn(
      `[atom-repository] transient atom graph read failed (${getSupabaseErrorMessage(transientError)}); ` +
        `retrying in ${delay}ms`,
    )
    await sleep(delay)
    return loadCurrentAtomRows(options, attempt + 1)
  }

  if (versionError || capabilityError || prerequisiteError || !versionRows) {
    return []
  }

  const capabilitiesByAtomId = new Map<string, AtomCapability[]>()
  for (const row of (capabilityRows ?? []) as Array<{
    atom_id: string
    capability: string
    direction: AtomCapability['direction']
  }>) {
    const current = capabilitiesByAtomId.get(row.atom_id) ?? []
    current.push({
      capability: row.capability,
      direction: row.direction,
    })
    capabilitiesByAtomId.set(row.atom_id, current)
  }

  const prerequisitesByAtomId = new Map<string, AtomPrerequisite[]>()
  for (const row of (prerequisiteRows ?? []) as Array<{
    atom_id: string
    prerequisite_atom_id: string
    strength: AtomPrerequisite['strength']
  }>) {
    const current = prerequisitesByAtomId.get(row.atom_id) ?? []
    current.push({
      prerequisiteAtomId: row.prerequisite_atom_id,
      strength: row.strength,
    })
    prerequisitesByAtomId.set(row.atom_id, current)
  }

  // NOTE: `versionSelect` is a runtime-computed string (because of the
  // `includeBody` branch above), which breaks Supabase's typed-row
  // inference — the returned rows come back as the generic catch-all shape
  // and TypeScript can't prove which columns are present. We intentionally
  // cast through `unknown` here rather than duplicate the whole query
  // pipeline for the body/no-body cases. The trade-off is a tiny, localized
  // loss of compile-time safety on exactly these six fields; behavior is
  // guarded by the `includeBody` default (true) and the `buildAtomRecord`
  // consumer treats `body_markdown` as optional.
  const versionsById = new Map(
    (versionRows as unknown as Array<{
      version_id: string
      atom_id: string
      status: AtomRecord['status']
      yaml_content: unknown
      body_markdown?: string | null
      metadata: unknown
    }>).map((row) => [row.version_id, row]),
  )

  return typedAtoms.flatMap((row) => {
    const version = versionsById.get(row.current_version_id as string)

    if (!version) {
      return []
    }

    return [
      buildAtomRecord({
        atomId: row.atom_id,
        version,
        capabilities: capabilitiesByAtomId.get(row.atom_id) ?? [],
        prerequisites: prerequisitesByAtomId.get(row.atom_id) ?? [],
      }),
    ]
  })
}

export interface FetchCurrentAtomsOptions extends AtomLoadOptions {
  minStatus?: 'draft' | 'reviewed' | 'experimental' | 'stable'
  personaTag?: string
  goalTag?: string
}

/**
 * Fetch the current atom graph, optionally scoped down via DB-level filters
 * (`atomIds`, `limit`) or payload trimming (`includeBody`). The tag / status
 * filters still run in JS because persona/goal tags live inside the
 * `yaml_content` JSONB blob; pushing them to SQL would require a dedicated
 * index. Pass `atomIds` whenever you already know the slice you need — it
 * turns a full-graph scan into a point lookup.
 */
export async function fetchCurrentAtoms(
  opts?: FetchCurrentAtomsOptions,
): Promise<AtomRecord[]> {
  const atoms = await loadCurrentAtomRows({
    atomIds: opts?.atomIds,
    limit: opts?.limit,
    includeBody: opts?.includeBody,
  })
  const minStatus = normalizeMinStatus(opts?.minStatus)

  return atoms.filter((atom) =>
    statusMatchesMin(atom.status, minStatus) &&
    hasTag(atom.personaTags, opts?.personaTag) &&
    hasTag(atom.goalTags, opts?.goalTag),
  )
}

/**
 * Server-side filter spec accepted by the `/lessons` SSR page (W56). Keeps
 * the URL surface stable: `?q=&persona=&track=&contentType=&status=&limit=`.
 *
 * - `track` is intentionally aliased to `goalTag` because tracks ARE goals
 *   in the lesson model (no separate track field exists on atoms).
 * - `contentType` matches against `mediaSlots`/`evidence` substrings (e.g.
 *   `video` selects atoms whose evidence/media slots reference video).
 * - `q` is a tokenized substring search over title/summary/atomId/tags.
 *
 * The default `limit` (50) is applied by the caller, not here, so callers
 * that genuinely need everything can opt out by passing `limit: undefined`.
 */
export interface AtomListFilterSpec {
  q?: string
  persona?: string
  track?: string
  contentType?: string
  status?: 'all' | AtomRecord['status']
  limit?: number
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function matchesAtomQuery(atom: AtomRecord, listSummary: string, query: string): boolean {
  const tokens = tokenize(query)
  if (tokens.length === 0) return true

  const haystack = [
    atom.atomId,
    atom.title,
    listSummary,
    atom.personaTags.join(' '),
    atom.goalTags.join(' '),
    atom.capabilityOutputs.join(' '),
  ]
    .join(' ')
    .toLowerCase()

  return tokens.every((token) => haystack.includes(token))
}

function matchesContentType(atom: AtomRecord, contentType: string): boolean {
  const needle = contentType.trim().toLowerCase()
  if (!needle) return true

  const haystack = [...atom.mediaSlots, ...atom.evidence, atom.deliverable.type]
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
}

/**
 * Apply the `/lessons` SSR filter spec to an already-loaded atom array.
 * Returns a NEW array, in original order, with at most `limit` entries.
 *
 * Exposed separately from `fetchCurrentAtoms` so SSR pages can compose
 * status (DB / repo level) + display filters (page level) without
 * round-tripping the underlying `lesson_atoms` graph.
 *
 * @param atoms - the already-fetched atom records
 * @param filter - filter spec from `searchParams`
 * @param resolveSummary - optional callback used by `q` search to include
 *   the atom's user-facing summary in the haystack. When omitted, search
 *   falls back to the title + tags only.
 */
export function applyAtomListFilters(
  atoms: AtomRecord[],
  filter: AtomListFilterSpec,
  resolveSummary?: (atom: AtomRecord) => string,
): AtomRecord[] {
  const filtered = atoms.filter((atom) => {
    if (filter.status && filter.status !== 'all' && atom.status !== filter.status) {
      return false
    }

    if (filter.persona && !atom.personaTags.includes(filter.persona)) {
      return false
    }

    // `track` aliases to goalTag — see AtomListFilterSpec docs.
    if (filter.track && !atom.goalTags.includes(filter.track)) {
      return false
    }

    if (filter.contentType && !matchesContentType(atom, filter.contentType)) {
      return false
    }

    if (filter.q) {
      const summary = resolveSummary?.(atom) ?? ''
      if (!matchesAtomQuery(atom, summary, filter.q)) {
        return false
      }
    }

    return true
  })

  if (typeof filter.limit === 'number' && filter.limit > 0) {
    return filtered.slice(0, filter.limit)
  }

  return filtered
}

/**
 * Parse a raw Next.js `searchParams` object into an `AtomListFilterSpec`.
 * Accepts either the raw `Record<string, string | string[] | undefined>`
 * shape or a pre-flattened `Record<string, string>`. Unknown keys are
 * ignored; values are trimmed; empty strings become undefined.
 */
export function parseAtomListSearchParams(
  raw: Record<string, string | string[] | undefined> | undefined,
  defaults?: { limit?: number },
): AtomListFilterSpec {
  const pick = (key: string): string | undefined => {
    const value = raw?.[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0)
      return typeof first === 'string' ? first.trim() : undefined
    }
    return undefined
  }

  const status = pick('status')
  const allowedStatus: AtomListFilterSpec['status'] | undefined =
    status === 'all' ||
    status === 'draft' ||
    status === 'reviewed' ||
    status === 'experimental' ||
    status === 'stable' ||
    status === 'archived'
      ? status
      : undefined

  const limitRaw = pick('limit')
  let limit: number | undefined = defaults?.limit
  if (limitRaw !== undefined) {
    const parsed = Number.parseInt(limitRaw, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      // Cap at 1000 to keep payload bounded even with `?limit=99999`.
      limit = Math.min(parsed, 1000)
    }
  }

  return {
    q: pick('q'),
    persona: pick('persona'),
    track: pick('track'),
    contentType: pick('contentType'),
    status: allowedStatus,
    limit,
  }
}

export async function fetchAtomById(atomId: string): Promise<AtomRecord | null> {
  const [atom] = await loadCurrentAtomRows({ atomIds: [atomId] })
  return atom ?? null
}

/**
 * Batch equivalent of `fetchAtomById`. Executes a single round-trip
 * (one `.in('atom_id', …)` query per related table) and preserves the
 * caller-provided order so UIs can render without re-sorting. Missing
 * ids are silently dropped.
 */
export async function fetchAtomsByIds(atomIds: string[]): Promise<AtomRecord[]> {
  const uniqueIds = Array.from(new Set(atomIds.map((id) => id.trim()).filter(Boolean)))

  if (uniqueIds.length === 0) {
    return []
  }

  const atoms = await loadCurrentAtomRows({ atomIds: uniqueIds })
  const byId = new Map(atoms.map((atom) => [atom.atomId, atom]))

  return uniqueIds.flatMap((id) => {
    const atom = byId.get(id)
    return atom ? [atom] : []
  })
}

export async function fetchAnchorForPersona(personaId: string): Promise<PersonaAnchorRecord | null> {
  const client = createPublicReadClient()

  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('lesson_anchors')
    .select('anchor_id, persona_id, ordered_atom_ids, required_capabilities, description')
    .eq('persona_id', personaId)
    .order('anchor_id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    anchor_id: string
    persona_id: string
    ordered_atom_ids: unknown
    required_capabilities: unknown
    description: string | null
  }

  return {
    anchorId: row.anchor_id,
    personaId: row.persona_id,
    orderedAtomIds: toStringArray(row.ordered_atom_ids),
    requiredCapabilities: toStringArray(row.required_capabilities),
    description: row.description ?? null,
  }
}

export async function fetchUserPersonaIds(userId: string): Promise<string[]> {
  // user_personas is per-user data. We keep using the service client here
  // (RLS bypassed by service_role) because this function is reached via the
  // planner, whose entry module is unfortunately re-exported into a client
  // bundle (`/plan/preview` is a `'use client'` page). Importing the cookie-
  // backed authed server client would drag `next/headers` into that bundle.
  // Per-user reads via service role are intentional and safe as long as the
  // function is only called from server contexts (planner is server-side).
  const client = createServiceClient()

  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('user_personas')
    .select('persona_id, weight')
    .eq('user_id', userId)
    .order('weight', { ascending: false })

  if (error || !data) {
    return []
  }

  return (data as Array<{ persona_id: string }>).map((row) => row.persona_id)
}

export async function fetchAtomsForUserPersonas(userId: string): Promise<{
  atoms: AtomRecord[]
  anchors: Awaited<ReturnType<typeof fetchAnchorForPersona>>[]
}> {
  const personaIds = await fetchUserPersonaIds(userId)
  const anchors = await Promise.all(personaIds.map((personaId) => fetchAnchorForPersona(personaId)))

  const anchorAtomIds = anchors.flatMap((anchor) => anchor?.orderedAtomIds ?? [])
  // W58 (Audit G3): persona slug を atom personaTags 名前空間へ展開する。
  // 旧コードは `persona.ai-automation` → `'ai-automation'` の単純剥がしだったが、
  // DB atom は `office-automator` 等の独立 tag を持つため常時 hit 0 件だった。
  // expandPersonaSlugsToTags で 1 persona → N tag に bridge する。
  const personaTags = expandPersonaSlugsToTags(personaIds)
  // TQ-222: Raise the publish threshold from 'draft' to 'reviewed' so that
  // only quality-checked atoms reach learners. The TQ-217 anchor + TQ-218
  // no-code-first set are seeded as 'reviewed' (worker-promoted, full
  // /lesson-improve review pending). Remaining draft atoms are filtered
  // out and will be promoted in follow-up TQs.
  const atoms = await fetchCurrentAtoms({ minStatus: 'reviewed' })

  const filteredAtoms = atoms.filter((atom) =>
    anchorAtomIds.includes(atom.atomId) ||
    atom.personaTags.some((tag) => personaTags.includes(tag)),
  )

  return {
    atoms: filteredAtoms,
    anchors,
  }
}
