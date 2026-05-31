/**
 * port-consistency
 *
 * Detects drift between the README's documented web dev-server port and
 * the real values baked into `apps/web/playwright.config.ts` and
 * `apps/web/e2e/README.md`.
 *
 * Current state (2026-04-16):
 *   README.md              → documents `port: 3000`
 *   apps/web/playwright.config.ts → defaults `PLAYWRIGHT_WEB_PORT` to 3200
 *   apps/web/e2e/README.md → says 3200
 *
 * The README therefore drifts from the real port by 200. This rule emits
 * at least one finding for that mismatch in the current tree, which is
 * how TQ-134 AC-134-02 validates that the detector actually works.
 */

import { promises as fs } from 'fs'
import path from 'path'

import type { Finding, Rule } from '../types'

/**
 * Match lines that look like `port: 3000`, `port 3000`, `:3000`, or
 * `localhost:3000` inside a markdown-ish file. We explicitly capture
 * the port number so we can compare numerically rather than by string
 * equality.
 */
const README_PORT_REGEX =
  /(?:port\s*[:=]?\s+|port\s*[:=]\s*|localhost:|127\.0\.0\.1:|:)(\d{4,5})\b/gi

/**
 * Match the `PLAYWRIGHT_WEB_PORT ?? '3200'` default literal in
 * playwright.config.ts. The string is the source of truth in this tree.
 */
const PLAYWRIGHT_DEFAULT_PORT_REGEX =
  /PLAYWRIGHT_WEB_PORT\s*\?\?\s*['"](\d{4,5})['"]/

/**
 * Match bare port callouts in the e2e README (e.g., `defaults to 3200`,
 * `--port 3200`).
 */
const E2E_README_PORT_REGEX = /\b(?:defaults to|--port|port)\s+(\d{4,5})\b/gi

/**
 * Ports that are clearly unrelated to the web dev server — we don't want
 * the rule to complain about Supabase's 54341 or admin's 3001.
 */
const IGNORED_PORTS = new Set(['3001', '54341', '54321', '54322', '54323', '54324'])

type PortMention = {
  file: string
  line: number
  port: string
  context: string
}

async function readIfExists(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

function collectPorts(
  contents: string,
  regex: RegExp,
  relFile: string,
): PortMention[] {
  const mentions: PortMention[] = []
  const lines = contents.split(/\r?\n/)
  lines.forEach((line, idx) => {
    // Rewind regex state every line — the global flag is per-string.
    const rx = new RegExp(regex.source, regex.flags)
    let match: RegExpExecArray | null
    while ((match = rx.exec(line)) !== null) {
      const port = match[1]
      if (!port || IGNORED_PORTS.has(port)) continue
      mentions.push({
        file: relFile,
        line: idx + 1,
        port,
        context: line.trim(),
      })
      if (!rx.global) break
    }
  })
  return mentions
}

function extractFirstMatch(contents: string, regex: RegExp): string | null {
  const m = contents.match(regex)
  return m?.[1] ?? null
}

/**
 * Compute drift between the README port mentions and the canonical
 * playwright default port. Exposed as a separate function so the vitest
 * suite can feed it in-memory fixtures.
 */
export function computePortDrift(input: {
  readmePath: string
  readmeContents: string | null
  playwrightPath: string
  playwrightContents: string | null
  e2eReadmePath: string
  e2eReadmeContents: string | null
}): Finding[] {
  const findings: Finding[] = []

  const canonicalPort = input.playwrightContents
    ? extractFirstMatch(input.playwrightContents, PLAYWRIGHT_DEFAULT_PORT_REGEX)
    : null

  if (!canonicalPort) {
    // The playwright config is the source of truth. If we cannot find the
    // default we warn rather than silently pass — this usually means the
    // config moved and the rule needs updating.
    findings.push({
      message:
        'port-consistency: could not locate PLAYWRIGHT_WEB_PORT default in apps/web/playwright.config.ts — rule needs update.',
      severity: 'warn',
      location: { file: input.playwrightPath },
    })
    return findings
  }

  if (input.readmeContents) {
    const readmePorts = collectPorts(
      input.readmeContents,
      README_PORT_REGEX,
      input.readmePath,
    ).filter((m) => /\b(?:web|webアプリ|受講生|frontend|localhost|port)/i.test(m.context))

    for (const mention of readmePorts) {
      if (mention.port !== canonicalPort) {
        findings.push({
          message: `README documents web port ${mention.port} but playwright.config.ts defaults PLAYWRIGHT_WEB_PORT to ${canonicalPort}.`,
          severity: 'warn',
          location: { file: mention.file, line: mention.line },
          data: {
            expected: canonicalPort,
            actual: mention.port,
            context: mention.context,
            sourceOfTruth: input.playwrightPath,
          },
        })
      }
    }
  }

  if (input.e2eReadmeContents) {
    const e2ePorts = collectPorts(
      input.e2eReadmeContents,
      E2E_README_PORT_REGEX,
      input.e2eReadmePath,
    )
    for (const mention of e2ePorts) {
      if (mention.port !== canonicalPort) {
        findings.push({
          message: `E2E README documents port ${mention.port} but playwright.config.ts defaults PLAYWRIGHT_WEB_PORT to ${canonicalPort}.`,
          severity: 'warn',
          location: { file: mention.file, line: mention.line },
          data: {
            expected: canonicalPort,
            actual: mention.port,
            context: mention.context,
            sourceOfTruth: input.playwrightPath,
          },
        })
      }
    }
  }

  return findings
}

export const portConsistencyRule: Rule = {
  id: 'port-consistency',
  description:
    'README の port 記述と apps/web/playwright.config.ts / e2e README の port を突合する',
  async run({ rootDir }) {
    const readmePath = 'README.md'
    const playwrightPath = 'apps/web/playwright.config.ts'
    const e2eReadmePath = 'apps/web/e2e/README.md'

    const [readmeContents, playwrightContents, e2eReadmeContents] =
      await Promise.all([
        readIfExists(path.join(rootDir, readmePath)),
        readIfExists(path.join(rootDir, playwrightPath)),
        readIfExists(path.join(rootDir, e2eReadmePath)),
      ])

    return computePortDrift({
      readmePath,
      readmeContents,
      playwrightPath,
      playwrightContents,
      e2eReadmePath,
      e2eReadmeContents,
    })
  },
}
