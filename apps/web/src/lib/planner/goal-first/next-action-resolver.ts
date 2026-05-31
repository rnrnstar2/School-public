/**
 * PLAN-009: Next Action Resolver
 *
 * Determines the next action for a learner given their compiled plan
 * and set of completed node IDs. Finds the first non-completed node
 * whose prerequisites are all satisfied.
 */

import type { AtomCompiledPlan } from './plan-compiler'
import type { CompiledPlan, NextAction } from './types'
import type { RecompileResult } from './ai-recompile'

function isAtomCompiledPlan(plan: CompiledPlan | AtomCompiledPlan): plan is AtomCompiledPlan {
  return 'coverageScore' in plan
}

/**
 * Resolve the next action for a learner within a compiled plan.
 *
 * Algorithm:
 * 1. Build a set of completed node IDs
 * 2. Walk nodes in sort order
 * 3. Skip completed nodes
 * 4. For each incomplete node, check if all prerequisite nodes are completed
 * 5. Return the first node whose prerequisites are met
 * 6. If all nodes are completed, return 'graduated'
 * 7. If no node is available (all blocked), return 'blocked'
 *
 * @param plan - The compiled learning plan
 * @param completedNodeIds - Array of node IDs the learner has finished
 * @returns NextAction indicating what the learner should do next
 */
export function resolveNextAction(
  plan: CompiledPlan | AtomCompiledPlan,
  completedNodeIds: string[],
): NextAction {
  if (!isAtomCompiledPlan(plan) && plan.metadata.supportStatus === 'coming-soon') {
    return {
      type: 'blocked',
      message: plan.metadata.supportMessage ?? plan.summary,
    }
  }

  const completedSet = new Set(completedNodeIds)

  if (isAtomCompiledPlan(plan)) {
    if (plan.steps.length === 0) {
      return {
        type: 'blocked',
        message: 'プランにレッスンがまだ割り当てられていません。プランを再生成してください。',
      }
    }

    const incompleteSteps = plan.steps.filter((step) => !completedSet.has(step.atomId))

    if (incompleteSteps.length === 0) {
      if (plan.unsupportedCapabilities.length > 0) {
        return {
          type: 'review',
          message: `完了済みです。未充足 capability: ${plan.unsupportedCapabilities.join('、')}`,
        }
      }

      return {
        type: 'graduated',
        message: 'おめでとうございます! プラン内の全 atom を完了しました。',
      }
    }

    for (const step of incompleteSteps) {
      const prereqsMet = step.prerequisiteAtomIds.every((prerequisiteAtomId) =>
        completedSet.has(prerequisiteAtomId),
      )

      if (prereqsMet) {
        return {
          type: 'lesson',
          nodeId: step.atomId,
          lessonId: step.atomId,
          message: step.title,
        }
      }
    }

    const firstBlocked = incompleteSteps[0]
    const unmetPrereqs = firstBlocked?.prerequisiteAtomIds.filter(
      (atomId) => !completedSet.has(atomId),
    ) ?? []

    return {
      type: 'blocked',
      nodeId: firstBlocked?.atomId,
      message: `${incompleteSteps.length}件の atom が前提条件待ちです。まず ${unmetPrereqs.join('、') || '未完了の前提 atom'} を進めてください。`,
    }
  }

  // Check if all nodes are completed
  if (plan.nodes.length === 0) {
    return {
      type: 'blocked',
      message: 'プランにレッスンがまだ割り当てられていません。プランを再生成してください。',
    }
  }

  const incompleteNodes = plan.nodes.filter((n) => !completedSet.has(n.id))

  if (incompleteNodes.length === 0) {
    // Check if there are gap tasks remaining
    if (plan.gapTasks.length > 0) {
      return {
        type: 'review',
        message: `全レッスンを完了しました。ただし、以下の領域でまだカバーできていないスキルがあります: ${plan.gapTasks.map((g) => g.title).join('、')}`,
      }
    }

    return {
      type: 'graduated',
      message: 'おめでとうございます! プラン内の全レッスンを完了しました。',
    }
  }

  // Sort incomplete nodes by sortOrder
  const sortedIncomplete = [...incompleteNodes].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  // Find first node whose prerequisites are all met
  for (const node of sortedIncomplete) {
    const prereqsMet = node.prerequisiteNodeIds.every((prereqId) =>
      completedSet.has(prereqId),
    )

    if (prereqsMet) {
      return {
        type: 'lesson',
        nodeId: node.id,
        lessonId: node.lessonId,
        message: node.lessonTitle,
      }
    }
  }

  // All remaining nodes are blocked by unmet prerequisites
  const blockedCount = sortedIncomplete.length
  const firstBlocked = sortedIncomplete[0]
  const unmetPrereqs = firstBlocked.prerequisiteNodeIds.filter(
    (id) => !completedSet.has(id),
  )

  return {
    type: 'blocked',
    nodeId: firstBlocked.id,
    message: `${blockedCount}件のレッスンが前提条件待ちです。まず未完了の前提レッスン(${unmetPrereqs.length}件)を完了してください。`,
  }
}

