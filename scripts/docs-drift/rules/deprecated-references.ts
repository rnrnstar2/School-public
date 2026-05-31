/**
 * deprecated-references
 *
 * Detects drift between README claims that a symbol / file has been
 * "deleted" and the reality of the tree. Source-of-truth is the repo
 * filesystem + `src/` contents searched for exact identifier usage.
 *
 * Current state (2026-04-16):
 *   README.md line 59 claims `track-registry` was deleted in Phase 8.
 *   The file `src/lib/curriculum/track-registry.ts` does **not** exist
 *   on disk, so the claim is correct → rule emits zero findings for
 *   `track-registry`. Finding would appear only if the file returned.
 *
 * The rule is intentionally deterministic: we do *not* grep for any
 * textual mention of the symbol (those can legitimately live in a
 * tech-debt log). We only flag files whose **path** still contains the
 * deprecated term, or paths the README explicitly guards.
 */

import { promises as fs } from 'fs'
import path from 'path'

import type { Finding, Rule } from '../types'

/**
 * Detects lines in README.md that claim a symbol has been "deleted" /
 * "削除済み". If such a line is found, **every** backtick-quoted token
 * on that line is treated as a candidate deprecated symbol — lines like
 * "`track-registry` と `old-module` は削除済み" must not drop `old-module`.
 */
const DELETION_PHRASE_REGEX = /(?:削除済み|deleted|removed|retired|completely removed)/i
const BACKTICK_TOKEN_REGEX = /`([^`]+)`/g

/**
 * Paths we explicitly check for a named deprecated symbol. We do not
 * recursively scan the tree to avoid flaky heuristics — the canonical
 * detection is "does a file whose path ends with `<symbol>.ts` exist
 * under `src/` anywhere in the repo?".
 */
const DEFAULT_CANDIDATE_PATHS = (symbol: string) => [
  `apps/web/src/lib/curriculum/${symbol}.ts`,
  `apps/web/src/lib/${symbol}.ts`,
  `apps/web/src/${symbol}.ts`,
  `packages/${symbol}`,
  `lesson-factory/src/${symbol}.ts`,
]

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.stat(abs)
    return true
  } catch {
    return false
  }
}

async function readIfExists(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

type DeletedClaim = {
  symbol: string
  line: number
  file: string
  context: string
}

export function collectDeletedClaims(
  readmeContents: string,
  relFile: string,
): DeletedClaim[] {
  const claims: DeletedClaim[] = []
  const lines = readmeContents.split(/\r?\n/)
  lines.forEach((line, idx) => {
    if (!DELETION_PHRASE_REGEX.test(line)) return
    const tokenRx = new RegExp(BACKTICK_TOKEN_REGEX.source, BACKTICK_TOKEN_REGEX.flags)
    let match: RegExpExecArray | null
    while ((match = tokenRx.exec(line)) !== null) {
      const symbol = match[1]
      if (!symbol) continue
      claims.push({
        symbol,
        line: idx + 1,
        file: relFile,
        context: line.trim(),
      })
    }
  })
  return claims
}

/**
 * Core checker — exposed for tests so we can inject a lightweight
 * `exists` probe without touching the real filesystem.
 */
export async function computeDeprecatedFindings(input: {
  readmePath: string
  readmeContents: string | null
  rootDir: string
  exists?: (relPath: string) => Promise<boolean>
  candidatePaths?: (symbol: string) => string[]
}): Promise<Finding[]> {
  const findings: Finding[] = []
  if (!input.readmeContents) return findings

  const exists =
    input.exists ?? ((rel) => pathExists(path.join(input.rootDir, rel)))
  const candidates = input.candidatePaths ?? DEFAULT_CANDIDATE_PATHS

  const claims = collectDeletedClaims(input.readmeContents, input.readmePath)

  for (const claim of claims) {
    // Normalize: strip any trailing `.ts` / directory suffix so we probe
    // a consistent stem.
    const stem = claim.symbol.replace(/\.ts$/, '').replace(/\/$/, '')
    // Skip obvious aspirational or metaphorical mentions.
    if (stem.length < 2) continue

    const probes = candidates(stem)
    for (const probe of probes) {
      const hit = await exists(probe)
      if (hit) {
        findings.push({
          message: `README claims \`${stem}\` was deleted but ${probe} still exists.`,
          severity: 'warn',
          location: { file: claim.file, line: claim.line },
          data: {
            symbol: stem,
            existingPath: probe,
            readmeContext: claim.context,
          },
        })
      }
    }
  }

  return findings
}

export const deprecatedReferencesRule: Rule = {
  id: 'deprecated-references',
  description:
    'README が「削除済み」と記述しているシンボルが実ツリーに残存していないか検証する',
  async run({ rootDir }) {
    const readmePath = 'README.md'
    const readmeContents = await readIfExists(path.join(rootDir, readmePath))
    return computeDeprecatedFindings({
      readmePath,
      readmeContents,
      rootDir,
    })
  },
}
