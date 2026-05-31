import { redirect } from 'next/navigation'
import {
  getCompiledPlanRecord,
  persistCompiledPlanSnapshot,
} from '@/lib/compiled-plans'
import { getLessonFeedbackSummary, getMentorMemories } from '@/lib/learner-models'
import {
  resolveAsk2ActionGoalId,
} from '@/lib/goals/ask2action'
import { buildUnderstandingProfile } from '@/lib/planner/resume-personalization'
import { attachBridgeQuestionToNextAction } from '@/lib/planner/goal-first/bridge-question'
import { buildAtomPlanFromGoalCached, resolveNextAction } from '@/lib/planner/goal-first'
import { shouldRefreshPlanForLeanStart } from '@/lib/planner/goal-first/plan-compiler'
import { fetchUserPersonaIds } from '@/lib/atoms/atom-repository'
import { getTaskProgressByPlan, toTaskProgressRecord } from '@/lib/supabase/task-progress'
import { createClient } from '@/lib/supabase/server'
import type { PlannerTaskProgressRecord } from '@/lib/planner/types'
import type { LearnerState } from '@/types'
import { GoalFirstPlanClient } from './goal-first/goal-first-plan-client'

export default async function PlanPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Preview mode: unauthenticated users go straight to onboarding wizard
  // and can try the AI flow without saving data.
  if (!user) {
    redirect('/plan/onboarding')
  }

  const [activeGoalResult, learnerStateResult, learnerProfileResult, activePlanRecord] =
    await Promise.all([
      supabase
        .from('goals')
        .select('outcome, preferred_tools')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('learner_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('learner_profile')
        .select('available_ai_tools')
        .eq('user_id', user.id)
        .maybeSingle(),
      getCompiledPlanRecord({
        userId: user.id,
        status: 'active',
        client: supabase,
      }),
    ])

  const learnerState = (learnerStateResult.data ?? null) as LearnerState | null
  const activeGoal = (activeGoalResult.data ?? null) as
    | { outcome: string; preferred_tools: string[] | null }
    | null
  const learnerProfile = (learnerProfileResult.data ?? null) as {
    available_ai_tools: string[] | null
  } | null
  // Prefer the current goal's tool selection; fall back to the learner_profile
  // snapshot (populated during intake). Either source may be null in legacy rows.
  const preferredTools =
    activeGoal?.preferred_tools ?? learnerProfile?.available_ai_tools ?? []
  const goalText =
    activePlanRecord?.goal.trim() ??
    activeGoal?.outcome.trim() ??
    learnerState?.target_outcome?.trim() ??
    ''

  // No goal found — send to onboarding
  if (!goalText) {
    redirect('/plan/onboarding')
  }

  // Only reuse the record-level cached plan when it still has steps; an
  // empty-step cached snapshot is a degraded row that should be regenerated.
  const cachedPlanIsUsable =
    activePlanRecord !== null
    && activePlanRecord.plan.steps.length > 0
    && !shouldRefreshPlanForLeanStart(activePlanRecord.plan, {
      skillLevel: learnerState?.skill_level ?? null,
      blockers: learnerState?.blockers ?? [],
      signals: learnerState?.signals ?? {},
    })

  // When the active record is stale/empty, fall through to the seed-based
  // plan cache (buildAtomPlanFromGoalCached), which will either short-circuit
  // on a seed-match row or build fresh and return the seed for persistence.
  let atomPlan
  let planSeed: string | null = null
  let builtFreshPlan = false
  let compiledPlanRecord: { planId: string | null } | null = null

  if (cachedPlanIsUsable) {
    atomPlan = activePlanRecord.plan
  } else {
    const cachedResult = await buildAtomPlanFromGoalCached({
      goal: goalText,
      userId: user.id,
      tools: preferredTools,
      learnerState: {
        skillLevel: learnerState?.skill_level ?? null,
        blockers: learnerState?.blockers ?? [],
        signals: learnerState?.signals ?? {},
      },
    })
    atomPlan = cachedResult.plan
    planSeed = cachedResult.seed
    builtFreshPlan = !cachedResult.fromCache
  }

  if (builtFreshPlan) {
    compiledPlanRecord = await persistCompiledPlanSnapshot({
      client: supabase,
      userId: user.id,
      goal: goalText,
      plan: atomPlan,
      planSeed,
      supersedePlanIds: activePlanRecord ? [activePlanRecord.planId] : [],
    }).catch(() => null)
  }

  const resolvedPlanId = compiledPlanRecord?.planId ?? activePlanRecord?.planId ?? null

  const completedNodeIds = atomPlan.steps
    .filter((step) => step.completedAt)
    .map((step) => step.atomId)
  const nextAction = attachBridgeQuestionToNextAction(
    resolveNextAction(atomPlan, completedNodeIds),
    { goalText },
  )
  const mentorMemoriesResult = await getMentorMemories(6, supabase)
  const feedbackResult = await getLessonFeedbackSummary(supabase)
  const taskProgressResult = resolvedPlanId
    ? await getTaskProgressByPlan({ client: supabase, planId: resolvedPlanId })
    : { data: [], error: null }
  const taskProgress: Record<string, PlannerTaskProgressRecord> = taskProgressResult.data
    ? (toTaskProgressRecord(taskProgressResult.data) as Record<string, PlannerTaskProgressRecord>)
    : {}
  const understanding = buildUnderstandingProfile({
    learnerState,
    mentorMemories: mentorMemoriesResult.data ?? [],
    feedbackEntries: feedbackResult.data ?? [],
    taskProgress,
  })
  const ask2ActionGoalId = await resolveAsk2ActionGoalId({
    userId: user.id,
    planId: resolvedPlanId,
    goalText,
  })

  // TQ-251 / TQ-252 — graduation gate 配線:
  //  - user_personas から先頭 persona を採用 (weight DESC)。無ければ web-builder
  //    を fallback として client/route 側 calc に解決を任せる。
  //  - graduation_decisions から最新行を読んで GraduationGateSelect の初期表示にする。
  const personaIds = await fetchUserPersonaIds(user.id).catch(() => [])
  const personaSlug = personaIds[0] ?? null

  const graduationDecisionResult = await supabase
    .from('graduation_decisions' as never)
    .select('decision, persona_slug, goal_slug')
    .eq('user_id', user.id)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const decisionRow = graduationDecisionResult.data as
    | {
        decision: { kind?: string; label?: string; artifactValue?: string; explanation?: string | null } | null
        persona_slug: string | null
        goal_slug: string | null
      }
    | null

  const initialGraduationDecision =
    decisionRow?.decision && typeof decisionRow.decision === 'object'
      ? {
          kind: decisionRow.decision.kind ?? '',
          label: decisionRow.decision.label ?? '',
          artifactValue: decisionRow.decision.artifactValue ?? '',
          explanation: decisionRow.decision.explanation ?? null,
        }
      : null

  return (
    <div className="theme-page-shell min-h-[calc(100vh-4rem)]">
      <GoalFirstPlanClient
        goalSummary={goalText}
        plan={atomPlan}
        nextAction={nextAction}
        completedNodeIds={completedNodeIds}
        preferredTools={preferredTools}
        goalId={ask2ActionGoalId}
        planId={resolvedPlanId}
        initialNextQuestion={null}
        learnerState={learnerState}
        mentorMemories={mentorMemoriesResult.data ?? []}
        understanding={understanding}
        personaSlug={personaSlug ?? decisionRow?.persona_slug ?? null}
        goalSlug={decisionRow?.goal_slug ?? null}
        initialGraduationDecision={initialGraduationDecision}
      />
    </div>
  )
}
