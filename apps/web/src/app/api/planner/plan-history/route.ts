import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { deserializeAtomCompiledPlan } from '@/lib/compiled-plans'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'
import type { Database } from '@/lib/supabase/database.types'

interface CompiledPlanRow {
  plan_id: string
  goal: string
  parent_plan_id: string | null
  status: string
  steps: unknown
  coverage_score: number | null
  unsupported_capabilities: unknown
  rationale: string | null
  created_at: string
}

interface MilestoneRow {
  id: string
  plan_id: string
  title: string
  description: string | null
  order_index: number
}

async function fetchCompiledPlan(
  userId: string,
  planId: string,
  client: SupabaseClient<Database>,
) {
  const response: {
    data: CompiledPlanRow | null
    error: { message: string } | null
  } = await client
    .from('compiled_plans')
    .select(`
      plan_id,
      goal,
      parent_plan_id,
      status,
      steps,
      coverage_score,
      unsupported_capabilities,
      rationale,
      created_at
    `)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .maybeSingle()

  if (response.error || !response.data) {
    return null
  }

  return response.data
}

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'plan-history', RL_READ)
  if (rlResponse) return rlResponse

  const { searchParams } = new URL(request.url)
  const planId = searchParams.get('planId')

  if (!planId) {
    return jsonResponse(
      { error: 'plan_id_required', message: 'planId は必須です。' },
      { status: 400 },
      request,
    )
  }

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const chain: CompiledPlanRow[] = []

  let currentId: string | null = planId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const row = await fetchCompiledPlan(user.id, currentId, client)
    if (!row) break
    chain.unshift(row)
    currentId = row.parent_plan_id
  }

  let childSearch: string | null = planId
  const forwardVisited = new Set<string>([...visited])

  while (childSearch) {
    const response: {
      data: CompiledPlanRow | null
      error: { message: string } | null
    } = await client
      .from('compiled_plans')
      .select(`
        plan_id,
        goal,
        parent_plan_id,
        status,
        steps,
        coverage_score,
        unsupported_capabilities,
        rationale,
        created_at
      `)
      .eq('user_id', user.id)
      .eq('parent_plan_id', childSearch)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const row = response.data
    if (response.error || !row || forwardVisited.has(row.plan_id)) break
    forwardVisited.add(row.plan_id)
    chain.push(row)
    childSearch = row.plan_id
  }

  const history = chain.map((plan, index) => {
    const normalizedPlan = deserializeAtomCompiledPlan({
      goal: plan.goal,
      steps: plan.steps,
      coverageScore: plan.coverage_score,
      unsupportedCapabilities: plan.unsupported_capabilities,
      rationale: plan.rationale,
    })

    return {
      id: plan.plan_id,
      title: plan.goal,
      goal: plan.goal,
      summary: plan.rationale,
      version: index + 1,
      parent_plan_id: plan.parent_plan_id,
      is_active: plan.status === 'active',
      created_at: plan.created_at,
      milestones: normalizedPlan.milestones.map((milestone, milestoneIndex) => ({
        id: milestone.id,
        plan_id: plan.plan_id,
        title: milestone.title,
        description: milestone.description,
        order_index: milestoneIndex,
      })) satisfies MilestoneRow[],
    }
  })

  return cachedJsonResponse({ data: history }, { maxAge: 10, swr: 60 }, request)
}
