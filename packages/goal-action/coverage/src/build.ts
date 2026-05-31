import { contentHashOf } from './hash'
import {
  COVERAGE_INDEX_SCHEMA_VERSION,
  CoverageIndexSchema,
  type AtomNode,
  type Capability,
  type CoverageIndex,
  type CoverageWarning,
  type LessonNode,
  type SupportAssetNode,
} from './schema'
import { loadAtomSources, type AtomSource } from './sources/atom'
import { loadFactorySources, type FactorySource } from './sources/factory'

/** Minimal logger shape so callers can inject their own sink. */
export type CoverageLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

const noopLogger: CoverageLogger = { warn: () => undefined }

export type BuildCoverageIndexInput = {
  atomSources?: AtomSource[]
  factorySources?: FactorySource[]
  /** Override the emitted `built_at` — defaults to the stable sentinel. */
  builtAt?: string
  /** Support assets (anchors, rubrics, personas) that reference lessons. */
  supportAssets?: SupportAssetNode[]
  /** Logger used for warnings (duplicate/deprecated lesson events). */
  logger?: CoverageLogger
}

/**
 * Build a deterministic Coverage Index snapshot.
 *
 * Contract:
 *  - No AI/LLM calls, no network, no random values.
 *  - Same input → same `content_hash`.
 *  - Deprecated lessons are excluded.
 *  - Duplicate lesson ids collapse deterministically, preferring the most
 *    recent `updated_at` when sources provide one.
 */
