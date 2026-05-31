import { randomUUID } from 'node:crypto'

import {
  ApprovalMissingError,
  loadApprovalGate,
  type ApprovalGateFetcher,
} from './approval-gate'
import { dryRun, type DryRunInput } from './dry-run'
import { UnresolvedStagePlaceholderError } from './errors'
import { clipStdoutForError, parseStageOutput } from './output-parsers'
import type { PipelineClient } from './pipeline-client'
import {
  type BridgePlan,
  type BridgeResult,
  type BridgeStage,
  type IntakeBundle,
  type LessonDevProposalInput,
  type StagePlanEntry,
  type StageResult,
} from './schema'
import { PLACEHOLDER } from './stage-commands'

const FORBIDDEN_STAGES = new Set<BridgeStage | 'publish'>(['publish' as const])

export type BridgeRunPersistInput = {
  runId: string
  proposalId: string
  slug: string
  status: 'success' | 'failed'
  failedStage: BridgeStage | null
  stageResults: StageResult[]
  startedAt: string
  finishedAt: string
  error: string | null
}

export type BridgePersist = {
  recordRun: (row: BridgeRunPersistInput) => Promise<void>
}

/**
 * Writes the in-memory IntakeBundle to disk for downstream CLI stages.
 *
 * Default implementation (see `createFsIntakeWriter`) serialises to YAML and
 * writes to the `intake-yaml` path from the plan entry. Tests inject an
 * in-memory fake to verify the effect is invoked without touching the FS.
 */
export type IntakeWriter = {
  writeIntakeYaml: (payload: {
    targetPath: string
    bundle: IntakeBundle
  }) => Promise<void>
}

export type BridgeDeps = {
  pipelineClient: PipelineClient
  approvalGate: ApprovalGateFetcher
  persist: BridgePersist
  /**
   * Writes the IntakeBundle to disk as part of the `intake` bridge-internal
   * effect. Optional — callers performing dry-run-style execution against
   * fully-mocked pipelines can omit it; if `intake` is non-skipped and no
   * writer is supplied the runner throws at execution time.
   */
  intakeWriter?: IntakeWriter
  /** Optional random id factory for deterministic tests. */
  runIdFactory?: () => string
  /** Optional clock for deterministic timestamps. */
  now?: () => Date
}

export type ExecuteInput = Omit<DryRunInput, 'now'> & {
  /** Optional clock override; forwarded to `dryRun`. */
  now?: () => Date
}

/**
 * Execute the bridge pipeline for an approved proposal.
 *
 * Preconditions:
 *   1. `decision_ledger.approval_gates` has an approved, non-expired row
 *      linked via `metadata.lesson_dev_proposal_id`. Otherwise throws
 *      `ApprovalMissingError` before any stage runs.
 *
 * Execution:
 *   - Stages run serially in BRIDGE_STAGES order (intake → ... → eval).
 *   - `publish` is never requested; if anyone tampers with the plan to add
 *     it, we throw before the pipeline is invoked.
 *   - First failed stage short-circuits the rest. Remaining stages are not
 *     recorded in `stageResults`.
 *   - Every run (success or failure) is recorded via `persist.recordRun`.
 */
