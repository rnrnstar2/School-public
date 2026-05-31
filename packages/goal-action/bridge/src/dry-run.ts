import { buildIntakeBundle, deriveLessonFactorySlug } from './intake'
import {
  BRIDGE_STAGES,
  type BridgePlan,
  type BridgeStage,
  type LessonDevProposalInput,
  type StagePlanEntry,
} from './schema'
import { stageCommand } from './stage-commands'

export type DryRunInput = {
  proposal: LessonDevProposalInput
  curriculumArchitectureSlug?: string
  /** Stages to skip (e.g. `['media']`). Will be kept in plan with `skip=true`. */
  skipStages?: BridgeStage[]
  /** Injected clock for deterministic tests. */
  now?: () => Date
}

const FORBIDDEN_STAGES = new Set<string>(['publish'])

/**
 * Pure function — builds the execution plan without touching the pipeline.
 *
 * The returned `stages` array is always `intake, context-fetch, draft,
 * critique, media, eval`. `publish` is never included — attempting to
 * schedule it is treated as a programming error elsewhere and is rejected
 * defensively here too.
 */
export function dryRun(input: DryRunInput): BridgePlan {
  const { proposal, curriculumArchitectureSlug } = input
  const now = input.now ?? (() => new Date())

  const intake = buildIntakeBundle(proposal, {
    curriculumArchitectureSlug,
  })
  const slug = deriveLessonFactorySlug(proposal)
  const skip = new Set<BridgeStage>(input.skipStages ?? ['media'])

  const entries: StagePlanEntry[] = BRIDGE_STAGES.map((stage) => {
    if (FORBIDDEN_STAGES.has(stage)) {
      // Defence in depth: BRIDGE_STAGES is the only source and does not
      // include 'publish', but if someone edits it upstream this assert
      // surfaces the mistake loudly.
      throw new Error(
        `dryRun refused to schedule forbidden stage '${stage}'. publish is owner-manual only.`,
      )
    }
    // `stageCommand` is the single source of truth for how a bridge stage
    // maps to a real `lesson-factory` CLI invocation (or a bridge-internal
    // effect for `intake`). See `stage-commands.ts` for the full table and
    // placeholder token conventions.
    const spec = stageCommand(stage, { slug })
    return {
      stage,
      cmd: spec.cmd,
      args: spec.args,
      skip: skip.has(stage),
      effect: spec.effect,
    }
  })

  return {
    proposalId: proposal.id,
    slug,
    stages: [...BRIDGE_STAGES],
    entries,
    intake,
    createdAt: now().toISOString(),
  }
}
