#!/usr/bin/env npx tsx
/**
 * Backfill LessonChunk definitions from TypeScript into canonical Supabase tables.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/backfill-ts-lessons-to-canonical.ts
 *   pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/backfill-ts-lessons-to-canonical.ts --dry-run
 *   pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/backfill-ts-lessons-to-canonical.ts --force
 */

import * as crypto from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import { aiAppBuilderTrack } from '@/lib/curriculum/ai-app-builder-track'
import { aiAutomationTrack } from '@/lib/curriculum/ai-automation-track'
import { aiContentCreatorTrack } from '@/lib/curriculum/ai-content-creator-track'
import { mapLessonTagsToCapabilities } from '@/lib/curriculum/lesson-objective-mapper'
import { webBuilderTrack, type LessonChunk } from '@/lib/curriculum/web-builder-track'

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const BATCH_SIZE = 200
const RUN_STARTED_AT = new Date().toISOString()
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

type DomainSlug = 'web' | 'automation' | 'content' | 'app'
type LessonVersionStatus = 'draft' | 'review' | 'published' | 'archived'
type ContentTagCategory = 'skill' | 'tool' | 'topic' | 'persona'

const TRACK_TO_DOMAIN: Record<string, DomainSlug> = {
  'web-builder-ai': 'web',
  'ai-automation': 'automation',
  'ai-content-creator': 'content',
  'ai-app-builder': 'app',
}

interface TrackLike {
  id: string
  lessons: LessonChunk[]
}

interface LessonSource {
  domainSlug: DomainSlug
  lesson: LessonChunk
  trackId: string
}

interface DomainRow {
  id: string
  slug: DomainSlug
}

interface CapabilityRow {
  id: string
  domain_id: string
  slug: string
}

interface LessonIdentityRow {
  id: string
  slug: string
  title: string
  domain_ids: string[]
}

interface LessonVersionRow {
  id: string
  lesson_id: string
  version: number
  status: LessonVersionStatus
  published_at: string | null
}

interface LessonBlockRow {
  id: string
  lesson_version_id: string
  type: 'markdown'
  sort_order: number
  content: Record<string, unknown>
}

interface ExistingLessonBlockRow {
  id: string
  lesson_version_id: string
  type: string
  sort_order: number
  content: unknown
}

interface ProtectedLessonBlockVersion {
  lessonSlug: string
  version: number
  lessonVersionId: string
  existingBlockCount: number
  reason: string
}

interface LessonObjectiveRow {
  lesson_id: string
  capability_id: string
  weight: 'primary' | 'secondary'
}

interface LessonPrerequisiteRow {
  lesson_id: string
  prerequisite_lesson_id: string
  strength: 'required'
}

interface ContentTagRow {
  id: string
  slug: string
  label: string
  category: ContentTagCategory
}

interface LessonContentTagRow {
  lesson_id: string
  tag_id: string
}

interface CountReport {
  inserted: number
  unchanged: number
  updated: number
}

interface PlanResult<T> {
  counts: CountReport
  rowsToWrite: T[]
}

function uuidv5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const nameBytes = Buffer.from(name, 'utf8')

  const hash = crypto.createHash('sha1')
  hash.update(nsBytes)
  hash.update(nameBytes)
  const digest = hash.digest()

  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80

  const hex = digest.toString('hex').slice(0, 32)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

function isEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getLessonBlockRole(row: ExistingLessonBlockRow): string | null {
  if (!isRecord(row.content)) {
    return null
  }

  const role = row.content.role
  return typeof role === 'string' ? role : null
}

function isEmptyRecord(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0
}

function canSafelyRewriteMarkdownLessonBlock(row: ExistingLessonBlockRow): boolean {
  if (row.type !== 'markdown' || row.sort_order !== 0 || !isRecord(row.content)) {
    return false
  }

  if (typeof row.content.text !== 'string') {
    return false
  }

  const contentKeys = Object.keys(row.content).sort()

  if (contentKeys.length === 1 && contentKeys[0] === 'text') {
    return true
  }

  return (
    contentKeys.length === 2 &&
    contentKeys[0] === 'metadata' &&
    contentKeys[1] === 'text' &&
    isEmptyRecord(row.content.metadata)
  )
}

