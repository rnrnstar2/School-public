import type { BridgeStage } from './schema'

/**
 * Thrown when a bridge stage's CLI args still contain unresolved placeholder
 * tokens (e.g. `<draft-json>`, `<critique-json>`) at execution time. This
 * means the upstream CLI stage's stdout could not be parsed into the
 * expected output path (either the stage did not run, the CLI printed an
 * unexpected phrasing, or stdout was empty). The runner refuses to shell
 * out with literal placeholder strings because that would let garbage
 * reach the CLI (e.g. `pnpm lesson:critique <draft-json>` literal), so we
 * fail loudly instead and surface a clipped stdout tail for debugging.
 */
export class UnresolvedStagePlaceholderError extends Error {
  readonly stage: BridgeStage
  readonly tokens: readonly string[]
  readonly upstreamStdout: string | undefined

  constructor(
    stage: BridgeStage,
    tokens: readonly string[],
    upstreamStdout?: string,
  ) {
    const tokenList = tokens.join(', ')
    const base =
      `bridge stage '${stage}' has unresolved placeholder token(s): ${tokenList}. ` +
      `Upstream stage stdout did not contain the expected "<kind> saved to <path>" ` +
      `line, so output-path propagation (stdout→path wiring) could not complete. ` +
      `Refusing to invoke the pipeline client with literal placeholder strings.`
    const suffix = upstreamStdout
      ? ` Last upstream stdout (clipped): ${upstreamStdout}`
      : ''
    super(base + suffix)
    this.name = 'UnresolvedStagePlaceholderError'
    this.stage = stage
    this.tokens = tokens
    this.upstreamStdout = upstreamStdout
  }
}