/**
 * TQ-204: Today's tasks resolver
 *
 * Returns the top-N incomplete tasks for "today" view on /plan page.
 *
 * NOTE on scheduling: the current schema does not carry a `scheduled_for`
 * field per atom/node. To satisfy the public-beta DoD ("見える今日のタスク
 * 一覧") without DB migration, we treat the next few ready incomplete entries (in
 * the plan's natural ordering) as "today's tasks". The `today` option is a
 * forward-compatibility hook for when scheduling lands.
 */
export interface TodaysTask {
  /** atom id (AtomCompiledPlan) or node id (CompiledPlan) */
  id: string
  /** lesson id usable by start handlers */
  lessonId: string
  /** display title */
  title: string
  /** short description / rationale */
  description: string
  /** estimated minutes */
  estimatedMinutes: number
  /** true when all prerequisites are completed */
  ready: boolean
}

const TODAYS_TASKS_DEFAULT_LIMIT = 3

export function resolveTodaysTasks(
  plan: CompiledPlan | AtomCompiledPlan,
  completedNodeIds: string[],
  options?: {
    limit?: number
    /**
     * Reserved for future `scheduled_for` filtering. Currently unused —
     * accepted so callers can wire today's date without a later API break.
     */
    today?: Date
  },
): TodaysTask[] {
  void options?.today

  if (!isAtomCompiledPlan(plan) && plan.metadata.supportStatus === 'coming-soon') {
    return []
  }

  const rawLimit = options?.limit ?? TODAYS_TASKS_DEFAULT_LIMIT
  const limit = Math.max(1, Math.floor(rawLimit))
  const completedSet = new Set(completedNodeIds)

  if (isAtomCompiledPlan(plan)) {
    if (plan.steps.length === 0) return []

    const incomplete = plan.steps.filter(
      (step) => !completedSet.has(step.atomId) && step.skipped !== true,
    )

    const tasks = incomplete.map((step) => ({
      id: step.atomId,
      lessonId: step.atomId,
      title: step.title,
      description: step.rationale,
      estimatedMinutes: step.estimatedMinutes,
      ready: step.prerequisiteAtomIds.every((prerequisiteAtomId) =>
        completedSet.has(prerequisiteAtomId),
      ),
    }))
    const readyTasks = tasks.filter((task) => task.ready)

    return (readyTasks.length > 0 ? readyTasks : tasks).slice(0, limit)
  }

  if (plan.nodes.length === 0) return []

  const sortedIncomplete = [...plan.nodes]
    .filter((node) => !completedSet.has(node.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const tasks = sortedIncomplete.map((node) => ({
    id: node.id,
    lessonId: node.lessonId,
    title: node.lessonTitle,
    description: node.rationale,
    estimatedMinutes: node.estimatedMinutes,
    ready: node.prerequisiteNodeIds.every((prereqId) => completedSet.has(prereqId)),
  }))
  const readyTasks = tasks.filter((task) => task.ready)

  return (readyTasks.length > 0 ? readyTasks : tasks).slice(0, limit)
}

/**
 * Resolve next action with optional AI-driven recompilation on 'blocked'.
 *
 * Behaves identically to {@link resolveNextAction} except that when the
 * learner would be blocked and `autoRecompile` is true, it invokes the
 * provided `onBlocked` callback (which should call recompilePlanWithAI).
 * If the callback returns a successful RecompileResult, a `plan_revised`
 * action is returned so the caller can refresh the UI / plan view.
 */
export async function resolveNextActionWithRecompile(
  plan: CompiledPlan | AtomCompiledPlan,
  completedNodeIds: string[],
  options?: {
    autoRecompile?: boolean
    onBlocked?: (
      blockedNodeIds: string[],
    ) => Promise<RecompileResult | null>
  },
): Promise<NextAction> {
  const baseAction = resolveNextAction(plan, completedNodeIds)

  if (baseAction.type !== 'blocked') return baseAction
  if (!options?.autoRecompile || !options.onBlocked) return baseAction

  const completedSet = new Set(completedNodeIds)
  const blockedNodeIds = isAtomCompiledPlan(plan)
    ? plan.steps
        .filter((step) => !completedSet.has(step.atomId))
        .map((step) => step.atomId)
    : plan.nodes
        .filter((n) => !completedSet.has(n.id))
        .map((n) => n.id)

  try {
    const result = await options.onBlocked(blockedNodeIds)
    if (result) {
      return {
        type: 'plan_revised',
        message: 'プランを再構成しました。新しい次のステップを確認してください。',
        revisionId: result.revisionId ?? undefined,
      }
    }
  } catch {
    // Swallow — fall back to original blocked action.
  }

  return baseAction
}