export async function execute(
  input: ExecuteInput,
  deps: BridgeDeps,
): Promise<BridgeResult> {
  // Clock precedence: input.now (per-call override) > deps.now (injected
  // default) > new Date(). A single resolved `now` is reused for plan
  // timestamps, started/finished markers, and approval expiry checks so all
  // clock-dependent behaviour stays consistent within one run.
  const now = input.now ?? deps.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const runId = (deps.runIdFactory ?? randomUUID)()

  // Build the plan first so dry-run path (no deps) stays consistent.
  const plan = dryRun({
    ...input,
    now,
  })
  assertNoForbiddenStages(plan)

  // Approval gate check. Throws ApprovalMissingError if missing / rejected.
  await loadApprovalGate(input.proposal.id, deps.approvalGate, {
    now,
  })

  const stageResults: StageResult[] = []
  let overallStatus: 'success' | 'failed' = 'success'
  let failedStage: BridgeStage | null = null
  let overallError: string | null = null

  // Tracks runtime paths produced by previous stages so that placeholder
  // tokens in later stages (`<intake-yaml>`, `<research-output>`, etc.) can
  // be substituted with concrete values. The `intake` effect seeds
  // `intakeYaml`; downstream CLI stages seed their own entries by parsing
  // the "<kind> saved to <path>" line emitted on stdout (see
  // `parseStageOutput`).
  const runtimePaths: RuntimePaths = {
    intakeYaml: null,
    researchOutput: null,
    draftJson: null,
    critiqueJson: null,
    mediaJson: null,
    evalJson: null,
  }

  // Stdout of the most recent CLI-backed stage. Used to enrich the
  // `UnresolvedStagePlaceholderError` message when a downstream stage can't
  // find its placeholder — if the upstream CLI printed something unexpected
  // (e.g. silent success, different phrasing), we include the tail of its
  // stdout so debugging is cheap without re-running the pipeline.
  let lastCliStdout = ''

  for (const entry of plan.entries) {
    if (FORBIDDEN_STAGES.has(entry.stage)) {
      throw new Error(
        `runner refused to execute forbidden stage '${entry.stage}'. publish is owner-manual only.`,
      )
    }

    if (entry.skip) {
      stageResults.push({
        stage: entry.stage,
        status: 'skipped',
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: null,
      })
      continue
    }

    // Bridge-internal effect (e.g. intake writes IntakeBundle YAML to disk).
    // These never shell out via the pipeline client — they execute directly
    // against injected filesystem abstractions so tests can assert them
    // without a real FS.
    if (entry.effect !== null) {
      const effectResult = await runInternalEffect(entry, plan.intake, deps)
      stageResults.push(effectResult.stageResult)
      if (effectResult.stageResult.status === 'failed') {
        overallStatus = 'failed'
        failedStage = entry.stage
        overallError =
          effectResult.stageResult.error ?? `${entry.stage} effect failed`
        break
      }
      if (effectResult.intakeYamlPath) {
        runtimePaths.intakeYaml = effectResult.intakeYamlPath
      }
      continue
    }

    // Resolve any placeholder tokens in args against the runtime paths
    // captured so far. Unresolved placeholders (e.g. `<draft-json>` when no
    // upstream stage has produced a draft path yet) cause us to throw
    // `UnresolvedStagePlaceholderError` BEFORE invoking the pipeline client,
    // so literal placeholder strings never reach `pnpm lesson:*` and the
    // failure is observable via a failed `agent_run` row. Upstream stage
    // outputs are captured into `runtimePaths` by parsing the previous CLI
    // stage's stdout (see `parseStageOutput` below).
    const resolved = resolveStageArgs(entry.args, runtimePaths)
    if (resolved.missing.length > 0) {
      const placeholderError = new UnresolvedStagePlaceholderError(
        entry.stage,
        resolved.missing,
        lastCliStdout ? clipStdoutForError(lastCliStdout) : undefined,
      )
      stageResults.push({
        stage: entry.stage,
        status: 'failed',
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: placeholderError.message,
      })
      overallStatus = 'failed'
      failedStage = entry.stage
      overallError = placeholderError.message

      const finishedAt = now().toISOString()
      await deps.persist.recordRun({
        runId,
        proposalId: input.proposal.id,
        slug: plan.slug,
        status: overallStatus,
        failedStage,
        stageResults,
        startedAt,
        finishedAt,
        error: overallError,
      })
      throw placeholderError
    }

    // cmd is null only for internal effects (handled above); narrow here.
    const cmd = entry.cmd
    if (cmd === null) {
      throw new Error(
        `stage '${entry.stage}' has null cmd but no effect — programming error.`,
      )
    }

    const result = await deps.pipelineClient.run({
      stage: entry.stage,
      slug: plan.slug,
      cmd,
      args: resolved.args,
      proposalId: input.proposal.id,
    })
    stageResults.push(result)

    if (result.status === 'failed') {
      overallStatus = 'failed'
      failedStage = entry.stage
      overallError = result.error ?? `${entry.stage} failed`
      break
    }

    // Capture this stage's stdout so the next iteration can reference it if
    // `resolveStageArgs` reports a missing placeholder. Parse it into
    // placeholder → path resolutions and merge them into `runtimePaths` so
    // downstream stages see concrete paths instead of literal `<token>`
    // strings. If the parser returns null (regex failed to match), leave the
    // runtimePaths entry null — the downstream stage will surface an
    // `UnresolvedStagePlaceholderError` with this stdout fragment attached.
    lastCliStdout = result.stdout ?? ''
    const parsed = parseStageOutput(entry.stage, lastCliStdout)
    if (parsed) {
      mergeResolutions(runtimePaths, parsed.resolutions)
    }
  }

  const finishedAt = now().toISOString()
  const persistInput: BridgeRunPersistInput = {
    runId,
    proposalId: input.proposal.id,
    slug: plan.slug,
    status: overallStatus,
    failedStage,
    stageResults,
    startedAt,
    finishedAt,
    error: overallError,
  }

  await deps.persist.recordRun(persistInput)

  return {
    runId,
    proposalId: input.proposal.id,
    slug: plan.slug,
    status: overallStatus,
    failedStage,
    stageResults,
    startedAt,
    finishedAt,
    error: overallError,
  }
}

