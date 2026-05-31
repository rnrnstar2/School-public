import type { BridgeEffect, BridgeStage, StagePlanEntry } from './schema'

/**
 * Map a bridge stage to the actual `lesson-factory` CLI invocation.
 *
 * Ground truth for the command shapes: `lesson-factory/package.json` script
 * names and the positional / option specs in
 * `lesson-factory/src/cli/commands/<name>.ts`.
 *
 * Bridge stages that do NOT correspond to a CLI command are represented as
 * bridge-internal effects (see `BridgeEffect`). The runner handles these
 * directly instead of shelling out. In particular:
 *
 * - `intake` — the bridge already has a normalised IntakeBundle in memory;
 *   `lesson:new` is an interactive CLI that prompts the Owner and is not
 *   scriptable, so the bridge writes the bundle to disk itself (effect
 *   `write-intake-yaml`). Downstream commands consume that path as their
 *   first positional argument.
 *
 * Later stages depend on outputs of earlier stages (files that do not exist
 * at plan time). Those are surfaced as placeholder tokens in `args` so the
 * emitted plan is human-readable and can be post-processed by the runner
 * once real paths are known:
 *
 *   - `<intake-yaml>`      written by the `intake` effect
 *   - `<research-output>`  optional — `lesson:draft --context <path>` input
 *   - `<draft-json>`       `lesson:draft` output
 *   - `<critique-json>`    `lesson:critique` output
 *
 * `publish` is intentionally unreachable here; the runner and `dryRun`
 * throw before this helper is called. The schema `BridgeStage` enum does
 * not include `publish`, so TypeScript enforces this at compile time.
 */

export type StageCommandContext = {
  /** Used in the bridge-internal intake effect to derive the file path. */
  slug: string
}

export type StageCommandSpec = Pick<StagePlanEntry, 'cmd' | 'args' | 'effect'>

/** Placeholder tokens — resolved by the runner at execution time. */
export const PLACEHOLDER = {
  intakeYaml: '<intake-yaml>',
  researchOutput: '<research-output>',
  draftJson: '<draft-json>',
  critiqueJson: '<critique-json>',
  // Captured from media/eval stdout for symmetry. No current stage consumes
  // these as inputs (media/eval are terminal), but the runner still records
  // them in `runtimePaths` so bridge run rows / debugging surfaces have the
  // concrete output paths available without re-parsing stdout.
  mediaJson: '<media-json>',
  evalJson: '<eval-json>',
} as const

export function stageCommand(
  stage: BridgeStage,
  ctx: StageCommandContext,
): StageCommandSpec {
  switch (stage) {
    case 'intake': {
      // Bridge-internal: write the IntakeBundle to disk. The runner performs
      // the write; the pipeline client is NOT invoked. The emitted path is
      // what downstream stages reference via `<intake-yaml>`.
      const effect: BridgeEffect = 'write-intake-yaml'
      return {
        cmd: null,
        // args carries the target path hint so the runner knows where to
        // write. We keep the value deterministic for the given slug so the
        // dry-run output is reproducible.
        args: [intakeYamlPath(ctx.slug)],
        effect,
      }
    }
    case 'context-fetch':
      // `lesson:research <intake-bundle>` — positional path to intake YAML.
      // See: lesson-factory/src/cli/commands/research.ts
      return {
        cmd: 'pnpm',
        args: [...PNPM_FILTER_ARGS, 'lesson:research', PLACEHOLDER.intakeYaml],
        effect: null,
      }
    case 'draft':
      // `lesson:draft <intake-bundle> [--context <path>]` — positional intake
      // YAML; optional FreshContextBundle JSON produced by lesson:research.
      // See: lesson-factory/src/cli/commands/draft.ts
      return {
        cmd: 'pnpm',
        args: [
          ...PNPM_FILTER_ARGS,
          'lesson:draft',
          PLACEHOLDER.intakeYaml,
          '--context',
          PLACEHOLDER.researchOutput,
        ],
        effect: null,
      }
    case 'critique':
      // `lesson:critique <draft>` — positional path to LessonDraft JSON.
      // See: lesson-factory/src/cli/commands/critique.ts
      return {
        cmd: 'pnpm',
        args: [...PNPM_FILTER_ARGS, 'lesson:critique', PLACEHOLDER.draftJson],
        effect: null,
      }
    case 'media':
      // `lesson:media <draft>` — positional path to LessonDraft JSON.
      // See: lesson-factory/src/cli/commands/media.ts
      return {
        cmd: 'pnpm',
        args: [...PNPM_FILTER_ARGS, 'lesson:media', PLACEHOLDER.draftJson],
        effect: null,
      }
    case 'eval':
      // `lesson:eval <draft> <critique>` — two positional JSON paths.
      // See: lesson-factory/src/cli/commands/eval.ts
      return {
        cmd: 'pnpm',
        args: [
          ...PNPM_FILTER_ARGS,
          'lesson:eval',
          PLACEHOLDER.draftJson,
          PLACEHOLDER.critiqueJson,
        ],
        effect: null,
      }
  }
}

/**
 * pnpm workspace filter flags used to target the `@school/lesson-factory`
 * package so `pnpm lesson:<stage>` resolves to lesson-factory's package
 * scripts rather than the repo-root (which has no `lesson:*` script, see
 * `package.json` — this would otherwise error with "Command not found").
 *
 * Source of truth: `lesson-factory/package.json::name` must equal
 * `@school/lesson-factory`. If that ever changes, update both here AND the
 * test assertions in `runner.test.ts`.
 */
const PNPM_FILTER_ARGS = ['--filter', '@school/lesson-factory'] as const

/**
 * Target path for the intake YAML produced by the `intake` effect.
 *
 * Lives under `lesson-factory/logs/runs/bridge/` so it sits alongside the
 * run-log artifacts the CLI already writes, but tagged with a `bridge-`
 * prefix so it's easy to distinguish. The path is deterministic per slug —
 * re-running the bridge for the same proposal overwrites the prior bundle.
 */
export function intakeYamlPath(slug: string): string {
  return `lesson-factory/logs/runs/bridge/${slug}.intake.yaml`
}
