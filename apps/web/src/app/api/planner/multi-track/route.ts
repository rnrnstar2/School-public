import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'
import {
  computeTrackProgress,
  analyzeCrossTrackSkills,
  recommendNextTracks,
  buildCrossTrackTimeline,
} from '@/lib/curriculum/multi-track'
import { classifyGoalDomains } from '@/lib/planner/goal-first'
import { normalizeGoal } from '@/lib/planner/goal-first'

type CanonicalGoalRow = Pick<
  Database['public']['Tables']['goals']['Row'],
  'id' | 'outcome' | 'status' | 'domain_ids' | 'created_at'
>

/**
 * GET /api/planner/multi-track
 *
 * Returns multi-track dashboard data:
 * - Track progress summaries
 * - Cross-track skill analysis
 * - AI-enhanced track recommendations
 * - Cross-track goal timeline
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'multi-track:get', RL_READ)
  if (rlResponse) return rlResponse

  const client = await createClient()

  // Fetch learner state
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です' },
      { status: 401 },
      request,
    )
  }

  // Fetch learner_state
  const { data: learnerState } = await client
    .from('learner_state')
    .select('active_track_id')
    .eq('user_id', user.id)
    .maybeSingle()

  // Fetch completed task IDs from task_progress
  const { data: completedTasks } = await client
    .from('task_progress')
    .select('task_id, relevant_lesson_ids')
    .eq('status', 'completed')

  // Collect completed lesson IDs from task_progress
  const completedLessonIds: string[] = []
  if (completedTasks) {
    for (const task of completedTasks) {
      if (task.relevant_lesson_ids) {
        completedLessonIds.push(...task.relevant_lesson_ids)
      }
    }
  }

  const { data: allDomainsData } = await client
    .from('domains')
    .select('id, slug, label, description, icon, sort_order')
    .order('sort_order', { ascending: true })
  const allDomains = allDomainsData ?? []

  // Fetch user's goals from the canonical goals table
  const { data: userGoals } = await client
    .from('goals')
    .select('id, outcome, status, domain_ids, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const canonicalGoals: CanonicalGoalRow[] = userGoals ?? []

  // Map goals to domains using classifyGoalDomains
  const graduatedDomainSlugs: string[] = []
  const trackIdByGoal: Record<string, string | null> = {}

  for (const g of canonicalGoals) {
    const classification = classifyGoalDomains(normalizeGoal(g.outcome))
    trackIdByGoal[g.id] = classification.primary !== 'mixed' ? classification.primary : null
    if (g.status === 'completed' && classification.primary !== 'mixed') {
      graduatedDomainSlugs.push(classification.primary)
    }
  }

  const activeTrackId = learnerState?.active_track_id ?? null

  // Use domain slugs as track IDs for progress computation
  const trackProgress = computeTrackProgress(
    completedLessonIds,
    graduatedDomainSlugs,
    activeTrackId,
  )

  const skillAnalysis = analyzeCrossTrackSkills(completedLessonIds)

  // Extract strengths/weaknesses from mentor_memory
  const { data: memories } = await client
    .from('mentor_memory')
    .select('title, bullets')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const strengths: string[] = []
  const weaknesses: string[] = []
  if (memories) {
    for (const mem of memories) {
      const titleLower = mem.title.toLowerCase()
      if (titleLower.includes('強み') || titleLower.includes('strength') || titleLower.includes('得意')) {
        strengths.push(...mem.bullets)
      }
      if (titleLower.includes('弱み') || titleLower.includes('weakness') || titleLower.includes('苦手') || titleLower.includes('課題')) {
        weaknesses.push(...mem.bullets)
      }
    }
  }

  const recommendations = recommendNextTracks(
    completedLessonIds,
    activeTrackId,
    graduatedDomainSlugs,
    { strengths, weaknesses },
  )

  // Build timeline from canonical goals
  // Map 'abandoned' -> 'archived' since GoalHistory doesn't have 'abandoned'
  const mapStatus = (s: string): 'active' | 'completed' | 'archived' =>
    s === 'abandoned' ? 'archived' : (s as 'active' | 'completed' | 'archived')

  const timelineGoals = canonicalGoals.map((g) => ({
    id: g.id,
    user_id: user.id,
    goal: g.outcome,
    plan_id: null,
    status: mapStatus(g.status),
    started_at: g.created_at,
    ended_at: null,
    created_at: g.created_at,
    updated_at: g.created_at,
  }))
  const timeline = buildCrossTrackTimeline(timelineGoals, trackIdByGoal)

  return cachedJsonResponse(
    {
      data: {
        trackProgress,
        skillAnalysis,
        recommendations,
        timeline,
        domains: allDomains,
      },
    },
    {},
    request,
  )
}
