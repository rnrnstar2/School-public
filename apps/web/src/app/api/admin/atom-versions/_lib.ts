export const ATOM_VERSION_STATUSES = [
  'draft',
  'reviewed',
  'experimental',
  'stable',
  'archived',
] as const

export const PROMOTABLE_ATOM_VERSION_STATUSES = [
  'reviewed',
  'experimental',
  'stable',
] as const

export type AtomVersionStatus = (typeof ATOM_VERSION_STATUSES)[number]
export type PromotableAtomVersionStatus = (typeof PROMOTABLE_ATOM_VERSION_STATUSES)[number]

export interface LessonAtomRow {
  atom_id: string
  current_version_id: string | null
  source_path: string
  updated_at: string
}

export interface LessonAtomVersionRow {
  version_id: string
  atom_id: string
  status: AtomVersionStatus
  yaml_hash: string | null
  yaml_content: Record<string, unknown>
  body_markdown: string | null
  metadata: Record<string, unknown>
  imported_at: string
  imported_by: string
}

export interface LessonAtomAuditInsert {
  actor_id: string | null
  action: string
  atom_id: string
  version_id: string | null
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
}

export interface AtomVersionSummary {
  version_id: string
  atom_id: string
  title: string | null
  status: AtomVersionStatus
  imported_at: string
  imported_by: string
}

export interface AtomVersionListItem extends AtomVersionSummary {
  is_current: boolean
  atom: LessonAtomRow
  current_active_version: AtomVersionSummary | null
}

export interface AtomVersionDetail {
  version: LessonAtomVersionRow
  title: string | null
  atom: LessonAtomRow
  current_active_version: AtomVersionSummary | null
  comparison_version: AtomVersionSummary | null
  comparison_basis: 'current_active' | 'previous_active' | 'none'
  diff_text: string
}

export interface AtomVersionListFilters {
  status?: AtomVersionStatus | 'all'
  atomId?: string
  limit?: number
}

export interface AtomVersionMutationInput {
  action: 'promote' | 'rollback' | 'archive'
  targetStatus?: PromotableAtomVersionStatus
}

export interface AtomVersionMutationResult {
  atom_id: string
  version_id: string
  action: string
  status: AtomVersionStatus
  current_version_id: string | null
}

export interface AtomVersionRepository {
  listVersions(filters: AtomVersionListFilters): Promise<LessonAtomVersionRow[]>
  getVersionById(versionId: string): Promise<LessonAtomVersionRow | null>
  getAtomById(atomId: string): Promise<LessonAtomRow | null>
  listAtomsByIds(atomIds: string[]): Promise<LessonAtomRow[]>
  listVersionsByAtomId(atomId: string): Promise<LessonAtomVersionRow[]>
  updateVersionStatus(versionId: string, status: AtomVersionStatus): Promise<void>
  updateAtomCurrentVersion(atomId: string, currentVersionId: string | null): Promise<void>
  insertAudit(entry: LessonAtomAuditInsert): Promise<void>
}

export class AtomVersionActionError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'AtomVersionActionError'
    this.statusCode = statusCode
    this.code = code
  }
}

const ACTIVE_STATUSES = new Set<AtomVersionStatus>([
  'reviewed',
  'experimental',
  'stable',
])

const STATUS_RANK: Record<AtomVersionStatus, number> = {
  archived: -1,
  draft: 0,
  reviewed: 1,
  experimental: 2,
  stable: 3,
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readNestedText(
  source: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = source

  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null
    }

    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' && current.trim().length > 0
    ? current.trim()
    : null
}

export function extractAtomTitle(version: {
  yaml_content?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}): string | null {
  const yaml = asObject(version.yaml_content)
  const metadata = asObject(version.metadata)

  return (
    readNestedText(yaml, ['title']) ??
    readNestedText(yaml, ['name']) ??
    readNestedText(yaml, ['frontmatter', 'title']) ??
    readNestedText(yaml, ['meta', 'title']) ??
    readNestedText(metadata, ['title']) ??
    readNestedText(metadata, ['name']) ??
    null
  )
}

function toSummary(version: LessonAtomVersionRow): AtomVersionSummary {
  return {
    version_id: version.version_id,
    atom_id: version.atom_id,
    title: extractAtomTitle(version),
    status: version.status,
    imported_at: version.imported_at,
    imported_by: version.imported_by,
  }
}

function createRenderableVersionText(version: LessonAtomVersionRow): string {
  const yamlBlock = JSON.stringify(asObject(version.yaml_content), null, 2)
  const metadataBlock = JSON.stringify(asObject(version.metadata), null, 2)

  return [
    '--- yaml_content ---',
    yamlBlock,
    '',
    '--- body_markdown ---',
    version.body_markdown ?? '',
    '',
    '--- metadata ---',
    metadataBlock,
  ].join('\n')
}