function buildLessonBlockContent(text: string, existingBlock?: ExistingLessonBlockRow): Record<string, unknown> {
  if (
    existingBlock &&
    isRecord(existingBlock.content) &&
    Object.prototype.hasOwnProperty.call(existingBlock.content, 'metadata') &&
    isEmptyRecord(existingBlock.content.metadata)
  ) {
    return {
      text,
      metadata: {},
    }
  }

  return { text }
}

function describeStructuredLessonBlocks(rows: ExistingLessonBlockRow[]): string | null {
  if (rows.length > 1) {
    return `existing block count=${rows.length}`
  }

  const [row] = rows
  if (!row) {
    return null
  }

  if (row.type !== 'markdown') {
    return `existing block type=${row.type}`
  }

  if (row.sort_order !== 0) {
    return `existing block sort_order=${row.sort_order}`
  }

  if (!isRecord(row.content)) {
    return 'existing block content=non_object'
  }

  if (canSafelyRewriteMarkdownLessonBlock(row)) {
    return null
  }

  const role = getLessonBlockRole(row)
  if (role !== null) {
    return `existing block role=${role}`
  }

  if (Object.prototype.hasOwnProperty.call(row.content, 'metadata')) {
    const metadata = row.content.metadata
    if (!isEmptyRecord(metadata)) {
      if (isRecord(metadata)) {
        return `existing block metadata keys=${Object.keys(metadata).sort().join(',') || '(empty)'}`
      }

      return `existing block metadata type=${Array.isArray(metadata) ? 'array' : typeof metadata}`
    }
  }

  return `existing block content keys=${Object.keys(row.content).sort().join(',') || '(none)'}`
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function resolveCapabilitySlugsForLesson(domainSlug: DomainSlug, lesson: LessonChunk): string[] {
  if (domainSlug === 'web') {
    return mapLessonTagsToCapabilities(
      uniqueStrings([
        ...lesson.searchMetadata.tags,
        ...lesson.goalTags,
        ...lesson.capabilityTags,
        ...lesson.blockerTags,
      ]),
      'web',
    )
  }

  return uniqueStrings(lesson.capabilityTags)
}

function slugify(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (normalized) {
    return normalized
  }

  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)
}

// content_tags.slug is globally unique, so the category prefix keeps source buckets from colliding.
function buildContentTagSlug(category: ContentTagCategory, rawValue: string): string {
  return `${category}-${slugify(rawValue)}`
}

function buildMarkdownContent(lesson: LessonChunk): string {
  const content = lesson.content?.trim()
  if (content) return content

  const sections = [
    ['Summary', lesson.summary],
    ['Why This Matters', lesson.whyThisMatters],
    ['How To Do', lesson.howToDo],
    ['Common Blockers', lesson.commonBlockers],
    ['Confirmation', lesson.confirmationMethod],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))

  return sections.map(([heading, text]) => `## ${heading}\n\n${text.trim()}`).join('\n\n')
}

function collectStackTags(lesson: LessonChunk): string[] {
  return uniqueStrings([
    ...lesson.stack.frameworks,
    ...lesson.stack.backend,
    ...lesson.stack.database,
    ...lesson.stack.styling,
    ...lesson.stack.ui,
    ...lesson.stack.hosting,
    ...lesson.stack.tooling,
  ])
}

