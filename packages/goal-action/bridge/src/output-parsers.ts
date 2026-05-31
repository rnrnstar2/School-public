import type { BridgeStage } from './schema'
import { PLACEHOLDER } from './stage-commands'

/**
 * Result of parsing a CLI stage's stdout into placeholder → concrete path
 * resolutions that downstream stages will consume via `resolveStageArgs`.
 *
 * Returning `null` means the expected "saved to" phrase was not found in
 * stdout. Callers treat this as a soft failure — the subsequent stage's
 * `resolveStageArgs` call will naturally re-surface the missing token via
 * `UnresolvedStagePlaceholderError`, which carries a stdout fragment for
 * debugging.
 */
export type StageOutputResolution = {
  resolutions: Record<string, string>
}

/**
 * Parse a CLI stage's stdout to extract output path(s) and map them to the
 * placeholder tokens downstream stages will reference.
 *
 * Ground truth — the actual `console.log` lines in lesson-factory CLI
 * commands are quoted inline next to each regex. If those commands change
 * phrasing, these regexes MUST be updated in lockstep.
 *
 * - `context-fetch` → `<research-output>`
 *   lesson-factory/src/cli/commands/research.ts:
 *     `console.log(\`FreshContextBundle saved to ${outPath} (... contexts).\`)`
 *     `console.log(\`FreshContextBundle saved to ${result.outputPath} (... contexts).\`)`
 * - `draft` → `<draft-json>`
 *   lesson-factory/src/cli/commands/draft.ts:
 *     `console.log(\`Draft saved to ${result.outputPath}.\`)`
 * - `critique` → `<critique-json>`
 *   lesson-factory/src/cli/commands/critique.ts:
 *     `console.log(\`Critique saved to ${result.outputPath}.\`)`
 * - `media` → `<media-json>` (no downstream consumer today, but captured
 *   for parity / forward-compat)
 *   lesson-factory/src/cli/commands/media.ts:
 *     `console.log(\`Media assets saved to ${result.outputPath}.\`)`
 * - `eval` → `<eval-json>` (terminal stage; no downstream consumer)
 *   lesson-factory/src/cli/commands/eval.ts:
 *     `console.log(\`Eval bundle saved to ${result.outputPath}.\`)`
 *
 * `intake` is bridge-internal (no stdout to parse); `parseStageOutput`
 * returns `null` for it so callers fall through to the existing internal-
 * effect path.
 */
export function parseStageOutput(
  stage: BridgeStage,
  stdout: string,
): StageOutputResolution | null {
  switch (stage) {
    case 'intake':
      // Bridge-internal effect — no CLI stdout. Caller already handles this.
      return null
    case 'context-fetch': {
      // Matches: `FreshContextBundle saved to <path> (N contexts).`
      const match = stdout.match(
        /FreshContextBundle saved to (\S+) \(\d+ contexts?\)\./,
      )
      if (!match || !match[1]) return null
      return { resolutions: { [PLACEHOLDER.researchOutput]: match[1] } }
    }
    case 'draft': {
      // Matches: `Draft saved to <path>.`
      const match = stdout.match(/Draft saved to (\S+?)\.(?:\s|$)/)
      if (!match || !match[1]) return null
      return { resolutions: { [PLACEHOLDER.draftJson]: match[1] } }
    }
    case 'critique': {
      // Matches: `Critique saved to <path>.`
      const match = stdout.match(/Critique saved to (\S+?)\.(?:\s|$)/)
      if (!match || !match[1]) return null
      return { resolutions: { [PLACEHOLDER.critiqueJson]: match[1] } }
    }
    case 'media': {
      // Matches: `Media assets saved to <path>.`
      const match = stdout.match(/Media assets saved to (\S+?)\.(?:\s|$)/)
      if (!match || !match[1]) return null
      return { resolutions: { [PLACEHOLDER.mediaJson]: match[1] } }
    }
    case 'eval': {
      // Matches: `Eval bundle saved to <path>.`
      const match = stdout.match(/Eval bundle saved to (\S+?)\.(?:\s|$)/)
      if (!match || !match[1]) return null
      return { resolutions: { [PLACEHOLDER.evalJson]: match[1] } }
    }
  }
}

/**
 * Clip stdout to the last N characters so the enhanced
 * `UnresolvedStagePlaceholderError` message stays bounded even when the
 * upstream CLI prints verbose logs.
 */
export function clipStdoutForError(stdout: string, maxChars = 500): string {
  if (stdout.length <= maxChars) return stdout
  return `…${stdout.slice(stdout.length - maxChars)}`
}