export function createTextDiff(previousText: string, nextText: string): string {
  if (previousText === nextText) {
    return '  No textual changes detected.'
  }

  const previousLines = previousText.split('\n')
  const nextLines = nextText.split('\n')
  const output: string[] = []
  const unchangedBuffer: string[] = []
  const maxOutputLines = 800
  const maxOutputChars = 60_000
  let truncated = false
  let outputChars = 0

  const pushLine = (line: string) => {
    if (truncated) {
      return
    }

    if (output.length >= maxOutputLines || outputChars + line.length > maxOutputChars) {
      truncated = true
      return
    }

    output.push(line)
    outputChars += line.length
  }

  const flushUnchanged = () => {
    if (unchangedBuffer.length === 0 || truncated) {
      unchangedBuffer.length = 0
      return
    }

    if (unchangedBuffer.length <= 4) {
      unchangedBuffer.forEach((line) => pushLine(`  ${line}`))
    } else {
      pushLine(`  ${unchangedBuffer[0]}`)
      pushLine(`  ${unchangedBuffer[1]}`)
      pushLine(`  ... ${unchangedBuffer.length - 4} unchanged lines omitted ...`)
      pushLine(`  ${unchangedBuffer[unchangedBuffer.length - 2]}`)
      pushLine(`  ${unchangedBuffer[unchangedBuffer.length - 1]}`)
    }

    unchangedBuffer.length = 0
  }

  for (let index = 0; index < Math.max(previousLines.length, nextLines.length); index += 1) {
    const previousLine = previousLines[index]
    const nextLine = nextLines[index]

    if (previousLine === nextLine && previousLine !== undefined) {
      unchangedBuffer.push(previousLine)
      continue
    }

    flushUnchanged()

    if (previousLine !== undefined) {
      pushLine(`- ${previousLine}`)
    }

    if (nextLine !== undefined) {
      pushLine(`+ ${nextLine}`)
    }

    if (truncated) {
      break
    }
  }

  flushUnchanged()

  if (truncated) {
    output.push('  ... diff truncated to keep the admin view responsive ...')
  }

  return output.join('\n')
}

function buildDetailComparison(
  version: LessonAtomVersionRow,
  atom: LessonAtomRow,
  siblingVersions: LessonAtomVersionRow[],
) {
  const currentActiveVersion = atom.current_version_id
    ? siblingVersions.find((candidate) => candidate.version_id === atom.current_version_id) ?? null
    : null

  const previousActiveVersion = siblingVersions.find(
    (candidate) =>
      candidate.version_id !== version.version_id && ACTIVE_STATUSES.has(candidate.status),
  ) ?? null

  const comparisonVersion =
    currentActiveVersion && currentActiveVersion.version_id !== version.version_id
      ? currentActiveVersion
      : previousActiveVersion

  const comparisonBasis: AtomVersionDetail['comparison_basis'] = comparisonVersion
    ? currentActiveVersion && comparisonVersion.version_id === currentActiveVersion.version_id
      ? 'current_active'
      : 'previous_active'
    : 'none'

  const diffText = comparisonVersion
    ? createTextDiff(
        createRenderableVersionText(comparisonVersion),
        createRenderableVersionText(version),
      )
    : '  No comparable active version found.'

  return {
    currentActiveVersion,
    comparisonVersion,
    comparisonBasis,
    diffText,
  }
}

export async function listAtomVersions(
  repository: AtomVersionRepository,
  filters: AtomVersionListFilters,
): Promise<AtomVersionListItem[]> {
  const versions = await repository.listVersions(filters)
  const atomIds = Array.from(new Set(versions.map((version) => version.atom_id)))
  const atoms = atomIds.length > 0
    ? await repository.listAtomsByIds(atomIds)
    : []

  const atomById = new Map(atoms.map((atom) => [atom.atom_id, atom]))
  const currentVersionIds = Array.from(
    new Set(
      atoms
        .map((atom) => atom.current_version_id)
        .filter((versionId): versionId is string => Boolean(versionId)),
    ),
  )

  const currentVersions = currentVersionIds.length > 0
    ? (
        await Promise.all(
          currentVersionIds.map((versionId) => repository.getVersionById(versionId)),
        )
      ).filter((version): version is LessonAtomVersionRow => Boolean(version))
    : []

  const currentVersionById = new Map(
    currentVersions.map((version) => [version.version_id, version]),
  )

  return versions
    .map((version) => {
      const atom = atomById.get(version.atom_id)
      if (!atom) {
        return null
      }

      const currentVersion = atom.current_version_id
        ? currentVersionById.get(atom.current_version_id) ?? null
        : null

      return {
        ...toSummary(version),
        is_current: atom.current_version_id === version.version_id,
        atom,
        current_active_version: currentVersion ? toSummary(currentVersion) : null,
      } satisfies AtomVersionListItem
    })
    .filter((item): item is AtomVersionListItem => Boolean(item))
}

