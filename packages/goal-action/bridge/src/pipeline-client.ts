import type { BridgeStage, StageResult } from './schema'

export type PipelineStagePayload = {
  stage: BridgeStage
  slug: string
  cmd: string
  args: string[]
  /** Proposal id (used for logging / run tagging). */
  proposalId: string
}

/**
 * Pipeline client abstraction over `pnpm lesson:<stage>` execution.
 *
 * The `run()` result is a `StageResult` which already carries `stdout` as
 * a captured field. The runner reads that stdout to propagate stage output
 * paths into `runtimePaths` via `parseStageOutput` (see `output-parsers.ts`),
 * so downstream stages can substitute placeholder tokens like `<draft-json>`
 * with the concrete path emitted by the upstream CLI.
 *
 * Fakes used by tests only need to populate `stdout` for stages whose output
 * paths the test asserts on; omitting it keeps backward compatibility.
 */
export type PipelineClient = {
  run: (payload: PipelineStagePayload) => Promise<StageResult>
}

/**
 * Default pipeline client that shells out to the lesson-factory CLI via
 * `pnpm lesson:<stage> --slug <slug>`. `execa` is imported lazily so unit
 * tests that supply a fake client don't need the dependency installed.
 *
 * This client is intentionally thin. It does not interpret stdout — the
 * lesson-factory pipeline is the source of truth for stage semantics. A
 * non-zero exit code surfaces as `status='failed'`.
 */
export function createExecPipelineClient(options: {
  cwd?: string
  /** Optional env overrides. */
  env?: NodeJS.ProcessEnv
  /** Override the resolver, used by tests / custom sandboxes. */
  execaImport?: () => Promise<{
    execa: (
      cmd: string,
      args: string[],
      opts?: unknown,
    ) => Promise<{
      stdout: string
      stderr: string
      exitCode?: number
      durationMs?: number
    }>
  }>
} = {}): PipelineClient {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env
  const importExeca =
    options.execaImport ??
    (async () => {
      // Lazy dynamic import so consumers that only use fake clients do not
      // need execa in their dependency closure.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const mod = (await new Function(
        'return import("execa")',
      )()) as Promise<unknown>
      return mod as unknown as {
        execa: (
          cmd: string,
          args: string[],
          opts?: unknown,
        ) => Promise<{
          stdout: string
          stderr: string
          exitCode?: number
        }>
      }
    })

  return {
    async run({ stage, cmd, args }: PipelineStagePayload): Promise<StageResult> {
      const started = Date.now()
      try {
        const { execa } = await importExeca()
        const result = await execa(cmd, args, { cwd, env })
        return {
          stage,
          status: 'success',
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
          durationMs: Date.now() - started,
          error: null,
        }
      } catch (error) {
        const err = error as {
          stdout?: string
          stderr?: string
          shortMessage?: string
          message?: string
        }
        return {
          stage,
          status: 'failed',
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
          durationMs: Date.now() - started,
          error: err.shortMessage ?? err.message ?? 'unknown pipeline error',
        }
      }
    },
  }
}
