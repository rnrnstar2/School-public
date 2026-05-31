import { z } from 'zod/v4'

/**
 * Schema version for the Coverage Index payload.
 *
 * Bump this string whenever the payload shape changes in a way that would
 * invalidate hash comparisons against previously stored snapshots.
 */
export const COVERAGE_INDEX_SCHEMA_VERSION = 'v1' as const

/** Lesson lifecycle status carried through the capability graph. */
export const LESSON_STATUS_VALUES = [
  'draft',
  'published',
  'reviewed',
  'experimental',
  'stable',
  'deprecated',
] as const
export const LessonStatusSchema = z.enum(LESSON_STATUS_VALUES)
export type LessonStatus = z.infer<typeof LessonStatusSchema>

/** Origin of a lesson record, used for provenance + dedup tie-breakers. */
export const LESSON_SOURCE_KINDS = ['atom', 'factory'] as const
export const LessonSourceKindSchema = z.enum(LESSON_SOURCE_KINDS)
export type LessonSourceKind = z.infer<typeof LessonSourceKindSchema>

/** Capability node — a tag that lessons consume (`inputs`) or produce (`outputs`). */
export const CapabilitySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Lesson ids that list this capability as an output. */
    produced_by: z.array(z.string().min(1)),
    /** Lesson ids that list this capability as an input/prerequisite. */
    consumed_by: z.array(z.string().min(1)),
  })
  .strict()
export type Capability = z.infer<typeof CapabilitySchema>

/** Canonical lesson node derived from YAML atom metadata. */
export const LessonNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().default(''),
    track_id: z.string().nullable().default(null),
    module_id: z.string().nullable().default(null),
    milestone_id: z.string().nullable().default(null),
    status: LessonStatusSchema,
    capability_inputs: z.array(z.string().min(1)),
    capability_outputs: z.array(z.string().min(1)),
    hard_prerequisites: z.array(z.string().min(1)),
    soft_prerequisites: z.array(z.string().min(1)),
    persona_tags: z.array(z.string().min(1)),
    goal_tags: z.array(z.string().min(1)),
    source_kind: LessonSourceKindSchema,
    source_path: z.string().min(1),
    /** ISO-8601 updated timestamp (deterministic: derived, not wall clock). */
    updated_at: z.string().min(1),
  })
  .strict()
export type LessonNode = z.infer<typeof LessonNodeSchema>

/** YAML atom node — kept separate so Matcher can trace lessons back to atom ids. */
export const AtomNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    persona_tags: z.array(z.string().min(1)),
    goal_tags: z.array(z.string().min(1)),
    capability_inputs: z.array(z.string().min(1)),
    capability_outputs: z.array(z.string().min(1)),
    status: LessonStatusSchema,
    source_path: z.string().min(1),
  })
  .strict()
export type AtomNode = z.infer<typeof AtomNodeSchema>

/** Non-lesson asset referenced by lessons (anchor flows, personas, rubrics, etc.). */
export const SupportAssetKindSchema = z.enum([
  'anchor',
  'persona',
  'rubric',
  'other',
])
export type SupportAssetKind = z.infer<typeof SupportAssetKindSchema>

export const SupportAssetNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: SupportAssetKindSchema,
    title: z.string().min(1),
    source_path: z.string().min(1),
    linked_lesson_ids: z.array(z.string().min(1)),
  })
  .strict()
export type SupportAssetNode = z.infer<typeof SupportAssetNodeSchema>

/** Warnings / info-level events emitted during a build. */
export const COVERAGE_WARNING_CODES = [
  'duplicate_lesson_dropped',
  'deprecated_lesson_excluded',
  'unreadable_source',
  'missing_capability_reference',
] as const
export const CoverageWarningSchema = z
  .object({
    code: z.enum(COVERAGE_WARNING_CODES),
    message: z.string().min(1),
    lesson_id: z.string().nullable().default(null),
    source_path: z.string().nullable().default(null),
  })
  .strict()
export type CoverageWarning = z.infer<typeof CoverageWarningSchema>

/** Deterministic Coverage Index snapshot payload. */
export const CoverageIndexSchema = z
  .object({
    schema_version: z.literal(COVERAGE_INDEX_SCHEMA_VERSION),
    /**
     * Deterministic content hash (40-hex substring of sha256 of canonical JSON).
     * Computed after normalization + sort so identical inputs → identical hash.
     */
    content_hash: z.string().length(40),
    /** ISO-8601 timestamp or the sentinel `deterministic` when unset. */
    built_at: z.string().min(1),
    lessons: z.array(LessonNodeSchema),
    atoms: z.array(AtomNodeSchema),
    capabilities: z.array(CapabilitySchema),
    support_assets: z.array(SupportAssetNodeSchema),
    warnings: z.array(CoverageWarningSchema),
  })
  .strict()
export type CoverageIndex = z.infer<typeof CoverageIndexSchema>
