import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { classifyGoalDomains, normalizeGoal } from '@/lib/planner/goal-first'
import { deepMergeSignals, type MergeableValue } from '@/lib/planner/signals-merge'
import type { LearnerState } from '@/types'

// ── Schemas ──

const goalCreateSchema = z.object({
  goal: z.string().min(1, 'ゴールを入力してください').max(500),
  tools: z.array(z.string()).optional().default([]),
  os: z.string().optional().default(''),
  cliFamiliarity: z.string().optional().default('none'),
  programmingExperience: z.string().optional().default('none'),
  aiExperience: z.string().optional().default('none'),
  audience: z.string().optional().default(''),
  deadline: z.string().optional().default(''),
  learningStyle: z.string().nullish(),
})

function inferSkillLevel(experience: string) {
  const normalized = experience.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (/(実務|仕事|案件|普段から|慣れて|運用|制作したことがある|複数回)/.test(normalized)) {
    return 'advanced' as const
  }

  if (/(少し|少々|触った|やったことがある|授業|学んだ|チュートリアル|写経)/.test(normalized)) {
    return 'intermediate' as const
  }

  return 'beginner' as const
}

function normalizeOperatingSystem(value: string) {
  const normalized = value.trim().toLowerCase()

  if (normalized.includes('mac')) {
    return 'macOS'
  }

  if (normalized.includes('windows')) {
    return 'Windows'
  }

  if (normalized.includes('linux') || normalized.includes('ubuntu')) {
    return 'Linux'
  }

  return value.trim() || null
}

function buildExperienceSummary(params: {
  programmingExperience: string
  aiExperience: string
}) {
  const parts: string[] = []

  if (params.programmingExperience.trim()) {
    parts.push(`プログラミング経験: ${params.programmingExperience.trim()}`)
  }

  if (params.aiExperience.trim()) {
    parts.push(`AIツール経験: ${params.aiExperience.trim()}`)
  }

  return parts.length > 0 ? parts.join(' / ') : null
}

// ── GET /api/goals ──

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'goals:get', RL_READ)
  if (rlResponse) return rlResponse

  const client = await createClient()
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です' },
      { status: 401 },
      request,
    )
  }

  // Try goals table first (may not exist until migration is applied)
  try {
    const { data: goals, error } = await client
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && goals) {
      return jsonResponse({ data: goals }, {}, request)
    }
  } catch {
    // goals table may not exist — fall through to learner_state
  }

  // Fallback: read from learner_state
  type LearnerStateRow = Database['public']['Tables']['learner_state']['Row']
  const { data: learnerStateData } = await client
    .from('learner_state')
    .select('target_outcome, updated_at, created_at')
    .eq('user_id', user.id)
    .maybeSingle()
  const learnerState = learnerStateData as Pick<LearnerStateRow, 'target_outcome' | 'updated_at' | 'created_at'> | null

  const fallbackGoal = learnerState?.target_outcome
    ? [
        {
          id: 'fallback',
          user_id: user.id,
          goal: learnerState.target_outcome,
          status: 'active',
          created_at: learnerState.updated_at ?? learnerState.created_at,
        },
      ]
    : []

  return jsonResponse({ data: fallbackGoal }, {}, request)
}

