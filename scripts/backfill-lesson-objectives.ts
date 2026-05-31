#!/usr/bin/env npx tsx
/**
 * Backfill lesson_objectives for existing canonical lessons.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --dir apps/web exec tsx --tsconfig tsconfig.json ../../scripts/backfill-lesson-objectives.ts
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --dir apps/web exec tsx --tsconfig tsconfig.json ../../scripts/backfill-lesson-objectives.ts --dry-run
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mapLessonTagsToCapabilities } from '@/lib/curriculum/lesson-objective-mapper'
import type { Database } from '@/lib/supabase/database.types'
import { resolveLessonIdentityId } from '@/lib/supabase/canonical'

type Client = Parameters<typeof resolveLessonIdentityId>[0]['client']

function findInstalledWebPackageJson() {
  let current = dirname(fileURLToPath(import.meta.url))

  while (true) {
    const dependencyPackageJson = join(
      current,
      'apps/web/node_modules/@supabase/supabase-js/package.json',
    )

    if (existsSync(dependencyPackageJson)) {
      return join(current, 'apps/web/package.json')
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }

    current = parent
  }

  throw new Error('Could not locate an installed apps/web package with @supabase/supabase-js')
}

const requireFromInstalledWebPackage = createRequire(findInstalledWebPackageJson())
const { createClient } = requireFromInstalledWebPackage('@supabase/supabase-js') as {
  createClient: (
    url: string,
    key: string,
    options: { auth: { autoRefreshToken: boolean; persistSession: boolean } },
  ) => Client
}

type LegacyLessonRow = Pick<Database['public']['Tables']['lessons']['Row'], 'id' | 'tags' | 'content_types'>
type LessonIdentityRow = Pick<
  Database['public']['Tables']['lesson_identities']['Row'],
  'id' | 'slug' | 'domain_ids'
>
type CapabilityRow = Pick<
  Database['public']['Tables']['capabilities']['Row'],
  'id' | 'slug' | 'domain_id'
>
type LessonObjectiveRow = Pick<
  Database['public']['Tables']['lesson_objectives']['Row'],
  'lesson_id' | 'capability_id' | 'weight'
>

const DRY_RUN = process.argv.includes('--dry-run')

interface BackfillReport {
  lessonsProcessed: number
  lessonsModified: number
  lessonsUnchanged: number
  lessonsMissingIdentity: number
  objectivesInserted: number
}

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

function addWarning(target: Map<string, Set<string>>, key: string, lessonSlug: string) {
  const normalizedKey = normalizeValue(key)
  if (!normalizedKey) return

  const lessons = target.get(normalizedKey) ?? new Set<string>()
  lessons.add(lessonSlug)
  target.set(normalizedKey, lessons)
}

function toObjectiveKey(row: LessonObjectiveRow) {
  return `${row.capability_id}:${row.weight}`
}

function objectiveRowsEqual(currentRows: LessonObjectiveRow[], desiredRows: LessonObjectiveRow[]) {
  if (currentRows.length !== desiredRows.length) {
    return false
  }

  const currentKeys = currentRows.map(toObjectiveKey).sort()
  const desiredKeys = desiredRows.map(toObjectiveKey).sort()

  return currentKeys.every((key, index) => key === desiredKeys[index])
}

function buildObjectiveRows(lessonId: string, capabilityIds: string[]): LessonObjectiveRow[] {
  return capabilityIds.map((capabilityId, index) => ({
    lesson_id: lessonId,
    capability_id: capabilityId,
    weight: index === 0 ? 'primary' : 'secondary',
  }))
}

function groupByLessonId(rows: LessonObjectiveRow[]) {
  const grouped = new Map<string, LessonObjectiveRow[]>()

  for (const row of rows) {
    const current = grouped.get(row.lesson_id) ?? []
    current.push(row)
    grouped.set(row.lesson_id, current)
  }

  return grouped
}

function resolveCapabilityRow(params: {
  capabilitySlug: string
  domainIds: string[]
  capabilitiesBySlug: Map<string, CapabilityRow[]>
}) {
  const { capabilitySlug, domainIds, capabilitiesBySlug } = params
  const candidates = capabilitiesBySlug.get(capabilitySlug) ?? []

  if (domainIds.length > 0) {
    const matched = candidates.find((row) => domainIds.includes(row.domain_id))
    if (matched) {
      return matched
    }
  }

  if (candidates.length === 1) {
    return candidates[0] ?? null
  }

  return null
}

function findUnresolvedInputs(inputs: string[]) {
  return uniqueNonEmpty(inputs.filter((input) => mapLessonTagsToCapabilities([input]).length === 0))
}

function printWarnings(header: string, warnings: Map<string, Set<string>>) {
  if (warnings.size === 0) {
    console.log(`${header}: none`)
    return
  }

  console.warn(`${header}:`)

  for (const key of Array.from(warnings.keys()).sort()) {
    const lessons = Array.from(warnings.get(key) ?? []).sort()
    console.warn(`  - ${key}: ${lessons.join(', ')}`)
  }
}

async function loadInitialState(client: Client) {
  const [lessonsResult, identitiesResult, capabilitiesResult, objectivesResult] = await Promise.all([
    client.from('lessons').select('id, tags, content_types').order('id', { ascending: true }),
    client.from('lesson_identities').select('id, slug, domain_ids'),
    client.from('capabilities').select('id, slug, domain_id'),
    client.from('lesson_objectives').select('lesson_id, capability_id, weight'),
  ])

  if (lessonsResult.error) {
    throw new Error(`Failed to load legacy lessons: ${lessonsResult.error.message}`)
  }
  if (identitiesResult.error) {
    throw new Error(`Failed to load lesson identities: ${identitiesResult.error.message}`)
  }
  if (capabilitiesResult.error) {
    throw new Error(`Failed to load capabilities: ${capabilitiesResult.error.message}`)
  }
  if (objectivesResult.error) {
    throw new Error(`Failed to load lesson objectives: ${objectivesResult.error.message}`)
  }

  return {
    lessons: (lessonsResult.data ?? []) as LegacyLessonRow[],
    lessonIdentities: (identitiesResult.data ?? []) as LessonIdentityRow[],
    capabilities: (capabilitiesResult.data ?? []) as CapabilityRow[],
    lessonObjectives: (objectivesResult.data ?? []) as LessonObjectiveRow[],
  }
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { lessons, lessonIdentities, capabilities, lessonObjectives } = await loadInitialState(client)

  const lessonIdentityById = new Map<string, LessonIdentityRow>(
    lessonIdentities.map((row) => [row.id, row]),
  )
  const capabilitiesBySlug = new Map<string, CapabilityRow[]>()
  const existingObjectivesByLessonId = groupByLessonId(lessonObjectives)
  const unresolvedInputWarnings = new Map<string, Set<string>>()
  const unresolvedCapabilityWarnings = new Map<string, Set<string>>()
  const missingIdentityLessons = new Set<string>()
  const dryRunTargets = new Set<string>()

  for (const capability of capabilities) {
    const current = capabilitiesBySlug.get(capability.slug) ?? []
    current.push(capability)
    capabilitiesBySlug.set(capability.slug, current)
  }

  const report: BackfillReport = {
    lessonsProcessed: lessons.length,
    lessonsModified: 0,
    lessonsUnchanged: 0,
    lessonsMissingIdentity: 0,
    objectivesInserted: 0,
  }

  for (const lesson of lessons) {
    const objectiveInputs = uniqueNonEmpty([...(lesson.tags ?? []), ...(lesson.content_types ?? [])])
    const mappedCapabilitySlugs = mapLessonTagsToCapabilities(objectiveInputs)

    const resolvedLessonResult = await resolveLessonIdentityId({
      client,
      lessonIdOrSlug: lesson.id,
    })

    if (resolvedLessonResult.error) {
      throw new Error(
        `Failed to resolve canonical lesson id for legacy lesson "${lesson.id}": ${resolvedLessonResult.error}`,
      )
    }

    const canonicalLessonId = resolvedLessonResult.data
    if (!canonicalLessonId) {
      report.lessonsMissingIdentity += 1
      missingIdentityLessons.add(lesson.id)
      continue
    }

    const canonicalLesson = lessonIdentityById.get(canonicalLessonId)
    const lessonSlug = canonicalLesson?.slug ?? lesson.id
    const unresolvedInputs = findUnresolvedInputs(objectiveInputs)

    for (const unresolvedInput of unresolvedInputs) {
      addWarning(unresolvedInputWarnings, unresolvedInput, lessonSlug)
    }

    const desiredCapabilityIds: string[] = []
    const resolvedCapabilitySlugs: string[] = []

    for (const capabilitySlug of mappedCapabilitySlugs) {
      const capabilityRow = resolveCapabilityRow({
        capabilitySlug,
        domainIds: canonicalLesson?.domain_ids ?? [],
        capabilitiesBySlug,
      })

      if (!capabilityRow) {
        addWarning(unresolvedCapabilityWarnings, capabilitySlug, lessonSlug)
        continue
      }

      desiredCapabilityIds.push(capabilityRow.id)
      resolvedCapabilitySlugs.push(capabilitySlug)
    }

    const desiredRows = buildObjectiveRows(canonicalLessonId, desiredCapabilityIds)
    const existingRows = existingObjectivesByLessonId.get(canonicalLessonId) ?? []

    if (objectiveRowsEqual(existingRows, desiredRows)) {
      report.lessonsUnchanged += 1
      continue
    }

    report.lessonsModified += 1
    report.objectivesInserted += desiredRows.length

    if (DRY_RUN) {
      for (const capabilitySlug of resolvedCapabilitySlugs) {
        dryRunTargets.add(`${lessonSlug}\t${capabilitySlug}`)
      }
      continue
    }

    const { error: deleteError } = await client
      .from('lesson_objectives')
      .delete()
      .eq('lesson_id', canonicalLessonId)

    if (deleteError) {
      throw new Error(
        `Failed to delete existing lesson objectives for canonical lesson "${lessonSlug}": ${deleteError.message}`,
      )
    }

    if (desiredRows.length > 0) {
      const { error: upsertError } = await client
        .from('lesson_objectives')
        .upsert(desiredRows, { onConflict: 'lesson_id,capability_id' })

      if (upsertError) {
        throw new Error(
          `Failed to upsert lesson objectives for canonical lesson "${lessonSlug}": ${upsertError.message}`,
        )
      }
    }

    existingObjectivesByLessonId.set(canonicalLessonId, desiredRows)
  }

  const modeLabel = DRY_RUN ? 'dry-run' : 'run'

  console.log(`[${modeLabel}] lessons processed: ${report.lessonsProcessed}`)
  console.log(`[${modeLabel}] lessons modified: ${report.lessonsModified}`)
  console.log(`[${modeLabel}] lessons unchanged: ${report.lessonsUnchanged}`)
  console.log(`[${modeLabel}] lessons missing canonical identity: ${report.lessonsMissingIdentity}`)
  console.log(
    `[${modeLabel}] objectives ${DRY_RUN ? 'to insert' : 'inserted'}: ${report.objectivesInserted}`,
  )

  if (DRY_RUN) {
    console.log('[dry-run] target lesson_slug -> capability_slug:')

    for (const target of Array.from(dryRunTargets).sort()) {
      const [lessonSlug, capabilitySlug] = target.split('\t')
      console.log(`  - ${lessonSlug} -> ${capabilitySlug}`)
    }
  }

  printWarnings('[warn] unresolved lesson objective inputs', unresolvedInputWarnings)
  printWarnings('[warn] unresolved capability slugs', unresolvedCapabilityWarnings)

  if (missingIdentityLessons.size === 0) {
    console.log('[warn] lessons without canonical identity: none')
  } else {
    console.warn('[warn] lessons without canonical identity:')

    for (const lessonId of Array.from(missingIdentityLessons).sort()) {
      console.warn(`  - ${lessonId}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