export async function getAtomVersionDetail(
  repository: AtomVersionRepository,
  versionId: string,
): Promise<AtomVersionDetail> {
  const version = await repository.getVersionById(versionId)

  if (!version) {
    throw new AtomVersionActionError(404, 'version_not_found', 'Atom version not found.')
  }

  const atom = await repository.getAtomById(version.atom_id)

  if (!atom) {
    throw new AtomVersionActionError(404, 'atom_not_found', 'Parent atom not found.')
  }

  const siblingVersions = await repository.listVersionsByAtomId(version.atom_id)
  const comparison = buildDetailComparison(version, atom, siblingVersions)

  return {
    version,
    title: extractAtomTitle(version),
    atom,
    current_active_version: comparison.currentActiveVersion
      ? toSummary(comparison.currentActiveVersion)
      : null,
    comparison_version: comparison.comparisonVersion
      ? toSummary(comparison.comparisonVersion)
      : null,
    comparison_basis: comparison.comparisonBasis,
    diff_text: comparison.diffText,
  }
}

interface MutationPlan {
  auditAction: string
  nextStatus: AtomVersionStatus
  nextCurrentVersionId: string | null
  shouldUpdateCurrentVersion: boolean
  beforeState: Record<string, unknown>
  afterState: Record<string, unknown>
}

function buildMutationPlan(params: {
  version: LessonAtomVersionRow
  atom: LessonAtomRow
  siblingVersions: LessonAtomVersionRow[]
  input: AtomVersionMutationInput
}): MutationPlan {
  const { version, atom, siblingVersions, input } = params
  const activeFallback = siblingVersions.find(
    (candidate) =>
      candidate.version_id !== version.version_id && ACTIVE_STATUSES.has(candidate.status),
  ) ?? null

  const beforeState = {
    atom_id: atom.atom_id,
    current_version_id: atom.current_version_id,
    target_version: {
      version_id: version.version_id,
      status: version.status,
    },
  }

  if (input.action === 'promote') {
    if (!input.targetStatus) {
      throw new AtomVersionActionError(
        400,
        'target_status_required',
        'target_status is required for promote actions.',
      )
    }

    if (STATUS_RANK[input.targetStatus] <= STATUS_RANK[version.status]) {
      throw new AtomVersionActionError(
        400,
        'invalid_status_transition',
        'Promote requires a strictly higher target_status.',
      )
    }

    return {
      auditAction: `atom_version.promote.${input.targetStatus}`,
      nextStatus: input.targetStatus,
      nextCurrentVersionId: version.version_id,
      shouldUpdateCurrentVersion: true,
      beforeState,
      afterState: {
        atom_id: atom.atom_id,
        current_version_id: version.version_id,
        target_version: {
          version_id: version.version_id,
          status: input.targetStatus,
        },
      },
    }
  }

  if (input.action === 'rollback') {
    if (!activeFallback) {
      throw new AtomVersionActionError(
        409,
        'rollback_target_not_found',
        'Rollback requires an earlier reviewed, experimental, or stable version.',
      )
    }

    return {
      auditAction: 'atom_version.rollback',
      nextStatus: 'archived',
      nextCurrentVersionId: activeFallback.version_id,
      shouldUpdateCurrentVersion: true,
      beforeState,
      afterState: {
        atom_id: atom.atom_id,
        current_version_id: activeFallback.version_id,
        target_version: {
          version_id: version.version_id,
          status: 'archived',
        },
      },
    }
  }

  const shouldUpdateCurrentVersion = atom.current_version_id === version.version_id

  return {
    auditAction: 'atom_version.archive',
    nextStatus: 'archived',
    nextCurrentVersionId: shouldUpdateCurrentVersion
      ? activeFallback?.version_id ?? null
      : atom.current_version_id,
    shouldUpdateCurrentVersion,
    beforeState,
    afterState: {
      atom_id: atom.atom_id,
      current_version_id: shouldUpdateCurrentVersion
        ? activeFallback?.version_id ?? null
        : atom.current_version_id,
      target_version: {
        version_id: version.version_id,
        status: 'archived',
      },
    },
  }
}

export async function mutateAtomVersion(
  repository: AtomVersionRepository,
  actorId: string | null,
  versionId: string,
  input: AtomVersionMutationInput,
): Promise<AtomVersionMutationResult> {
  const version = await repository.getVersionById(versionId)

  if (!version) {
    throw new AtomVersionActionError(404, 'version_not_found', 'Atom version not found.')
  }

  const atom = await repository.getAtomById(version.atom_id)

  if (!atom) {
    throw new AtomVersionActionError(404, 'atom_not_found', 'Parent atom not found.')
  }

  const siblingVersions = await repository.listVersionsByAtomId(version.atom_id)
  const plan = buildMutationPlan({
    version,
    atom,
    siblingVersions,
    input,
  })

  await repository.updateVersionStatus(version.version_id, plan.nextStatus)

  if (plan.shouldUpdateCurrentVersion) {
    await repository.updateAtomCurrentVersion(atom.atom_id, plan.nextCurrentVersionId)
  }

  await repository.insertAudit({
    actor_id: actorId,
    action: plan.auditAction,
    atom_id: atom.atom_id,
    version_id: version.version_id,
    before_state: plan.beforeState,
    after_state: plan.afterState,
  })

  return {
    atom_id: atom.atom_id,
    version_id: version.version_id,
    action: plan.auditAction,
    status: plan.nextStatus,
    current_version_id: plan.nextCurrentVersionId,
  }
}
