import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/types'

export type MilestoneProgressRow = Database['public']['Tables']['milestone_progress']['Row']
export type MilestoneProgressInsert = Database['public']['Tables']['milestone_progress']['Insert']

interface GetMilestoneProgressOptions {
  client?: SupabaseClient<Database>
  planId: string
}

export async function getMilestoneProgressByPlan({
  client: providedClient,
  planId,
}: GetMilestoneProgressOptions): Promise<ApiResponse<MilestoneProgressRow[]>> {
  const client = providedClient ?? (await createClient())
  const { data, error } = await client
    .from('milestone_progress')
    .select('*')
    .eq('plan_id', planId)
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: (data ?? []) as MilestoneProgressRow[], error: null }
}

interface UpsertMilestoneProgressOptions {
  client?: SupabaseClient<Database>
  userId: string
  planId: string
  milestoneId: string
  milestoneTitle?: string | null
  status: 'in-progress' | 'completed'
  evidenceRule?: string | null
  verificationSummary?: string | null
}

export async function upsertMilestoneProgress({
  client: providedClient,
  userId,
  planId,
  milestoneId,
  milestoneTitle,
  status,
  evidenceRule,
  verificationSummary,
}: UpsertMilestoneProgressOptions): Promise<ApiResponse<MilestoneProgressRow>> {
  const client = providedClient ?? (await createClient())
  const now = new Date().toISOString()

  const payload: MilestoneProgressInsert = {
    user_id: userId,
    plan_id: planId,
    milestone_id: milestoneId,
    milestone_title: milestoneTitle ?? null,
    status,
    evidence_rule: evidenceRule ?? null,
    verified_at: status === 'completed' ? now : null,
    verification_summary: verificationSummary ?? null,
    updated_at: now,
  }

  const { data, error } = await client
    .from('milestone_progress')
    .upsert(payload, { onConflict: 'user_id,plan_id,milestone_id' })
    .select('*')
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as MilestoneProgressRow, error: null }
}
