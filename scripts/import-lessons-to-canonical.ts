#!/usr/bin/env npx tsx
/**
 * import-lessons-to-canonical.ts
 *
 * Reads all 4 track files (web-builder, ai-automation, ai-content-creator, ai-app-builder)
 * and generates an idempotent SQL migration that inserts every LessonChunk into the
 * canonical tables defined in migration 027:
 *   lesson_identities, lesson_versions, lesson_blocks,
 *   lesson_prerequisites_v2, lesson_assets
 *
 * Usage:
 *   cd apps/web && npx tsx ../../scripts/import-lessons-to-canonical.ts \
 *     > supabase/migrations/028_import_existing_lessons.sql
 *
 * Or from repo root:
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/import-lessons-to-canonical.ts \
 *     > apps/web/supabase/migrations/028_import_existing_lessons.sql
 */

import * as crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// We import the track data through the app's TS aliases (@/...).
// The script must be run with tsx from apps/web (or with --tsconfig pointing
// to apps/web/tsconfig.json) so the @/* alias resolves correctly.
// ---------------------------------------------------------------------------
import { webBuilderTrack } from '@/lib/curriculum/web-builder-track'
import { aiAutomationTrack } from '@/lib/curriculum/ai-automation-track'
import { aiContentCreatorTrack } from '@/lib/curriculum/ai-content-creator-track'
import { aiAppBuilderTrack } from '@/lib/curriculum/ai-app-builder-track'
import { lessonMediaRefsByLessonId } from '@/lib/curriculum/lesson-media'
import type { LessonChunk } from '@/lib/curriculum/web-builder-track'
import type { LessonMediaRef } from '@/lib/curriculum/lesson-media'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed UUID v5 namespace for deterministic lesson UUIDs */
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // DNS namespace (well-known)

/** Track-id → domain slug mapping */
const TRACK_TO_DOMAIN: Record<string, string> = {
  'web-builder-ai': 'web',
  'ai-automation': 'automation',
  'ai-content-creator': 'content',
  'ai-app-builder': 'app',
}