function collectLessons(): { lessons: LessonSource[]; warnings: string[] } {
  const tracks: TrackLike[] = [
    webBuilderTrack,
    aiAutomationTrack,
    aiContentCreatorTrack,
    aiAppBuilderTrack,
  ]

  const warnings: string[] = []
  const seenLessonIds = new Set<string>()
  const lessons: LessonSource[] = []

  for (const track of tracks) {
    const domainSlug = TRACK_TO_DOMAIN[track.id]

    if (!domainSlug) {
      throw new Error(`No domain mapping defined for track: ${track.id}`)
    }

    for (const lesson of track.lessons) {
      if (seenLessonIds.has(lesson.id)) {
        warnings.push(`[warn] Duplicate lesson id "${lesson.id}" in track "${track.id}" skipped.`)
        continue
      }

      seenLessonIds.add(lesson.id)
      lessons.push({
        domainSlug,
        lesson,
        trackId: track.id,
      })
    }
  }

  return { lessons, warnings }
}

function buildTagRowsForLesson(lesson: LessonChunk): ContentTagRow[] {
  const rows = new Map<string, ContentTagRow>()

  const addTags = (values: string[], category: ContentTagCategory) => {
    for (const value of uniqueStrings(values)) {
      const slug = buildContentTagSlug(category, value)
      rows.set(slug, {
        id: uuidv5(`content-tag:${slug}`, NAMESPACE),
        slug,
        label: value,
        category,
      })
    }
  }

  addTags(lesson.personaTags, 'persona')
  addTags(lesson.goalTags, 'topic')
  addTags(lesson.capabilityTags, 'skill')
  addTags(lesson.blockerTags, 'topic')
  addTags(collectStackTags(lesson), 'tool')

  return Array.from(rows.values())
}

function emptyCountReport(): CountReport {
  return {
    inserted: 0,
    unchanged: 0,
    updated: 0,
  }
}

function planUpserts<TDesired, TExisting>(params: {
  desiredRows: TDesired[]
  existingRows: TExisting[]
  keyOfDesired: (row: TDesired) => string
  keyOfExisting: (row: TExisting) => string
  matches: (desired: TDesired, existing: TExisting) => boolean
}): PlanResult<TDesired> {
  const existingByKey = new Map<string, TExisting>(
    params.existingRows.map((row) => [params.keyOfExisting(row), row])
  )

  const counts = emptyCountReport()
  const rowsToWrite: TDesired[] = []

  for (const desiredRow of params.desiredRows) {
    const key = params.keyOfDesired(desiredRow)
    const existingRow = existingByKey.get(key)

    if (!existingRow) {
      counts.inserted += 1
      rowsToWrite.push(desiredRow)
      continue
    }

    if (params.matches(desiredRow, existingRow)) {
      counts.unchanged += 1
      continue
    }

    counts.updated += 1
    rowsToWrite.push(desiredRow)
  }

  return { counts, rowsToWrite }
}

async function upsertInBatches<T>(params: {
  client: ReturnType<typeof createClient>
  onConflict: string
  rows: T[]
  table: string
}) {
  for (const batch of chunkArray(params.rows, BATCH_SIZE)) {
    if (batch.length === 0) continue

    const { error } = await params.client
      .from(params.table)
      .upsert(batch as never, {
        ignoreDuplicates: false,
        onConflict: params.onConflict,
      })

    if (error) {
      throw new Error(`Failed to upsert ${params.table}: ${error.message}`)
    }
  }
}

