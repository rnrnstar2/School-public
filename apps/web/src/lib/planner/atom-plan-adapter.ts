import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import type { CompiledPlan } from '@/lib/planner/goal-first/types'
import type {
  PlannerContinuationPlan,
  PlannerContinuationStep,
  PlannerPlanMilestone,
} from '@/lib/planner/types'

export function isAtomCompiledPlan(plan: unknown): plan is AtomCompiledPlan {
  return typeof plan === 'object' && plan !== null && Array.isArray((plan as { steps?: unknown[] }).steps)
    && 'coverageScore' in (plan as Record<string, unknown>)
  }

export function atomPlanToCompiledPlan(plan: AtomCompiledPlan): CompiledPlan {
  const milestoneById = new Map(plan.milestones.map((milestone) => [milestone.id, milestone]))
  const nodes = plan.steps.map((step, index) => ({
    id: step.atomId,
    lessonId: step.atomId,
    lessonTitle: step.title,
    milestoneId: step.milestoneId ?? plan.milestones[0]?.id ?? 'milestone-001',
    sortOrder: index,
    rationale: step.rationale,
    difficulty: 'beginner' as const,
    estimatedMinutes: step.estimatedMinutes,
    prerequisiteNodeIds: step.prerequisiteAtomIds,
  }))

  return {
    status: plan.steps.length > 0 ? 'ready' : 'candidates_unavailable',
    title: `「${plan.goal}」学習プラン`,
    summary: plan.rationale,
    milestones: plan.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      nodeIds: milestone.atomIds,
    })),
    nodes,
    gapTasks: plan.unsupportedCapabilities.map((capability, index) => ({
      id: `gap-${index + 1}`,
      title: `${capability} を満たす atom が不足しています`,
      description: `${capability} をカバーする atom が現在の計画に含まれていません。`,
      missingCapability: capability,
    })),
    metadata: {
      totalEstimatedMinutes: nodes.reduce((total, node) => total + node.estimatedMinutes, 0),
      lessonCount: nodes.length,
      domainsCovered: Array.from(
        new Set(
          plan.steps
            .map((step) => step.milestoneId)
            .filter((milestoneId): milestoneId is string => Boolean(milestoneId))
            .map((milestoneId) => milestoneById.get(milestoneId)?.title ?? milestoneId),
        ),
      ),
    },
  }
}

function buildAtomStep(step: AtomCompiledPlan['steps'][number], index: number, milestoneTitle: string): PlannerContinuationStep {
  return {
    id: step.atomId,
    title: step.title,
    description: step.rationale || `${step.title} を進めます。`,
    outcome: `${step.title} を完了する`,
    purpose: step.rationale || `${step.title} に必要な基礎を固める`,
    completionCriteria: `${step.title} を終えて、次の atom に進める状態にします。`,
    artifacts: [step.title],
    requirement: 'required',
    estimateMinutes: step.estimatedMinutes,
    milestoneId: step.milestoneId ?? `milestone-${index + 1}`,
    lessonRefs: [
      {
        lessonId: step.atomId,
        title: step.title,
        summary: step.rationale || `${step.title} の atom です。`,
        estimatedMinutes: step.estimatedMinutes,
        moduleTitle: milestoneTitle,
        whyNow: step.rationale,
      },
    ],
  }
}

export function atomPlanToContinuationPlan(plan: AtomCompiledPlan): PlannerContinuationPlan {
  const milestoneById = new Map(plan.milestones.map((milestone) => [milestone.id, milestone]))
  const steps = plan.steps.map((step, index) =>
    buildAtomStep(
      step,
      index,
      step.milestoneId
        ? (milestoneById.get(step.milestoneId)?.title ?? step.milestoneId)
        : 'Atom plan',
    ),
  )
  const stepsByMilestoneId = new Map(steps.map((step) => [step.milestoneId ?? step.id, [] as PlannerContinuationStep[]]))

  for (const step of steps) {
    const key = step.milestoneId ?? step.id
    const current = stepsByMilestoneId.get(key) ?? []
    current.push(step)
    stepsByMilestoneId.set(key, current)
  }

  const milestones: PlannerPlanMilestone[] = plan.milestones.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    artifactGoal: `${milestone.title} を完了する`,
    evidenceRule: `${milestone.title} を説明できる状態にする`,
    steps: stepsByMilestoneId.get(milestone.id) ?? [],
  }))

  return {
    kind: 'inline-plan',
    title: `「${plan.goal}」学習プラン`,
    summary: plan.rationale,
    ctaLabel: 'このプランで進める',
    steps,
    milestones,
  }
}
