import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/types'

export type TaskProgressRow = Database['public']['Tables']['task_progress']['Row']
export type TaskProgressInsert = Database['public']['Tables']['task_progress']['Insert']
export type TaskProgressStatus = TaskProgressRow['status']

interface GetTaskProgressByPlanOptions {
  client?: SupabaseClient<Database>
  planId: string
}

export async function getTaskProgressByPlan({
  client: providedClient,
  planId,
}: GetTaskProgressByPlanOptions): Promise<ApiResponse<TaskProgressRow[]>> {
  const client = providedClient ?? (await createClient())
  const { data, error } = await client
    .from('task_progress')
    .select('*')
    .eq('plan_id', planId)
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (data ?? []) as TaskProgressRow[], error: null }
}

interface UpsertTaskProgressOptions {
  client?: SupabaseClient<Database>
  planId: string
  taskId: string
  status: TaskProgressStatus
  title?: string | null
  doText?: string | null
  learnText?: string | null
  whyText?: string | null
  relevantLessonIds?: string[]
}

export async function upsertTaskProgress({
  client: providedClient,
  planId,
  taskId,
  status,
  title,
  doText,
  learnText,
  whyText,
  relevantLessonIds,
}: UpsertTaskProgressOptions): Promise<ApiResponse<TaskProgressRow>> {
  const client = providedClient ?? (await createClient())
  const now = new Date()
  const updatedAt = now.toISOString()

  // Look up existing row to determine time tracking fields
  const { data: existing } = await client
    .from('task_progress')
    .select('status, started_at')
    .eq('plan_id', planId)
    .eq('task_id', taskId)
    .maybeSingle()

  const previousStatus = existing?.status ?? 'not-started'
  const previousStartedAt = existing?.started_at ?? null

  // Record started_at when transitioning to in-progress for the first time
  let startedAt: string | null = previousStartedAt
  if (status === 'in-progress' && !previousStartedAt) {
    startedAt = updatedAt
  }

  // Record completed_at and elapsed_minutes when completing
  let completedAt: string | null = null
  let elapsedMinutes: number | null = null
  if (status === 'completed' && previousStatus !== 'completed') {
    completedAt = updatedAt
    if (startedAt) {
      elapsedMinutes = Math.round((now.getTime() - new Date(startedAt).getTime()) / 60_000)
    }
  }

  const payload: TaskProgressInsert = {
    plan_id: planId,
    task_id: taskId,
    status,
    title: title ?? null,
    do_text: doText ?? null,
    learn_text: learnText ?? null,
    why_text: whyText ?? null,
    relevant_lesson_ids: relevantLessonIds ?? [],
    started_at: startedAt,
    completed_at: completedAt,
    elapsed_minutes: elapsedMinutes,
    updated_at: updatedAt,
  }

  const { data, error } = await client
    .from('task_progress')
    .upsert(payload, { onConflict: 'plan_id,task_id' })
    .select('*')
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as TaskProgressRow, error: null }
}

/**
 * Convert DB rows into the client-side Record<taskId, PlannerTaskProgressRecord> format.
 */
export function toTaskProgressRecord(rows: TaskProgressRow[]): Record<string, {
  status: TaskProgressStatus
  title?: string
  do?: string
  learn?: string
  why?: string
  relevantLessonIds?: string[]
  startedAt?: string | null
  completedAt?: string | null
  elapsedMinutes?: number | null
  updatedAt: string
}> {
  const record: Record<string, {
    status: TaskProgressStatus
    title?: string
    do?: string
    learn?: string
    why?: string
    relevantLessonIds?: string[]
    startedAt?: string | null
    completedAt?: string | null
    elapsedMinutes?: number | null
    updatedAt: string
  }> = {}

  for (const row of rows) {
    record[row.task_id] = {
      status: row.status,
      ...(row.title ? { title: row.title } : {}),
      ...(row.do_text ? { do: row.do_text } : {}),
      ...(row.learn_text ? { learn: row.learn_text } : {}),
      ...(row.why_text ? { why: row.why_text } : {}),
      ...(row.relevant_lesson_ids.length > 0 ? { relevantLessonIds: row.relevant_lesson_ids } : {}),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      elapsedMinutes: row.elapsed_minutes,
      updatedAt: row.updated_at,
    }
  }

  return record
}