// ── POST /api/goals ──

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'goals:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, goalCreateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  // Preview mode: no auth → return a synthetic goal id without persistence
  if (!user) {
    return jsonResponse(
      {
        data: {
          id: null,
          preview: true,
          goal: body.goal.trim(),
        },
      },
      {},
      request,
    )
  }

  const goalText = body.goal.trim()
  const audience = body.audience.trim()
  const deadline = body.deadline.trim()
  const normalizedGoal = normalizeGoal(goalText)
  const classifiedGoal = classifyGoalDomains(normalizedGoal)
  const { data: domainsData } = await client
    .from('domains')
    .select('id, slug')
    .order('sort_order', { ascending: true })
  const goalDomainIds = new Set(
    (domainsData ?? [])
      .filter((domain) => classifiedGoal.domains.some((candidate) => candidate.slug === domain.slug))
      .map((domain) => domain.id),
  )
  const operatingSystem = normalizeOperatingSystem(body.os)
  const skillLevel = inferSkillLevel(body.programmingExperience)
  const experienceSummary = buildExperienceSummary({
    programmingExperience: body.programmingExperience,
    aiExperience: body.aiExperience,
  })

  let goalId: string | null = null
  try {
    try {
      const { error: archiveError } = await client
        .from('goals')
        .update({ status: 'abandoned' })
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (archiveError) {
        console.warn('[goals] failed to archive active goals before insert:', archiveError.message)
      }
    } catch (archiveError) {
      console.warn('[goals] failed to archive active goals before insert:', archiveError)
    }

    const goalInsert: Database['public']['Tables']['goals']['Insert'] = {
      user_id: user.id,
      outcome: goalText,
      structured_intent: {
        language: normalizedGoal.language,
        implied_domains: normalizedGoal.implied_domains,
        primary_domain: classifiedGoal.primary,
        tool_mentions: normalizedGoal.tool_mentions,
        onboarding: {
          operating_system: operatingSystem,
          cli_familiarity: body.cliFamiliarity,
          programming_experience: body.programmingExperience,
          ai_experience: body.aiExperience,
        },
      },
      domain_ids: Array.from(goalDomainIds),
      current_skill: skillLevel,
      preferred_tools: body.tools,
      environment: operatingSystem,
      learning_style: body.learningStyle?.trim() || body.aiExperience.trim() || null,
      constraints: null,
      status: 'active',
    }

    const { data: createdGoal } = await client
      .from('goals')
      .insert(goalInsert)
      .select('id')
      .single()

    if (createdGoal) {
      goalId = createdGoal.id
    }
  } catch {
    // Canonical goals table may not be available in older environments.
  }

  let signals: LearnerState['signals'] | undefined
  if (audience || deadline) {
    const { data: existingLearnerState } = await client
      .from('learner_state')
      .select('signals')
      .eq('user_id', user.id)
      .maybeSingle()

    const existingSignals =
      (existingLearnerState?.signals as LearnerState['signals'] | null | undefined) ?? undefined
    const nextSignals: LearnerState['signals'] = {
      ...(audience ? { audience } : {}),
      ...(deadline ? { deadline } : {}),
    }

    signals = deepMergeSignals(
      existingSignals as MergeableValue,
      nextSignals as MergeableValue,
    ) as LearnerState['signals']
  }

  const learnerStatePayload: Database['public']['Tables']['learner_state']['Insert'] = {
    user_id: user.id,
    target_outcome: goalText,
    skill_level: skillLevel,
    ...(signals
      ? {
          signals:
            signals as Database['public']['Tables']['learner_state']['Insert']['signals'],
        }
      : {}),
  }

  // Always update learner_state as well (backward compatibility)
  const { error: upsertError } = await client
    .from('learner_state')
    .upsert(learnerStatePayload, { onConflict: 'user_id' })

  if (upsertError) {
    return jsonResponse(
      { error: 'save_failed', message: 'ゴールの保存に失敗しました' },
      { status: 500 },
      request,
    )
  }

  // Also update learner_profile with tool/environment info
  try {
    await client
      .from('learner_profile')
      .upsert(
        {
          user_id: user.id,
          experience_summary: experienceSummary,
          operating_system: operatingSystem,
          cli_familiarity: (body.cliFamiliarity as 'none' | 'basic' | 'comfortable' | null) || null,
          available_ai_tools: body.tools,
        },
        { onConflict: 'user_id' },
      )
  } catch {
    // Non-fatal: profile update failure doesn't block goal creation
  }

  return jsonResponse(
    {
      data: {
        id: goalId ?? 'learner_state',
        goal: goalText,
        saved: true,
      },
    },
    { status: 201 },
    request,
  )
}
