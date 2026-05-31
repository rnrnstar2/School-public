import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { MentorMemory } from '@/types'
import { getExternalPlannerConfig } from '@/lib/planner/zai'

type CompactionClient = SupabaseClient<Database>
type ArchiveInsert = Database['public']['Tables']['mentor_memory_archive']['Insert']

const COMPACTION_THRESHOLD = 10

interface CompactionResult {
  compacted: boolean
  archivedCount: number
  error: string | null
}

/**
 * mentor_memory が閾値を超えた場合に AI で圧縮し、
 * 原本を archive テーブルへ移動する。
 */
export async function compactMentorMemories(
  userId: string,
  client: CompactionClient
): Promise<CompactionResult> {
  // 1. 件数チェック
  const { count, error: countError } = await client
    .from('mentor_memory')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError || count === null) {
    return { compacted: false, archivedCount: 0, error: countError?.message ?? 'count failed' }
  }

  if (count <= COMPACTION_THRESHOLD) {
    return { compacted: false, archivedCount: 0, error: null }
  }

  // 2. 全件取得（古い順）
  const { data: memories, error: fetchError } = await client
    .from('mentor_memory')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (fetchError || !memories || memories.length === 0) {
    return { compacted: false, archivedCount: 0, error: fetchError?.message ?? 'fetch failed' }
  }

  const typedMemories = memories as MentorMemory[]

  // 3. AI で要約生成
  const consolidatedBullets = await summarizeMemories(typedMemories)

  // 4. compaction_id を生成
  const compactionId = crypto.randomUUID()

  // 5. 原本を archive へ移動
  const archiveRows: ArchiveInsert[] = typedMemories.map((m) => ({
    original_id: m.id,
    user_id: m.user_id,
    track_id: m.track_id,
    task_id: m.task_id,
    title: m.title,
    bullets: m.bullets,
    source: m.source as ArchiveInsert['source'],
    created_at: m.created_at,
    compaction_id: compactionId,
  }))

  const { error: archiveError } = await client
    .from('mentor_memory_archive')
    .insert(archiveRows)

  if (archiveError) {
    return { compacted: false, archivedCount: 0, error: `archive insert failed: ${archiveError.message}` }
  }

  // 6. 既存 mentor_memory を全削除
  const { error: deleteError } = await client
    .from('mentor_memory')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    return { compacted: false, archivedCount: archiveRows.length, error: `delete failed: ${deleteError.message}` }
  }

  // 7. 圧縮済み 1 件を挿入
  const { error: insertError } = await client
    .from('mentor_memory')
    .insert({
      user_id: userId,
      track_id: null,
      task_id: null,
      title: '学習メモリ統合サマリー',
      bullets: consolidatedBullets,
      source: 'system',
    })

  if (insertError) {
    return { compacted: false, archivedCount: archiveRows.length, error: `consolidated insert failed: ${insertError.message}` }
  }

  return { compacted: true, archivedCount: archiveRows.length, error: null }
}

/**
 * AI を使ってメモリ群を重要度順の箇条書きに圧縮する。
 * AI が利用できない場合はルールベースのフォールバックを使用。
 */
async function summarizeMemories(memories: MentorMemory[]): Promise<string[]> {
  const prompt = buildCompactionPrompt(memories)

  try {
    const result = await callAiForCompaction(prompt)
    if (result && result.length > 0) {
      return result
    }
  } catch {
    // AI 失敗時はフォールバック
  }

  return fallbackSummarize(memories)
}

function buildCompactionPrompt(memories: MentorMemory[]): string {
  const memoryDump = memories.map((m, i) => {
    const bullets = m.bullets.length > 0 ? m.bullets.map((b) => `  - ${b}`).join('\n') : '  (なし)'
    return `[${i + 1}] ${m.title} (source: ${m.source}, ${m.created_at})\n${bullets}`
  }).join('\n\n')

  return [
    'あなたは学習メンターの記憶管理アシスタントです。',
    '以下は学習者についての複数のメモリエントリです。',
    'これらを統合・圧縮し、重複を排除して重要度順に再構成してください。',
    '',
    '保持すべき情報:',
    '- 学習者の好み・スタイル',
    '- 詰まりパターン・苦手分野',
    '- 重要な決定事項・選択',
    '- 現在の学習進捗の要点',
    '- 使用ツール・環境情報',
    '',
    '出力形式: JSON配列（文字列の箇条書き）のみを返してください。',
    '各項目は簡潔に1文で。最大15項目。Markdownやコードフェンスは不要です。',
    '',
    '--- メモリエントリ ---',
    memoryDump,
  ].join('\n')
}

async function callAiForCompaction(prompt: string): Promise<string[] | null> {
  const config = getExternalPlannerConfig()

  if (!config.available) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '上記のメモリエントリを統合してください。{"bullets": ["...", "..."]} 形式で返してください。' },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return null
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = payload.choices?.[0]?.message?.content
    if (!content) {
      return null
    }

    const parsed = JSON.parse(content) as { bullets?: string[] }
    if (Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
      return parsed.bullets.slice(0, 15)
    }

    return null
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/**
 * AI が使えない場合のルールベースフォールバック。
 * 重複排除+最新優先で重要な bullet を抽出。
 */
function fallbackSummarize(memories: MentorMemory[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  // 新しい順に処理（重要情報は最新を優先）
  const reversed = [...memories].reverse()

  for (const memory of reversed) {
    // タイトルを要約行として追加
    const titleKey = memory.title.toLowerCase().trim()
    if (!seen.has(titleKey)) {
      seen.add(titleKey)
      result.push(`【${memory.source}】${memory.title}`)
    }

    // bullets を追加（重複排除）
    for (const bullet of memory.bullets) {
      const bulletKey = bullet.toLowerCase().trim()
      if (!seen.has(bulletKey) && bullet.trim()) {
        seen.add(bulletKey)
        result.push(bullet)
      }
    }
  }

  // 最大 15 件に制限
  return result.slice(0, 15)
}
