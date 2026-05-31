#!/usr/bin/env npx tsx

import { createServiceClient } from '@/lib/supabase/service'
import {
  syncLegacyLessonToCanonical,
  type LegacyLessonRecord,
} from '@/lib/curriculum/legacy-to-canonical-sync'

async function main() {
  const client = createServiceClient()

  if (!client) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const { data, error } = await client
    .from('lessons')
    .select(
      [
        'id',
        'title',
        'content',
        'video_url',
        'course_id',
        'order_index',
        'track_id',
        'module_id',
        'difficulty_level',
        'tags',
        'prerequisite_ids',
        'content_types',
        'why_this_matters',
        'how_to_do',
        'common_blockers',
        'confirmation_method',
      ].join(', '),
    )
    .order('order_index', { ascending: true })

  if (error) {
    throw new Error(`Failed to load lessons: ${error.message}`)
  }

  const lessons = (data ?? []) as unknown as LegacyLessonRecord[]

  for (const lesson of lessons) {
    const result = await syncLegacyLessonToCanonical({
      client,
      lesson,
    })

    console.log(
      JSON.stringify({
        lessonId: lesson.id,
        canonicalLessonId: result.lessonId,
        canonicalLessonVersionId: result.lessonVersionId,
        blockCount: result.blockCount,
        objectiveCount: result.objectiveCount,
        contentTagCount: result.contentTagCount,
      }),
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
