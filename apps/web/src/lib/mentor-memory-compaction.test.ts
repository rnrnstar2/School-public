import test from 'node:test'
import assert from 'node:assert/strict'
import type { MentorMemory, MentorMemorySource } from '@/types'

// Import the module under test — we test the fallback summarizer and
// compaction orchestration via a mock Supabase client.

// Re-implement fallbackSummarize inline since it is not exported.
// This verifies the algorithm without needing to mock AI.
function fallbackSummarize(memories: MentorMemory[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const reversed = [...memories].reverse()

  for (const memory of reversed) {
    const titleKey = memory.title.toLowerCase().trim()
    if (!seen.has(titleKey)) {
      seen.add(titleKey)
      result.push(`【${memory.source}】${memory.title}`)
    }

    for (const bullet of memory.bullets) {
      const bulletKey = bullet.toLowerCase().trim()
      if (!seen.has(bulletKey) && bullet.trim()) {
        seen.add(bulletKey)
        result.push(bullet)
      }
    }
  }

  return result.slice(0, 15)
}

function makeMemory(
  overrides: Partial<MentorMemory> & { title: string }
): MentorMemory {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    track_id: null,
    task_id: null,
    bullets: [],
    source: 'planner' as MentorMemorySource,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

test('fallbackSummarize deduplicates and limits to 15 items', () => {
  const memories: MentorMemory[] = Array.from({ length: 20 }, (_, i) =>
    makeMemory({
      title: `メモリ ${i}`,
      bullets: [`bullet-${i}-a`, `bullet-${i}-b`],
      source: 'planner',
    })
  )

  const result = fallbackSummarize(memories)
  assert.ok(result.length <= 15, `Expected <= 15 items, got ${result.length}`)
  assert.ok(result.length > 0)
})

test('fallbackSummarize removes duplicate bullets', () => {
  const memories: MentorMemory[] = [
    makeMemory({ title: 'メモ1', bullets: ['goal: サイト制作', '環境: Mac'] }),
    makeMemory({ title: 'メモ2', bullets: ['goal: サイト制作', '進捗: 50%'] }),
  ]

  const result = fallbackSummarize(memories)
  const goalBullets = result.filter((b) => b === 'goal: サイト制作')
  assert.equal(goalBullets.length, 1, 'Duplicate bullet should appear only once')
})

test('fallbackSummarize prioritizes newer memories', () => {
  const memories: MentorMemory[] = [
    makeMemory({
      title: '古いメモ',
      bullets: ['old-info'],
      created_at: '2026-01-01T00:00:00Z',
    }),
    makeMemory({
      title: '新しいメモ',
      bullets: ['new-info'],
      created_at: '2026-03-01T00:00:00Z',
    }),
  ]

  const result = fallbackSummarize(memories)
  // 新しいメモが先に来る（reverseして処理するため）
  assert.ok(result[0].includes('新しいメモ'), 'Newer memory title should come first')
})

// --- compactMentorMemories integration test with mock client ---

function createMockClient(memories: MentorMemory[]) {
  const archived: unknown[] = []
  let currentMemories = [...memories]

  const mockFrom = (table: string) => {
    if (table === 'mentor_memory') {
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
          eq: (_col: string, _val: string) => {
            if (opts?.head) {
              return Promise.resolve({ count: currentMemories.length, error: null })
            }
            return {
              order: () => ({
                // select without head: return data
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: currentMemories, error: null }),
              }),
            }
          },
        }),
        insert: (row: unknown) => ({
          select: () => ({
            single: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => {
            currentMemories = []
            return Promise.resolve({ error: null })
          },
        }),
      }
    }

    if (table === 'mentor_memory_archive') {
      return {
        insert: (rows: unknown[]) => {
          archived.push(...rows)
          return Promise.resolve({ error: null })
        },
      }
    }

    return {}
  }

  return {
    from: mockFrom,
    archived,
    getCurrentMemories: () => currentMemories,
  }
}

test('compactMentorMemories skips when count <= threshold', async () => {
  // Dynamic import to avoid module-level side effects
  const { compactMentorMemories } = await import('@/lib/mentor-memory-compaction')

  const memories = Array.from({ length: 5 }, (_, i) =>
    makeMemory({ title: `メモ ${i}` })
  )

  const client = createMockClient(memories)
  const result = await compactMentorMemories('user-1', client as never)

  assert.equal(result.compacted, false)
  assert.equal(result.archivedCount, 0)
  assert.equal(result.error, null)
})

test('compactMentorMemories compacts when count > threshold using fallback', async () => {
  // Clear all ZAI env vars to force fallback path
  const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']
  const origValues = ENV_KEYS.map((k) => [k, process.env[k]] as const)
  for (const k of ENV_KEYS) delete process.env[k]

  try {
    const { compactMentorMemories } = await import('@/lib/mentor-memory-compaction')

    const memories = Array.from({ length: 12 }, (_, i) =>
      makeMemory({
        title: `メモ ${i}`,
        bullets: [`情報-${i}`],
        source: 'planner',
      })
    )

    const client = createMockClient(memories)
    const result = await compactMentorMemories('user-1', client as never)

    assert.equal(result.compacted, true)
    assert.equal(result.archivedCount, 12)
    assert.equal(result.error, null)
    assert.equal(client.archived.length, 12)
  } finally {
    for (const [k, v] of origValues) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})
