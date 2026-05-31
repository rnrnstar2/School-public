import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ApiResponse, LessonChatMessage, LessonChatSession, LessonChatSummary } from '@/types'

type Client = SupabaseClient<Database>
type ChatRow = Database['public']['Tables']['lesson_chat_messages']['Row']

async function resolveUserId(client: Client) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error) throw new Error(error.message)
  if (!user) throw new Error('認証ユーザーが見つかりません')
  return user.id
}

function createErrorResponse<T>(error: unknown): ApiResponse<T> {
  if (error instanceof Error) return { data: null, error: error.message }
  return { data: null, error: '不明なエラーが発生しました' }
}

function rowToSession(row: ChatRow): LessonChatSession {
  return {
    id: row.id,
    user_id: row.user_id,
    lesson_id: row.lesson_id,
    messages: (row.messages as unknown as LessonChatMessage[]) ?? [],
    summary_key_points: row.summary_key_points ?? [],
    summary_updated_at: row.summary_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getLessonChatSession(
  lessonId: string,
  client: Client,
): Promise<ApiResponse<LessonChatSession | null>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('lesson_chat_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle()

    if (error) throw error
    if (!data) return { data: null, error: null }

    return { data: rowToSession(data as ChatRow), error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function upsertLessonChatMessages(
  lessonId: string,
  messages: LessonChatMessage[],
  client: Client,
): Promise<ApiResponse<LessonChatSession>> {
  try {
    const userId = await resolveUserId(client)
    const now = new Date().toISOString()
    const { data, error } = await client
      .from('lesson_chat_messages')
      .upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          messages: JSON.parse(JSON.stringify(messages)),
          updated_at: now,
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select('*')
      .single()

    if (error) throw error

    return { data: rowToSession(data as ChatRow), error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function updateLessonChatSummary(
  lessonId: string,
  keyPoints: string[],
  client: Client,
): Promise<ApiResponse<LessonChatSession>> {
  try {
    const userId = await resolveUserId(client)
    const now = new Date().toISOString()
    const { data, error } = await client
      .from('lesson_chat_messages')
      .update({
        summary_key_points: keyPoints,
        summary_updated_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .select('*')
      .single()

    if (error) throw error

    return { data: rowToSession(data as ChatRow), error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getRecentLessonChatSummaries(
  limit: number = 5,
  client: Client,
): Promise<ApiResponse<LessonChatSummary[]>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('lesson_chat_messages')
      .select('lesson_id, messages, summary_key_points, summary_updated_at, updated_at')
      .eq('user_id', userId)
      .not('summary_key_points', 'eq', '{}')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const summaries: LessonChatSummary[] = (data ?? []).map((row) => ({
      lesson_id: row.lesson_id,
      lesson_title: '',
      summary_key_points: row.summary_key_points ?? [],
      summary_updated_at: row.summary_updated_at ?? row.updated_at,
      message_count: Array.isArray(row.messages) ? row.messages.length : 0,
    }))

    return { data: summaries, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}
