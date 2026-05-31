import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { applyRateLimit, RL_READ, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { nextGoalsSchema } from '@/lib/api/schemas'
import { buildSuggestionForDomain, resolveTargetDomains, type NextGoalSuggestion } from '@/lib/planner/next-goals'
import type { Capability } from '@/types/domain'

type GoalRow = Pick<
  Database['public']['Tables']['goals']['Row'],
  'id' | 'outcome' | 'domain_ids'
>
type AssessmentRow = Pick<
  Database['public']['Tables']['competency_assessments']['Row'],
  'capability_id' | 'score'
>

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'next-goals', RL_READ)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, nextGoalsSchema)
  if ('error' in parsed) return parsed.error
  const {
    track_id: currentTrackId,
    goal_summary: goalSummary,
  } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const [domainsResult, assessmentsResult, goalResult] = await Promise.all([
    supabase
      .from('domains')
      .select('id, slug, label, description, icon, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('competency_assessments')
      .select('capability_id, score')
      .eq('user_id', user.id),
    supabase
      .from('goals')
      .select('id, outcome, domain_ids')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const domains = (domainsResult.data ?? []).map((domain) => ({
      ...domain,
      description: domain.description ?? '',
      sort_order: domain.sort_order ?? 0,
    }))
  const assessments: AssessmentRow[] = assessmentsResult.data ?? []
  const assessedMap = new Map(
    assessments.map((assessment) => [assessment.capability_id, assessment.score]),
  )
  const activeGoal: GoalRow | null = goalResult.data
  const activeGoalTrackSlug = activeGoal?.domain_ids?.[0]
    ? domains.find((domain) => domain.id === activeGoal.domain_ids[0])?.slug ?? null
    : null
  const currentTrackSlug = currentTrackId ?? activeGoalTrackSlug

  const targetDomains = resolveTargetDomains({
    domains,
    activeGoalOutcome: activeGoal?.outcome ?? null,
    activeGoalDomainIds: activeGoal?.domain_ids ?? [],
    fallbackTrackId: currentTrackId ?? null,
    goalSummary: goalSummary ?? null,
  })

  const capabilityResults = await Promise.all(
    targetDomains.map(async (domain) => {
      const capsResult = await supabase
        .from('capabilities')
        .select('id, domain_id, slug, label, description, rubric_criteria')
        .eq('domain_id', domain.id)
      const capabilities: Capability[] = capsResult.data ?? []
      return {
        domain,
        capabilities,
      }
    }),
  )

  const suggestions = capabilityResults
    .map((entry, index) => buildSuggestionForDomain({
      domain: entry.domain,
      capabilities: entry.capabilities,
      assessedMap,
      currentTrackId: currentTrackSlug,
      index,
    }))
    .filter((suggestion): suggestion is NextGoalSuggestion => Boolean(suggestion))
    .sort((left, right) => {
      const leftCount = left.capabilityLabels?.length ?? 0
      const rightCount = right.capabilityLabels?.length ?? 0
      if (rightCount !== leftCount) return rightCount - leftCount
      return left.trackLabel.localeCompare(right.trackLabel, 'ja')
    })

  return jsonResponse(
    {
      suggestions: suggestions.slice(0, 5),
      active_goal_domain: activeGoal ? activeGoal.domain_ids : [],
    },
    {},
    request,
  )
}
