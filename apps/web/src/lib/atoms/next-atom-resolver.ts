import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Client = SupabaseClient<Database>

interface LoadedCompiledPlan {
  planId: string
  stepsRaw: unknown[]
  steps: NormalizedStep[]
}

interface NormalizedStep {
  index: number
  atomId: string | null
  atomTitle: string | null
  milestoneId: string | null
  completedAt: string | null
}

export interface NextAtomResult {
  kind: 'next' | 'milestone_complete' | 'plan_complete' | 'no_active_plan'
  nextAtomId?: string
  nextAtomTitle?: string
  milestoneId?: string | null
  progress: { completed: number; total: number }
}

interface ResolveNextAtomOptions {
  userId: string
  justCompletedAtomId: string
  client?: Client | null
  now?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSteps(value: unknown): NormalizedStep[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((entry, index) => {
    const record = isRecord(entry) ? entry : {}
    const atomId = typeof record.atom_id === 'string' ? record.atom_id.trim() : ''
    const atomTitle = typeof record.atom_title === 'string' ? record.atom_title.trim() : ''
    const milestoneId = typeof record.milestone_id === 'string' ? record.milestone_id.trim() : ''
    const completedAt = typeof record.completed_at === 'string' ? record.completed_at : null

    return {
      index,
      atomId: atomId || null,
      atomTitle: atomTitle || null,
      milestoneId: milestoneId || null,
      completedAt,
    }
  })
}

async function getClient(client?: Client | null) {
  if (client) {
    return client
  }

  return createClient()
}

async function loadActiveCompiledPlan(params: {
  client?: Client | null
  userId: string
}): Promise<LoadedCompiledPlan | null> {
  const client = await getClient(params.client)
  const { data, error } = await client
    .from('compiled_plans')
    .select('plan_id, steps')
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    plan_id: string
    steps: unknown
  }

  const stepsRaw = Array.isArray(row.steps) ? row.steps : []

  return {
    planId: row.plan_id,
    stepsRaw,
    steps: normalizeSteps(stepsRaw),
  }
}

function countTotalSteps(steps: NormalizedStep[]) {
  return steps.filter((step) => step.atomId).length
}

function countCompletedSteps(steps: NormalizedStep[]) {
  return steps.filter((step) => step.atomId && step.completedAt).length
}

function findNextIncompleteStep(steps: NormalizedStep[], fromIndex: number) {
  for (const step of steps) {
    if (step.index < fromIndex) {
      continue
    }

    if (step.atomId && !step.completedAt) {
      return step
    }
  }

  return null
}

function buildUpdatedStepsRaw(params: {
  stepsRaw: unknown[]
  currentStep: NormalizedStep
  now: string
}) {
  return params.stepsRaw.map((entry, index) => {
    if (index !== params.currentStep.index) {
      return entry
    }

    const record = isRecord(entry) ? entry : {}
    return {
      ...record,
      completed_at: params.now,
    }
  })
}

function buildResult(params: {
  currentStep: NormalizedStep | null
  currentIndex: number
  steps: NormalizedStep[]
}): NextAtomResult {
  const total = countTotalSteps(params.steps)
  const completed = countCompletedSteps(params.steps)
  const nextStep = findNextIncompleteStep(
    params.steps,
    params.currentIndex >= 0 ? params.currentIndex + 1 : 0,
  )

  if (!nextStep) {
    return {
      kind: 'plan_complete',
      milestoneId: params.currentStep?.milestoneId ?? null,
      progress: { completed, total },
    }
  }

  if (
    params.currentStep?.milestoneId &&
    params.currentStep.milestoneId !== nextStep.milestoneId
  ) {
    return {
      kind: 'milestone_complete',
      nextAtomId: nextStep.atomId ?? undefined,
      nextAtomTitle: nextStep.atomTitle ?? nextStep.atomId ?? undefined,
      milestoneId: params.currentStep.milestoneId,
      progress: { completed, total },
    }
  }

  return {
    kind: 'next',
    nextAtomId: nextStep.atomId ?? undefined,
    nextAtomTitle: nextStep.atomTitle ?? nextStep.atomId ?? undefined,
    milestoneId: nextStep.milestoneId,
    progress: { completed, total },
  }
}

async function resolveNextAtomInternal(
  options: ResolveNextAtomOptions & { persist: boolean },
): Promise<NextAtomResult> {
  const plan = await loadActiveCompiledPlan({
    client: options.client,
    userId: options.userId,
  })

  if (!plan) {
    return {
      kind: 'no_active_plan',
      progress: { completed: 0, total: 0 },
    }
  }

  const currentIndex = plan.steps.findIndex((step) => step.atomId === options.justCompletedAtomId)
  const currentStep = currentIndex >= 0 ? plan.steps[currentIndex] ?? null : null

  if (!currentStep || currentStep.completedAt) {
    return buildResult({
      currentStep,
      currentIndex,
      steps: plan.steps,
    })
  }

  const now = options.now ?? new Date().toISOString()
  const updatedStepsRaw = buildUpdatedStepsRaw({
    stepsRaw: plan.stepsRaw,
    currentStep,
    now,
  })

  if (options.persist) {
    const client = await getClient(options.client)
    const { error } = await client
      .from('compiled_plans')
      .update({ steps: updatedStepsRaw as Json })
      .eq('plan_id', plan.planId)
      .eq('user_id', options.userId)

    if (error) {
      throw error
    }
  }

  return buildResult({
    currentStep: {
      ...currentStep,
      completedAt: now,
    },
    currentIndex,
    steps: normalizeSteps(updatedStepsRaw),
  })
}

export async function resolveNextAtom(
  options: ResolveNextAtomOptions,
): Promise<NextAtomResult> {
  return resolveNextAtomInternal({
    ...options,
    persist: true,
  })
}

export async function previewNextAtom(
  options: ResolveNextAtomOptions,
): Promise<NextAtomResult> {
  return resolveNextAtomInternal({
    ...options,
    persist: false,
  })
}