// ---------------------------------------------------------------------------
// UUID v5 helper (deterministic from a name string)
// ---------------------------------------------------------------------------
function uuidv5(name: string, namespace: string): string {
  // Parse namespace UUID into bytes
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const nameBytes = Buffer.from(name, 'utf8')

  const hash = crypto.createHash('sha1')
  hash.update(nsBytes)
  hash.update(nameBytes)
  const digest = hash.digest()

  // Set version (5) and variant bits per RFC 4122
  digest[6] = (digest[6] & 0x0f) | 0x50 // version 5
  digest[8] = (digest[8] & 0x3f) | 0x80 // variant 10

  const hex = digest.toString('hex').slice(0, 32)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------
function esc(val: string): string {
  return val.replace(/'/g, "''")
}

function jsonLiteral(obj: unknown): string {
  return `'${esc(JSON.stringify(obj))}'::jsonb`
}

// ---------------------------------------------------------------------------
// Collect all lessons
// ---------------------------------------------------------------------------
interface TrackDef {
  track: { id: string; lessons: LessonChunk[] }
}

const allTracks: TrackDef[] = [
  { track: webBuilderTrack },
  { track: aiAutomationTrack },
  { track: aiContentCreatorTrack },
  { track: aiAppBuilderTrack },
]

// Deduplicate lessons by id (just in case)
const seenIds = new Set<string>()
const allLessons: { lesson: LessonChunk; trackId: string }[] = []

for (const { track } of allTracks) {
  for (const lesson of track.lessons) {
    if (seenIds.has(lesson.id)) {
      process.stderr.write(`[WARN] Duplicate lesson id: ${lesson.id} — skipping\n`)
      continue
    }
    seenIds.add(lesson.id)
    allLessons.push({ lesson, trackId: track.id })
  }
}

process.stderr.write(`[INFO] Found ${allLessons.length} lessons across ${allTracks.length} tracks\n`)

// ---------------------------------------------------------------------------
// Build a slug→UUID lookup (needed for prerequisites)
// ---------------------------------------------------------------------------
const slugToUuid = new Map<string, string>()
for (const { lesson } of allLessons) {
  slugToUuid.set(lesson.id, uuidv5(lesson.id, NAMESPACE))
}

// ---------------------------------------------------------------------------
// Generate SQL
// ---------------------------------------------------------------------------
const lines: string[] = []

function emit(sql: string) {
  lines.push(sql)
}

emit('-- ==========================================================')
emit('-- Migration 028: Import existing lessons into canonical tables')
emit('-- Auto-generated by scripts/import-lessons-to-canonical.ts')
emit(`-- Generated at: ${new Date().toISOString()}`)
emit(`-- Total lessons: ${allLessons.length}`)
emit('-- ==========================================================')
emit('')
emit('BEGIN;')
emit('')

// We need the domain UUIDs. Rather than hardcode them, we look them up at
// migration time via a CTE.
emit('-- Domain UUID lookup (inserted by migration 027)')
emit("DO $$")
emit("DECLARE")
emit("  v_domain_web        uuid;")
emit("  v_domain_automation uuid;")
emit("  v_domain_content    uuid;")
emit("  v_domain_app        uuid;")
emit("BEGIN")
emit("  SELECT id INTO v_domain_web        FROM domains WHERE slug = 'web';")
emit("  SELECT id INTO v_domain_automation FROM domains WHERE slug = 'automation';")
emit("  SELECT id INTO v_domain_content    FROM domains WHERE slug = 'content';")
emit("  SELECT id INTO v_domain_app        FROM domains WHERE slug = 'app';")
emit("")

// Helper: resolve domain variable name from trackId
function domainVar(trackId: string): string {
  const domain = TRACK_TO_DOMAIN[trackId]
  if (!domain) throw new Error(`Unknown trackId: ${trackId}`)
  const map: Record<string, string> = {
    web: 'v_domain_web',
    automation: 'v_domain_automation',
    content: 'v_domain_content',
    app: 'v_domain_app',
  }
  return map[domain]!
}

// ---------------------------------------------------------------------------
// 1. lesson_identities
// ---------------------------------------------------------------------------
emit('  -- ========== lesson_identities ==========')
for (const { lesson, trackId } of allLessons) {
  const uuid = slugToUuid.get(lesson.id)!
  const dVar = domainVar(trackId)
  emit(
    `  INSERT INTO lesson_identities (id, slug, title, domain_ids)` +
    ` VALUES ('${uuid}', '${esc(lesson.id)}', '${esc(lesson.title)}', ARRAY[${dVar}])` +
    ` ON CONFLICT (slug) DO NOTHING;`
  )
}
emit('')

// ---------------------------------------------------------------------------
// 2. lesson_versions  (version 1 for each)
// ---------------------------------------------------------------------------
emit('  -- ========== lesson_versions ==========')

// We need version UUIDs for blocks/assets. Generate them deterministically too.
function versionUuid(lessonSlug: string): string {
  return uuidv5(`${lessonSlug}::v1`, NAMESPACE)
}

for (const { lesson } of allLessons) {
  const lessonUuid = slugToUuid.get(lesson.id)!
  const verUuid = versionUuid(lesson.id)
  const status = lesson.status || 'published'
  emit(
    `  INSERT INTO lesson_versions (id, lesson_id, version, status, published_at)` +
    ` VALUES ('${verUuid}', '${lessonUuid}', 1, '${status}', now())` +
    ` ON CONFLICT (lesson_id, version) DO NOTHING;`
  )
}
emit('')

// ---------------------------------------------------------------------------
// 3. lesson_blocks
// ---------------------------------------------------------------------------
emit('  -- ========== lesson_blocks ==========')

let globalBlockIdx = 0

function blockUuid(lessonSlug: string, blockIndex: number): string {
  return uuidv5(`${lessonSlug}::block::${blockIndex}`, NAMESPACE)
}

for (const { lesson } of allLessons) {
  const verUuid = versionUuid(lesson.id)
  let sortOrder = 0

  // summary → markdown block
  if (lesson.summary) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { text: lesson.summary, role: 'summary' }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'markdown', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // whyThisMatters → callout block (variant: why)
  if (lesson.whyThisMatters) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { variant: 'why', text: lesson.whyThisMatters }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'callout', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // howToDo → markdown block
  if (lesson.howToDo) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { text: lesson.howToDo, role: 'how_to' }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'markdown', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // content → markdown block (main body)
  if (lesson.content) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { text: lesson.content, role: 'body' }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'markdown', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // commonBlockers → callout block (variant: warning)
  if (lesson.commonBlockers) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { variant: 'warning', text: lesson.commonBlockers }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'callout', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // confirmationMethod → rubric block
  if (lesson.confirmationMethod) {
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = { criteria: lesson.confirmationMethod }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', 'rubric', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }

  // exercises → code_prompt blocks
  if (lesson.exercises && lesson.exercises.length > 0) {
    for (const ex of lesson.exercises) {
      const bId = blockUuid(lesson.id, globalBlockIdx++)
      const content = {
        exerciseId: ex.id,
        title: ex.title,
        instruction: ex.instruction,
        language: ex.language,
        starterCode: ex.starterCode,
        solutionHint: ex.solutionHint,
        validationPatterns: ex.validationPatterns,
      }
      emit(
        `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
        ` VALUES ('${bId}', '${verUuid}', 'code_prompt', ${sortOrder++}, ${jsonLiteral(content)})` +
        ` ON CONFLICT DO NOTHING;`
      )
    }
  }

  // media_refs → image/video blocks
  const mediaRefs: LessonMediaRef[] = [
    ...(lesson.media_refs || []),
    ...(lessonMediaRefsByLessonId[lesson.id] || []),
  ]
  // Dedupe by url
  const seenUrls = new Set<string>()
  for (const ref of mediaRefs) {
    if (seenUrls.has(ref.url)) continue
    seenUrls.add(ref.url)
    const blockType = ref.type === 'video' ? 'video' : 'image'
    const bId = blockUuid(lesson.id, globalBlockIdx++)
    const content = {
      url: ref.url,
      alt: ref.alt || '',
      caption: ref.caption || '',
    }
    emit(
      `  INSERT INTO lesson_blocks (id, lesson_version_id, type, sort_order, content)` +
      ` VALUES ('${bId}', '${verUuid}', '${blockType}', ${sortOrder++}, ${jsonLiteral(content)})` +
      ` ON CONFLICT DO NOTHING;`
    )
  }
}
emit('')

// ---------------------------------------------------------------------------
// 4. lesson_prerequisites_v2
// ---------------------------------------------------------------------------
emit('  -- ========== lesson_prerequisites_v2 ==========')

for (const { lesson } of allLessons) {
  const lessonUuid = slugToUuid.get(lesson.id)!

  // prerequisiteIds → strength: required
  for (const preId of lesson.prerequisiteIds || []) {
    const preUuid = slugToUuid.get(preId)
    if (!preUuid) {
      process.stderr.write(`[WARN] prerequisite "${preId}" not found for lesson "${lesson.id}" — skipping\n`)
      continue
    }
    emit(
      `  INSERT INTO lesson_prerequisites_v2 (lesson_id, prerequisite_lesson_id, strength)` +
      ` VALUES ('${lessonUuid}', '${preUuid}', 'required')` +
      ` ON CONFLICT (lesson_id, prerequisite_lesson_id) DO NOTHING;`
    )
  }

  // recommendedBeforeIds → strength: recommended
  for (const recId of lesson.recommendedBeforeIds || []) {
    const recUuid = slugToUuid.get(recId)
    if (!recUuid) {
      process.stderr.write(`[WARN] recommended "${recId}" not found for lesson "${lesson.id}" — skipping\n`)
      continue
    }
    emit(
      `  INSERT INTO lesson_prerequisites_v2 (lesson_id, prerequisite_lesson_id, strength)` +
      ` VALUES ('${lessonUuid}', '${recUuid}', 'recommended')` +
      ` ON CONFLICT (lesson_id, prerequisite_lesson_id) DO NOTHING;`
    )
  }

  // mutuallyReinforcingIds → strength: reinforcing
  for (const mutId of lesson.mutuallyReinforcingIds || []) {
    const mutUuid = slugToUuid.get(mutId)
    if (!mutUuid) {
      process.stderr.write(`[WARN] reinforcing "${mutId}" not found for lesson "${lesson.id}" — skipping\n`)
      continue
    }
    emit(
      `  INSERT INTO lesson_prerequisites_v2 (lesson_id, prerequisite_lesson_id, strength)` +
      ` VALUES ('${lessonUuid}', '${mutUuid}', 'reinforcing')` +
      ` ON CONFLICT (lesson_id, prerequisite_lesson_id) DO NOTHING;`
    )
  }
}
emit('')

// ---------------------------------------------------------------------------
// 5. lesson_assets
// ---------------------------------------------------------------------------
emit('  -- ========== lesson_assets ==========')

for (const { lesson } of allLessons) {
  const verUuid = versionUuid(lesson.id)

  const mediaRefs: LessonMediaRef[] = [
    ...(lesson.media_refs || []),
    ...(lessonMediaRefsByLessonId[lesson.id] || []),
  ]

  const seenUrls = new Set<string>()
  for (const ref of mediaRefs) {
    if (seenUrls.has(ref.url)) continue
    seenUrls.add(ref.url)
    const assetType = ref.type === 'video' ? 'video' : 'image'
    const assetUuid = uuidv5(`${lesson.id}::asset::${ref.url}`, NAMESPACE)
    emit(
      `  INSERT INTO lesson_assets (id, lesson_version_id, type, url, alt_text, caption)` +
      ` VALUES ('${assetUuid}', '${verUuid}', '${assetType}', '${esc(ref.url)}', '${esc(ref.alt || '')}', '${esc(ref.caption || '')}')` +
      ` ON CONFLICT DO NOTHING;`
    )
  }
}
emit('')

emit('END;')
emit('$$ LANGUAGE plpgsql;')
emit('')
emit('COMMIT;')

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const sql = lines.join('\n')
process.stdout.write(sql + '\n')

process.stderr.write(`[INFO] SQL generation complete — ${lines.length} lines\n`)
process.stderr.write(`[INFO] Lessons: ${allLessons.length}\n`)
process.stderr.write(`[INFO] Redirect stdout to a .sql file to save.\n`)