function formatCounts(table: string, counts: CountReport): string {
  return `${table}: inserted=${counts.inserted}, updated=${counts.updated}, unchanged=${counts.unchanged}`
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { lessons, warnings } = collectLessons()

  console.log(`[info] Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`)
  console.log(`[info] Force structured lesson_blocks overwrite: ${FORCE}`)
  console.log(`[info] Loaded ${lessons.length} lessons from ${new Set(lessons.map((item) => item.trackId)).size} tracks.`)

  const { data: domainsData, error: domainsError } = await client
    .from('domains')
    .select('id, slug')

  if (domainsError) {
    throw new Error(`Failed to load domains: ${domainsError.message}`)
  }

  const domains = (domainsData ?? []) as DomainRow[]
  const domainIdBySlug = new Map<DomainSlug, string>(domains.map((row) => [row.slug, row.id]))

  for (const domainSlug of Object.values(TRACK_TO_DOMAIN)) {
    if (!domainIdBySlug.has(domainSlug)) {
      throw new Error(`Domain "${domainSlug}" is missing. Apply migration 027 and seed data first.`)
    }
  }

  const { data: capabilitiesData, error: capabilitiesError } = await client
    .from('capabilities')
    .select('id, domain_id, slug')

  if (capabilitiesError) {
    throw new Error(`Failed to load capabilities: ${capabilitiesError.message}`)
  }

  const capabilities = (capabilitiesData ?? []) as CapabilityRow[]
  const capabilityIdByDomainAndSlug = new Map<string, string>(
    capabilities.map((row) => [`${row.domain_id}:${row.slug}`, row.id])
  )

  const { data: lessonIdentitiesData, error: lessonIdentitiesError } = await client
    .from('lesson_identities')
    .select('id, slug, title, domain_ids')

  if (lessonIdentitiesError) {
    throw new Error(`Failed to load lesson identities: ${lessonIdentitiesError.message}`)
  }

  const existingLessonIdentities = (lessonIdentitiesData ?? []) as LessonIdentityRow[]
  const existingIdentityBySlug = new Map(existingLessonIdentities.map((row) => [row.slug, row]))

  const desiredLessonIdentities: LessonIdentityRow[] = lessons
    .map(({ domainSlug, lesson }) => {
      const existing = existingIdentityBySlug.get(lesson.id)
      const id = existing?.id ?? uuidv5(`lesson:${lesson.id}`, NAMESPACE)

      return {
        id,
        slug: lesson.id,
        title: lesson.title,
        domain_ids: [domainIdBySlug.get(domainSlug)!],
      }
    })
    .sort((left, right) => left.slug.localeCompare(right.slug))

  const lessonIdBySlug = new Map<string, string>(existingLessonIdentities.map((row) => [row.slug, row.id]))
  for (const row of desiredLessonIdentities) {
    lessonIdBySlug.set(row.slug, row.id)
  }

  const lessonIdentityPlan = planUpserts({
    desiredRows: desiredLessonIdentities,
    existingRows: existingLessonIdentities,
    keyOfDesired: (row) => row.slug,
    keyOfExisting: (row) => row.slug,
    matches: (desired, existing) =>
      desired.id === existing.id &&
      desired.slug === existing.slug &&
      desired.title === existing.title &&
      isEqual(desired.domain_ids, existing.domain_ids),
  })

  const sourceLessonIds = desiredLessonIdentities.map((row) => row.id)

  const { data: lessonVersionsData, error: lessonVersionsError } = await client
    .from('lesson_versions')
    .select('id, lesson_id, version, status, published_at')
    .in('lesson_id', sourceLessonIds)

  if (lessonVersionsError) {
    throw new Error(`Failed to load lesson versions: ${lessonVersionsError.message}`)
  }

  const existingLessonVersions = (lessonVersionsData ?? []) as LessonVersionRow[]
  const existingVersionByKey = new Map(
    existingLessonVersions.map((row) => [`${row.lesson_id}:${row.version}`, row])
  )

  const desiredLessonVersions: LessonVersionRow[] = lessons
    .map(({ lesson }) => {
      const lessonId = lessonIdBySlug.get(lesson.id)
      if (!lessonId) {
        throw new Error(`Missing resolved lesson identity for slug "${lesson.id}"`)
      }

      const versionKey = `${lessonId}:${lesson.version}`
      const existing = existingVersionByKey.get(versionKey)
      const publishedAt =
        lesson.status === 'published'
          ? existing?.published_at ?? RUN_STARTED_AT
          : null

      return {
        id: existing?.id ?? uuidv5(`lesson-version:${lesson.id}:v${lesson.version}`, NAMESPACE),
        lesson_id: lessonId,
        version: lesson.version,
        status: lesson.status,
        published_at: publishedAt,
      }
    })
    .sort((left, right) => `${left.lesson_id}:${left.version}`.localeCompare(`${right.lesson_id}:${right.version}`))

  const lessonVersionPlan = planUpserts({
    desiredRows: desiredLessonVersions,
    existingRows: existingLessonVersions,
    keyOfDesired: (row) => `${row.lesson_id}:${row.version}`,
    keyOfExisting: (row) => `${row.lesson_id}:${row.version}`,
    matches: (desired, existing) =>
      desired.id === existing.id &&
      desired.lesson_id === existing.lesson_id &&
      desired.version === existing.version &&
      desired.status === existing.status &&
      desired.published_at === existing.published_at,
  })

  const lessonVersionIdByKey = new Map<string, string>(
    desiredLessonVersions.map((row) => [`${row.lesson_id}:${row.version}`, row.id])
  )

  const { data: lessonBlocksData, error: lessonBlocksError } = await client
    .from('lesson_blocks')
    .select('id, lesson_version_id, type, sort_order, content')
    .in('lesson_version_id', desiredLessonVersions.map((row) => row.id))

  if (lessonBlocksError) {
    throw new Error(`Failed to load lesson blocks: ${lessonBlocksError.message}`)
  }

  const existingLessonBlocks = (lessonBlocksData ?? []) as ExistingLessonBlockRow[]
  const existingBlocksByVersion = new Map<string, ExistingLessonBlockRow[]>()

  for (const row of existingLessonBlocks) {
    const rows = existingBlocksByVersion.get(row.lesson_version_id) ?? []
    rows.push(row)
    existingBlocksByVersion.set(row.lesson_version_id, rows)
  }

  const protectedLessonBlockVersions: ProtectedLessonBlockVersion[] = []

  const desiredLessonBlocks: LessonBlockRow[] = lessons
    .flatMap(({ lesson }) => {
      const lessonId = lessonIdBySlug.get(lesson.id)
      if (!lessonId) {
        throw new Error(`Missing lesson identity while building block for "${lesson.id}"`)
      }

      const lessonVersionId = lessonVersionIdByKey.get(`${lessonId}:${lesson.version}`)
      if (!lessonVersionId) {
        throw new Error(`Missing lesson version while building block for "${lesson.id}"`)
      }

      const existingRows = (existingBlocksByVersion.get(lessonVersionId) ?? []).slice().sort((left, right) => {
        if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
        return left.id.localeCompare(right.id)
      })

      const protectedReason = !FORCE ? describeStructuredLessonBlocks(existingRows) : null
      if (protectedReason) {
        protectedLessonBlockVersions.push({
          lessonSlug: lesson.id,
          version: lesson.version,
          lessonVersionId,
          existingBlockCount: existingRows.length,
          reason: protectedReason,
        })
        return []
      }

      const existingMarkdownBlock = existingRows.find((row) => row.type === 'markdown')
      const existingBlock = existingMarkdownBlock ?? existingRows[0]
      const nextMarkdownContent = buildMarkdownContent(lesson)

      return [{
        id: existingBlock?.id ?? uuidv5(`lesson-block:${lesson.id}:v${lesson.version}:markdown:0`, NAMESPACE),
        lesson_version_id: lessonVersionId,
        type: 'markdown' as const,
        sort_order: 0,
        content: buildLessonBlockContent(nextMarkdownContent, existingBlock),
      }]
    })
    .sort((left, right) => left.id.localeCompare(right.id))

  const lessonBlockPlan = planUpserts({
    desiredRows: desiredLessonBlocks,
    existingRows: existingLessonBlocks,
    keyOfDesired: (row) => row.id,
    keyOfExisting: (row) => row.id,
    matches: (desired, existing) =>
      desired.lesson_version_id === existing.lesson_version_id &&
      desired.type === existing.type &&
      desired.sort_order === existing.sort_order &&
      isEqual(desired.content, existing.content),
  })

  const skippedStructuredLessonBlockCount = protectedLessonBlockVersions.length
  const skippedStructuredExistingBlockCount = protectedLessonBlockVersions.reduce(
    (total, row) => total + row.existingBlockCount,
    0
  )

  const { data: lessonObjectivesData, error: lessonObjectivesError } = await client
    .from('lesson_objectives')
    .select('lesson_id, capability_id, weight')
    .in('lesson_id', sourceLessonIds)

  if (lessonObjectivesError) {
    throw new Error(`Failed to load lesson objectives: ${lessonObjectivesError.message}`)
  }

  const existingLessonObjectives = (lessonObjectivesData ?? []) as LessonObjectiveRow[]
  const unresolvedCapabilityPairs = new Set<string>()

  const desiredLessonObjectives: LessonObjectiveRow[] = lessons
    .flatMap(({ domainSlug, lesson }) => {
      const lessonId = lessonIdBySlug.get(lesson.id)
      if (!lessonId) {
        throw new Error(`Missing lesson identity while building objectives for "${lesson.id}"`)
      }

      const domainId = domainIdBySlug.get(domainSlug)
      if (!domainId) {
        throw new Error(`Missing domain id for "${domainSlug}"`)
      }

      const resolvedCapabilityIds = resolveCapabilitySlugsForLesson(domainSlug, lesson)
        .map((capabilitySlug) => {
          const capabilityId = capabilityIdByDomainAndSlug.get(`${domainId}:${capabilitySlug}`)
          if (!capabilityId) {
            unresolvedCapabilityPairs.add(`${lesson.id}:${capabilitySlug}`)
            return null
          }

          return capabilityId
        })
        .filter((value): value is string => Boolean(value))

      return resolvedCapabilityIds.map((capabilityId, index) => ({
        lesson_id: lessonId,
        capability_id: capabilityId,
        weight: index === 0 ? ('primary' as const) : ('secondary' as const),
      }))
    })
    .sort((left, right) =>
      `${left.lesson_id}:${left.capability_id}`.localeCompare(`${right.lesson_id}:${right.capability_id}`)
    )

  const lessonObjectivePlan = planUpserts({
    desiredRows: desiredLessonObjectives,
    existingRows: existingLessonObjectives,
    keyOfDesired: (row) => `${row.lesson_id}:${row.capability_id}`,
    keyOfExisting: (row) => `${row.lesson_id}:${row.capability_id}`,
    matches: (desired, existing) => desired.weight === existing.weight,
  })

  const { data: lessonPrerequisitesData, error: lessonPrerequisitesError } = await client
    .from('lesson_prerequisites_v2')
    .select('lesson_id, prerequisite_lesson_id, strength')
    .in('lesson_id', sourceLessonIds)

  if (lessonPrerequisitesError) {
    throw new Error(`Failed to load lesson prerequisites: ${lessonPrerequisitesError.message}`)
  }

  const existingLessonPrerequisites = (lessonPrerequisitesData ?? []) as LessonPrerequisiteRow[]
  const prerequisiteWarnings: string[] = []

  const desiredLessonPrerequisites: LessonPrerequisiteRow[] = lessons
    .flatMap(({ lesson }) => {
      const lessonId = lessonIdBySlug.get(lesson.id)
      if (!lessonId) {
        throw new Error(`Missing lesson identity while building prerequisites for "${lesson.id}"`)
      }

      return uniqueStrings(lesson.prerequisiteIds).flatMap((prerequisiteSlug) => {
        const prerequisiteLessonId = lessonIdBySlug.get(prerequisiteSlug)

        if (!prerequisiteLessonId) {
          prerequisiteWarnings.push(
            `[warn] Missing prerequisite slug "${prerequisiteSlug}" referenced by lesson "${lesson.id}".`
          )
          return []
        }

        return [
          {
            lesson_id: lessonId,
            prerequisite_lesson_id: prerequisiteLessonId,
            strength: 'required' as const,
          },
        ]
      })
    })
    .sort((left, right) =>
      `${left.lesson_id}:${left.prerequisite_lesson_id}`.localeCompare(
        `${right.lesson_id}:${right.prerequisite_lesson_id}`
      )
    )

  const lessonPrerequisitePlan = planUpserts({
    desiredRows: desiredLessonPrerequisites,
    existingRows: existingLessonPrerequisites,
    keyOfDesired: (row) => `${row.lesson_id}:${row.prerequisite_lesson_id}`,
    keyOfExisting: (row) => `${row.lesson_id}:${row.prerequisite_lesson_id}`,
    matches: (desired, existing) => desired.strength === existing.strength,
  })

  const { data: contentTagsData, error: contentTagsError } = await client
    .from('content_tags')
    .select('id, slug, label, category')

  if (contentTagsError) {
    throw new Error(`Failed to load content tags: ${contentTagsError.message}`)
  }

  const existingContentTags = (contentTagsData ?? []) as ContentTagRow[]
  const existingContentTagBySlug = new Map(existingContentTags.map((row) => [row.slug, row]))
  const desiredContentTagsBySlug = new Map<string, ContentTagRow>()

  for (const { lesson } of lessons) {
    for (const tagRow of buildTagRowsForLesson(lesson)) {
      const existing = existingContentTagBySlug.get(tagRow.slug)
      desiredContentTagsBySlug.set(tagRow.slug, {
        ...tagRow,
        id: existing?.id ?? tagRow.id,
      })
    }
  }

  const desiredContentTags = Array.from(desiredContentTagsBySlug.values()).sort((left, right) =>
    left.slug.localeCompare(right.slug)
  )

  const contentTagPlan = planUpserts({
    desiredRows: desiredContentTags,
    existingRows: existingContentTags,
    keyOfDesired: (row) => row.slug,
    keyOfExisting: (row) => row.slug,
    matches: (desired, existing) =>
      desired.id === existing.id &&
      desired.label === existing.label &&
      desired.category === existing.category,
  })

  const contentTagIdBySlug = new Map<string, string>(
    desiredContentTags.map((row) => [row.slug, row.id])
  )

  const desiredLessonContentTags: LessonContentTagRow[] = lessons
    .flatMap(({ lesson }) => {
      const lessonId = lessonIdBySlug.get(lesson.id)
      if (!lessonId) {
        throw new Error(`Missing lesson identity while building content tags for "${lesson.id}"`)
      }

      return buildTagRowsForLesson(lesson).map((tagRow) => {
        const tagId = contentTagIdBySlug.get(tagRow.slug)
        if (!tagId) {
          throw new Error(`Missing content tag id for slug "${tagRow.slug}"`)
        }

        return {
          lesson_id: lessonId,
          tag_id: tagId,
        }
      })
    })
    .sort((left, right) => `${left.lesson_id}:${left.tag_id}`.localeCompare(`${right.lesson_id}:${right.tag_id}`))

  const { data: lessonContentTagsData, error: lessonContentTagsError } = await client
    .from('lesson_content_tags')
    .select('lesson_id, tag_id')
    .in('lesson_id', sourceLessonIds)

  if (lessonContentTagsError) {
    throw new Error(`Failed to load lesson content tags: ${lessonContentTagsError.message}`)
  }

  const existingLessonContentTags = (lessonContentTagsData ?? []) as LessonContentTagRow[]

  const lessonContentTagPlan = planUpserts({
    desiredRows: desiredLessonContentTags,
    existingRows: existingLessonContentTags,
    keyOfDesired: (row) => `${row.lesson_id}:${row.tag_id}`,
    keyOfExisting: (row) => `${row.lesson_id}:${row.tag_id}`,
    matches: () => true,
  })

  const allWarnings = [...warnings, ...prerequisiteWarnings]
  for (const warning of allWarnings) {
    console.log(warning)
  }

  if (unresolvedCapabilityPairs.size > 0) {
    const preview = Array.from(unresolvedCapabilityPairs).sort().slice(0, 10)
    console.log(
      `[info] Skipped ${unresolvedCapabilityPairs.size} lesson capability links because matching capabilities rows do not exist.`
    )
    for (const item of preview) {
      console.log(`[info] unresolved capability mapping: ${item}`)
    }
    if (unresolvedCapabilityPairs.size > preview.length) {
      console.log(`[info] ... ${unresolvedCapabilityPairs.size - preview.length} more unresolved capability mappings omitted.`)
    }
  }

  if (protectedLessonBlockVersions.length > 0) {
    console.log(
      `[info] Skipped lesson_blocks upsert for ${protectedLessonBlockVersions.length} lesson_versions because structured block metadata already exists. Pass --force to overwrite.`
    )
    for (const item of protectedLessonBlockVersions) {
      console.log(
        `[info] skipped lesson_blocks for ${item.lessonSlug}@v${item.version} (${item.lessonVersionId}): ${item.reason}; existing_blocks=${item.existingBlockCount}`
      )
    }
  }

  if (DRY_RUN) {
    const lessonBlockSnapshot = {
      rows_to_write: lessonBlockPlan.rowsToWrite.slice(0, 5).map((row) => ({
        id: row.id,
        lesson_version_id: row.lesson_version_id,
        type: row.type,
        sort_order: row.sort_order,
        content_keys: Object.keys(row.content).sort(),
      })),
      protected_versions: protectedLessonBlockVersions.slice(0, 5).map((row) => ({
        lesson_slug: row.lessonSlug,
        version: row.version,
        lesson_version_id: row.lessonVersionId,
        existing_block_count: row.existingBlockCount,
        reason: row.reason,
      })),
      rows_to_write_total: lessonBlockPlan.rowsToWrite.length,
      protected_versions_total: protectedLessonBlockVersions.length,
    }

    console.log(`[dry-run] lesson_blocks_snapshot=${stableStringify(lessonBlockSnapshot)}`)
  }

  const reports = [
    ['lesson_identities', lessonIdentityPlan.counts],
    ['lesson_versions', lessonVersionPlan.counts],
    ['lesson_blocks', lessonBlockPlan.counts],
    ['lesson_objectives', lessonObjectivePlan.counts],
    ['lesson_prerequisites_v2', lessonPrerequisitePlan.counts],
    ['content_tags', contentTagPlan.counts],
    ['lesson_content_tags', lessonContentTagPlan.counts],
  ] as const

  if (!DRY_RUN) {
    await upsertInBatches({
      client,
      table: 'lesson_identities',
      onConflict: 'slug',
      rows: lessonIdentityPlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'lesson_versions',
      onConflict: 'lesson_id,version',
      rows: lessonVersionPlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'lesson_blocks',
      onConflict: 'id',
      rows: lessonBlockPlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'lesson_objectives',
      onConflict: 'lesson_id,capability_id',
      rows: lessonObjectivePlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'lesson_prerequisites_v2',
      onConflict: 'lesson_id,prerequisite_lesson_id',
      rows: lessonPrerequisitePlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'content_tags',
      onConflict: 'slug',
      rows: contentTagPlan.rowsToWrite,
    })
    await upsertInBatches({
      client,
      table: 'lesson_content_tags',
      onConflict: 'lesson_id,tag_id',
      rows: lessonContentTagPlan.rowsToWrite,
    })
  }

  console.log('[report] Final counts')
  for (const [table, counts] of reports) {
    console.log(`[report] ${formatCounts(table, counts)}`)
  }
  console.log(`[report] lesson_blocks_skipped_versions=${skippedStructuredLessonBlockCount}`)
  console.log(`[report] lesson_blocks_skipped_existing_blocks=${skippedStructuredExistingBlockCount}`)
  console.log(`[report] warnings=${allWarnings.length}`)
  console.log(`[report] force=${FORCE}`)
  console.log(`[report] dry_run=${DRY_RUN}`)
}

main().catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