export async function buildCoverageIndex(
  input: BuildCoverageIndexInput = {},
): Promise<CoverageIndex> {
  const logger = input.logger ?? noopLogger
  const warnings: CoverageWarning[] = []

  const atomResult = await loadAtomSources(input.atomSources ?? [])
  const factoryResult = await loadFactorySources(input.factorySources ?? [])

  for (const w of [...atomResult.warnings, ...factoryResult.warnings]) {
    warnings.push({
      code: w.code,
      message: w.message,
      lesson_id: w.lesson_id,
      source_path: w.source_path,
    })
  }

  const combinedLessonCandidates = [...factoryResult.lessons]
  // Factory atoms are the canonical source of truth; legacy atoms are
  // kept only for backward compatibility. Ordering them first ensures
  // `dedupAtoms()` (keep-first-seen) resolves ID collisions in favor of
  // the current factory metadata rather than the stale legacy record.
  const combinedAtoms = [...factoryResult.atoms, ...atomResult.atoms]

  const { lessons, warnings: dedupWarnings } = deduplicateLessons(
    combinedLessonCandidates,
    logger,
  )
  warnings.push(...dedupWarnings)

  const { lessons: activeLessons, warnings: deprecationWarnings } =
    filterDeprecated(lessons, logger)
  warnings.push(...deprecationWarnings)

  const sortedLessons = sortLessons(activeLessons)
  const sortedAtoms = sortAtoms(dedupAtoms(combinedAtoms))
  const capabilities = deriveCapabilities(sortedLessons)
  const supportAssets = sortSupportAssets(input.supportAssets ?? [])

  const unsignedPayload = {
    schema_version: COVERAGE_INDEX_SCHEMA_VERSION,
    lessons: sortedLessons,
    atoms: sortedAtoms,
    capabilities,
    support_assets: supportAssets,
    warnings: sortWarnings(warnings),
  }
  const content_hash = contentHashOf(unsignedPayload)

  const finalPayload: CoverageIndex = {
    schema_version: COVERAGE_INDEX_SCHEMA_VERSION,
    content_hash,
    built_at: input.builtAt ?? 'deterministic',
    lessons: sortedLessons,
    atoms: sortedAtoms,
    capabilities,
    support_assets: supportAssets,
    warnings: sortWarnings(warnings),
  }

  // Runtime schema validation — catches drift between loaders and the
  // declared shape without leaking partial data to callers.
  return CoverageIndexSchema.parse(finalPayload)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deduplicateLessons(
  lessons: LessonNode[],
  logger: CoverageLogger,
): { lessons: LessonNode[]; warnings: CoverageWarning[] } {
  const warnings: CoverageWarning[] = []
  const byId = new Map<string, LessonNode>()

  for (const lesson of lessons) {
    const existing = byId.get(lesson.id)
    if (!existing) {
      byId.set(lesson.id, lesson)
      continue
    }

    const keepNew = compareUpdatedAt(lesson.updated_at, existing.updated_at) > 0
    const kept = keepNew ? lesson : existing
    const dropped = keepNew ? existing : lesson
    byId.set(lesson.id, kept)

    const message = `duplicate lesson id ${lesson.id}: kept source ${kept.source_path} (updated_at=${kept.updated_at}); dropped source ${dropped.source_path} (updated_at=${dropped.updated_at})`
    logger.warn(message, { lesson_id: lesson.id })
    warnings.push({
      code: 'duplicate_lesson_dropped',
      message,
      lesson_id: lesson.id,
      source_path: dropped.source_path,
    })
  }

  return { lessons: Array.from(byId.values()), warnings }
}

function filterDeprecated(
  lessons: LessonNode[],
  logger: CoverageLogger,
): { lessons: LessonNode[]; warnings: CoverageWarning[] } {
  const warnings: CoverageWarning[] = []
  const active: LessonNode[] = []
  for (const lesson of lessons) {
    if (lesson.status === 'deprecated') {
      const message = `deprecated lesson excluded from coverage index: ${lesson.id}`
      logger.warn(message, { lesson_id: lesson.id })
      warnings.push({
        code: 'deprecated_lesson_excluded',
        message,
        lesson_id: lesson.id,
        source_path: lesson.source_path,
      })
      continue
    }
    active.push(lesson)
  }
  return { lessons: active, warnings }
}

function compareUpdatedAt(a: string, b: string): number {
  // "deterministic" sentinel is treated as the lowest possible value so any
  // explicit timestamp wins; otherwise lexical ISO-8601 comparison suffices.
  if (a === b) return 0
  if (a === 'deterministic') return -1
  if (b === 'deterministic') return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function sortLessons(lessons: LessonNode[]): LessonNode[] {
  return [...lessons].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function dedupAtoms(atoms: AtomNode[]): AtomNode[] {
  const byId = new Map<string, AtomNode>()
  for (const atom of atoms) {
    if (!byId.has(atom.id)) byId.set(atom.id, atom)
  }
  return Array.from(byId.values())
}

function sortAtoms(atoms: AtomNode[]): AtomNode[] {
  return [...atoms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function sortSupportAssets(assets: SupportAssetNode[]): SupportAssetNode[] {
  return [...assets]
    .map((asset) => ({
      ...asset,
      linked_lesson_ids: [...asset.linked_lesson_ids].sort(),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function sortWarnings(warnings: CoverageWarning[]): CoverageWarning[] {
  return [...warnings].sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    const la = a.lesson_id ?? ''
    const lb = b.lesson_id ?? ''
    if (la !== lb) return la < lb ? -1 : 1
    if (a.message !== b.message) return a.message < b.message ? -1 : 1
    return 0
  })
}

/**
 * Walk the lessons and materialize a capability graph: every capability id
 * referenced by `capability_inputs` / `capability_outputs` becomes a node
 * whose `produced_by` / `consumed_by` lists the lessons that touch it.
 */
function deriveCapabilities(lessons: LessonNode[]): Capability[] {
  const index = new Map<string, Capability>()

  const ensure = (id: string): Capability => {
    const existing = index.get(id)
    if (existing) return existing
    const created: Capability = {
      id,
      label: id,
      produced_by: [],
      consumed_by: [],
    }
    index.set(id, created)
    return created
  }

  for (const lesson of lessons) {
    for (const cap of lesson.capability_outputs) {
      const node = ensure(cap)
      node.produced_by.push(lesson.id)
    }
    for (const cap of lesson.capability_inputs) {
      const node = ensure(cap)
      node.consumed_by.push(lesson.id)
    }
  }

  return Array.from(index.values())
    .map((cap) => ({
      ...cap,
      produced_by: uniqueSorted(cap.produced_by),
      consumed_by: uniqueSorted(cap.consumed_by),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}