function assertNoForbiddenStages(plan: BridgePlan): void {
  for (const stage of plan.stages) {
    if (FORBIDDEN_STAGES.has(stage)) {
      throw new Error(
        `bridge plan contains forbidden stage '${stage}'. publish is owner-manual only.`,
      )
    }
  }
}

export type RuntimePaths = {
  intakeYaml: string | null
  researchOutput: string | null
  draftJson: string | null
  critiqueJson: string | null
  mediaJson: string | null
  evalJson: string | null
}

/**
 * Matches bridge placeholder tokens of the form `<kebab-or-snake-word>`
 * (e.g. `<intake-yaml>`, `<draft-json>`, `<research-output>`). Used to
 * detect unresolved stage-output references after substitution.
 */
const PLACEHOLDER_TOKEN = /^<[\w-]+>$/

export function resolveStageArgs(
  args: string[],
  paths: RuntimePaths,
): { args: string[]; missing: string[] } {
  // Best-effort resolution: every placeholder that we DO have is substituted
  // with the real path captured from upstream stages (see
  // `parseStageOutput` + `mergeResolutions`). Any placeholder we DON'T have
  // is left as a literal `<token>` string so the caller can detect it as
  // `missing` and refuse to invoke the pipeline client.
  const resolved = args.map((arg) => {
    switch (arg) {
      case PLACEHOLDER.intakeYaml:
        return paths.intakeYaml ?? arg
      case PLACEHOLDER.researchOutput:
        return paths.researchOutput ?? arg
      case PLACEHOLDER.draftJson:
        return paths.draftJson ?? arg
      case PLACEHOLDER.critiqueJson:
        return paths.critiqueJson ?? arg
      case PLACEHOLDER.mediaJson:
        return paths.mediaJson ?? arg
      case PLACEHOLDER.evalJson:
        return paths.evalJson ?? arg
      default:
        return arg
    }
  })

  // Drop `--context <research-output>` pair if the research output is not
  // available (e.g. context-fetch was skipped or the pipeline client does
  // not yet surface output paths). The `lesson:draft` command treats
  // --context as optional. This MUST run before placeholder detection so
  // the optional `<research-output>` token does not falsely show up as a
  // missing input.
  const finalArgs: string[] = []
  for (let i = 0; i < resolved.length; i++) {
    const cur = resolved[i]
    const next = resolved[i + 1]
    if (cur === '--context' && next === PLACEHOLDER.researchOutput) {
      // Skip the pair entirely.
      i++
      continue
    }
    if (cur !== undefined) finalArgs.push(cur)
  }

  // Detect any remaining `<token>` strings — these are mandatory stage
  // outputs that upstream stages failed to supply. Preserve order of first
  // appearance and de-duplicate so the error message is stable.
  const missing: string[] = []
  for (const arg of finalArgs) {
    if (PLACEHOLDER_TOKEN.test(arg) && !missing.includes(arg)) {
      missing.push(arg)
    }
  }

  return { args: finalArgs, missing }
}

