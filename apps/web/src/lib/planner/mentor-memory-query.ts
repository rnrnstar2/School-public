import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type PlannerMentorMemoryClient = Pick<SupabaseClient<Database>, 'from'>
type MentorMemoryRow = Database['public']['Tables']['mentor_memory']['Row']
type MentorMemoryArchiveRow = Database['public']['Tables']['mentor_memory_archive']['Row']

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function toBulletLines(title: string | null | undefined, bullets: string[] | null | undefined) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : ''
  return uniqueStrings(bullets ?? []).map((bullet) =>
    normalizedTitle ? `${normalizedTitle}: ${bullet}`.slice(0, 500) : bullet.slice(0, 500),
  )
}

export async function fetchPlannerMentorMemoryBullets(
  client: PlannerMentorMemoryClient,
  userId: string,
  limit = 10,
): Promise<string[]> {
  const [currentResult, archivedResult] = await Promise.all([
    client
      .from('mentor_memory')
      .select('title, bullets, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
    client
      .from('mentor_memory_archive')
      .select('title, bullets, source, created_at, archived_at')
      .eq('user_id', userId)
      .order('archived_at', { ascending: false })
      .limit(4),
  ])

  if (currentResult.error) {
    throw currentResult.error
  }
  if (archivedResult.error) {
    throw archivedResult.error
  }

  const currentRows = ((currentResult.data ?? []) as MentorMemoryRow[])
    .slice()
    .sort((left, right) => {
      const leftPriority =
        left.source === 'system' || left.title.includes('統合')
          ? 0
          : 1
      const rightPriority =
        right.source === 'system' || right.title.includes('統合')
          ? 0
          : 1

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      return right.created_at.localeCompare(left.created_at)
    })
  const archivedRows = (archivedResult.data ?? []) as MentorMemoryArchiveRow[]

  return uniqueStrings([
    ...currentRows.flatMap((row) => toBulletLines(row.title, row.bullets)),
    ...archivedRows.flatMap((row) => toBulletLines(row.title, row.bullets)),
  ]).slice(0, limit)
}
