/**
 * TQ-241: Plan-step rationale extraction.
 *
 * Given an AtomCompiledPlan (TQ-215 / TQ-220 schema), produces a per-step
 * StepRationale used by the learner-facing "なぜこのレッスン?" drilldown UI.
 *
 * Phase 1 scope: deterministic extraction from compiled_plans only.
 * Sub-agent run summaries (agent_runs) are optional and may be empty —
 * the API route fills them in when the table is populated.
 */

import type { AtomCompiledPlan } from './plan-compiler'

/**
 * The kind of rationale that explains why a step was placed in the plan.
 *
 * - `matched_atom` — Mode A (TQ-215) leaf was matched to an existing atom
 *   in the catalog by the AI. Persona × goal_tag retrieval surfaced it.
 * - `delegation_node` — Mode A leaf had no atom in the catalog, so the
 *   AI emitted a delegation node with a recommended tool + brief.
 * - `persona_anchor` — Anchor-driven plan source. Step came from a
 *   persona anchor's ordered atom list (no AI Mode A involved).
 */
export type StepRationaleType = 'matched_atom' | 'delegation_node' | 'persona_anchor'

export interface StepSubAgentRun {
  /** Stable run id from decision_ledger.agent_runs.id (uuid) when available. */
  runId: string
  /** Agent name. Free-form for forward-compat; conductor sub-agents recommended. */
  agentName: string
  /** Short, learner-safe summary. Raw prompts / CoT must NEVER be put here. */
  summary: string
  /** Wall-clock duration in milliseconds, when measurable. */
  durationMs: number | null
  /** Model identifier (e.g. "claude-opus-4-7", "gpt-5"). Optional. */
  model: string | null
}

export interface StepRationale {
  /** Plan step id — equal to atomId in the AtomCompiledPlan domain. */
  stepId: string
  /** atomId from the plan, or null when this is a pure delegation node. */
  atomId: string | null
  /** Categorical reason. */
  rationaleType: StepRationaleType
  /** 1-3 lines, learner-readable. Built deterministically (no LLM). */
  why: string
  /** TQ-220 tool id (from ai-tools-catalog). Null when not assigned. */
  recommendedTool: string | null
  /** TQ-220 delegation prompt. Null when no recommendation. */
  delegationBrief: string | null
  /** Optional sub-agent run trace. Phase 1 ships empty by default. */
  subAgentRuns: StepSubAgentRun[]
}

/**
 * `delegation:<leaf-id>` is the synthetic atomId convention used by
 * `combineGoalTreeWithAtomMatches` in `ai-atom-compiler.ts` (TQ-215).
 * We re-create the predicate here instead of importing private helpers.
 */
function isDelegationStep(atomId: string): boolean {
  return atomId.startsWith('delegation:')
}

/**
 * Build the deterministic `why` line for a step.
 *
 * Rules of thumb (kept compact so the drawer can render 3 lines max):
 * - matched_atom: `「<goal>」に対して既存レッスン「<title>」が一致しました`
 * - delegation_node: `<tool> に任せる作業として AI が新規に組み立てました`
 * - persona_anchor: `<personaタグ> 向けの初手シーケンスから採用しました`
 */
function buildWhyLine(params: {
  goal: string
  step: AtomCompiledPlan['steps'][number]
  rationaleType: StepRationaleType
}): string {
  const { goal, step, rationaleType } = params
  const trimmedRationale = step.rationale?.trim() ?? ''

  if (rationaleType === 'delegation_node') {
    const toolHint = step.recommendedTool ?? 'AIツール'
    const base = `${toolHint} に任せる作業として AI が新規に組み立てました。`
    return trimmedRationale ? `${base}\n根拠: ${trimmedRationale}` : base
  }

  if (rationaleType === 'persona_anchor') {
    const base = `あなたのペルソナ向け初手シーケンスから「${step.title}」を採用しました。`
    return trimmedRationale ? `${base}\n根拠: ${trimmedRationale}` : base
  }

  // matched_atom
  const base = `「${goal}」に対して既存レッスン「${step.title}」が一致しました。`
  return trimmedRationale ? `${base}\n根拠: ${trimmedRationale}` : base
}

/**
 * Classify a single plan step.
 *
 * `planSource` is the AtomCompiledPlan.source field. When the plan is
 * anchor-sourced, we credit anchor for the step UNLESS the step is a
 * synthetic delegation node (in which case delegation wins, since the
 * anchor list does not produce delegation nodes).
 */
export function classifyStepRationale(
  step: AtomCompiledPlan['steps'][number],
  planSource: AtomCompiledPlan['source'],
): StepRationaleType {
  if (isDelegationStep(step.atomId)) {
    return 'delegation_node'
  }
  if (planSource === 'anchor') {
    return 'persona_anchor'
  }
  return 'matched_atom'
}

/**
 * Extract rationales for every step of a compiled plan.
 *
 * Pure / synchronous. The API route may post-process the result to attach
 * `subAgentRuns` from `decision_ledger.agent_runs`.
 */
export function extractStepRationales(plan: AtomCompiledPlan): StepRationale[] {
  return plan.steps.map((step) => {
    const rationaleType = classifyStepRationale(step, plan.source)
    const atomId = isDelegationStep(step.atomId) ? null : step.atomId

    return {
      stepId: step.atomId,
      atomId,
      rationaleType,
      why: buildWhyLine({ goal: plan.goal, step, rationaleType }),
      recommendedTool: step.recommendedTool ?? null,
      delegationBrief: step.delegationBrief ?? null,
      subAgentRuns: [],
    }
  })
}

/**
 * Lookup helper: pull the rationale entry for a single step by its id.
 * Returns `null` when the step is not part of the plan — callers should
 * surface a graceful "根拠を取得できません" message in that case.
 */
export function findStepRationale(
  plan: AtomCompiledPlan,
  stepId: string,
): StepRationale | null {
  const rationales = extractStepRationales(plan)
  return rationales.find((entry) => entry.stepId === stepId) ?? null
}