/**
 * Merge placeholder-keyed resolutions produced by `parseStageOutput` into the
 * runner's `runtimePaths` bag. Keys are placeholder tokens like
 * `<draft-json>`; values are the concrete paths emitted by the upstream CLI.
 * Unknown tokens are ignored (forward compat with future placeholders).
 */
function mergeResolutions(
  paths: RuntimePaths,
  resolutions: Record<string, string>,
): void {
  for (const [token, value] of Object.entries(resolutions)) {
    switch (token) {
      case PLACEHOLDER.intakeYaml:
        paths.intakeYaml = value
        break
      case PLACEHOLDER.researchOutput:
        paths.researchOutput = value
        break
      case PLACEHOLDER.draftJson:
        paths.draftJson = value
        break
      case PLACEHOLDER.critiqueJson:
        paths.critiqueJson = value
        break
      case PLACEHOLDER.mediaJson:
        paths.mediaJson = value
        break
      case PLACEHOLDER.evalJson:
        paths.evalJson = value
        break
      // Unknown tokens: forward-compat no-op.
    }
  }
}

async function runInternalEffect(
  entry: StagePlanEntry,
  intake: IntakeBundle,
  deps: BridgeDeps,
): Promise<{
  stageResult: StageResult
  intakeYamlPath?: string
}> {
  const started = Date.now()
  try {
    switch (entry.effect) {
      case 'write-intake-yaml': {
        if (!deps.intakeWriter) {
          throw new Error(
            `bridge stage '${entry.stage}' requires deps.intakeWriter to be supplied.`,
          )
        }
        const targetPath = entry.args[0]
        if (!targetPath) {
          throw new Error(
            `bridge stage '${entry.stage}' is missing the target path argument.`,
          )
        }
        await deps.intakeWriter.writeIntakeYaml({
          targetPath,
          bundle: intake,
        })
        return {
          stageResult: {
            stage: entry.stage,
            status: 'success',
            stdout: `wrote intake bundle to ${targetPath}`,
            stderr: '',
            durationMs: Date.now() - started,
            error: null,
          },
          intakeYamlPath: targetPath,
        }
      }
      case null:
        throw new Error(
          `runInternalEffect called for stage '${entry.stage}' with no effect.`,
        )
      default: {
        // Exhaustiveness guard.
        const _never: never = entry.effect
        throw new Error(`unknown bridge effect: ${String(_never)}`)
      }
    }
  } catch (error) {
    const err = error as Error
    return {
      stageResult: {
        stage: entry.stage,
        status: 'failed',
        stdout: '',
        stderr: '',
        durationMs: Date.now() - started,
        error: err.message ?? 'internal effect failure',
      },
    }
  }
}

/**
 * Default FS-backed IntakeWriter that serialises the bundle as JSON (not
 * YAML) — the lesson-factory CLI's `loadStructuredInput` helper accepts
 * JSON too, and pulling in a YAML serialiser here would bloat the
 * goal-action-bridge package for a capability that is actually optional.
 * Owners who want YAML on disk can inject their own writer. The writer is
 * also intentionally tiny so integration wiring can be done in one place.
 */
export function createFsIntakeWriter(): IntakeWriter {
  return {
    async writeIntakeYaml({ targetPath, bundle }) {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const path = await import('node:path')
      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, JSON.stringify(bundle, null, 2), 'utf8')
    },
  }
}

// Re-export so callers can catch the error without a deep import.
export { ApprovalMissingError, UnresolvedStagePlaceholderError }

// Convenience proposal type alias (keeps the public surface readable).
export type { LessonDevProposalInput }
