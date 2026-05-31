/**
 * package-existence
 *
 * Detects drift between `packages/<name>` paths mentioned in the repo
 * README and the reality on disk / in `pnpm-workspace.yaml`.
 *
 * Motivating case: the current README documents `packages/database`,
 * `packages/ui`, and `packages/config`, but only `packages/ui` exists.
 * The rule fires a finding per missing package so the owner can decide
 * whether to delete the README bullet or (re)create the package.
 *
 * The rule also flags packages that live on disk but are *not* covered
 * by `pnpm-workspace.yaml`, because that is the other direction docs
 * drift usually takes.
 */

import { promises as fs } from 'fs'
import path from 'path'

import type { Finding, Rule } from '../types'

/**
 * Match `packages/<name>` in markdown. Accepts word chars and hyphens.
 * We deliberately anchor on `packages/` so we don't collide with, say,
 * `packages.json` or `packages/` buried in a URL.
 */
const PACKAGES_MENTION_REGEX = /\bpackages\/([a-z0-9][a-z0-9_-]*)/gi

/**
 * Match workspace glob entries in `pnpm-workspace.yaml`.
 * Supports both `"packages/*"` and `- packages/ui` forms. Accepts the
 * optional leading whitespace that yaml lists typically carry.
 */
const WORKSPACE_GLOB_REGEX = /^\s*-\s*['"]?(packages\/[^'"\s]+)['"]?\s*$/gm

async function readIfExists(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

async function listDir(abs: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

function collectMentions(readme: string, relFile: string): Array<{
  name: string
  line: number
  context: string
  file: string
}> {
  const out: Array<{ name: string; line: number; context: string; file: string }> = []
  const lines = readme.split(/\r?\n/)

  // Track whether we are inside a markdown tree block whose root is
  // `packages/`. When we are, child lines like `│   ├── ui/` are treated
  // as `packages/ui` mentions — the README uses this form to enumerate
  // workspace members.
  let inPackagesTree = false
  let packagesTreeIndent = -1

  lines.forEach((line, idx) => {
    // Direct `packages/<name>` mention anywhere on the line.
    const rx = new RegExp(PACKAGES_MENTION_REGEX.source, PACKAGES_MENTION_REGEX.flags)
    let match: RegExpExecArray | null
    while ((match = rx.exec(line)) !== null) {
      const name = match[1]
      if (!name || name === '*') continue
      out.push({ name, line: idx + 1, context: line.trim(), file: relFile })
    }

    // Tree-view enumeration handling.
    const packagesRootMatch = line.match(/^(\s*)(?:[│├└─\s]*)?packages\/\s*$/)
    if (packagesRootMatch) {
      inPackagesTree = true
      packagesTreeIndent = packagesRootMatch[1]?.length ?? 0
      return
    }

    if (inPackagesTree) {
      const childMatch = line.match(/^[│├└─\s]+([a-z0-9][a-z0-9_-]*)\/?\b/i)
      // Heuristic: close the tree block on blank / non-tree lines.
      const looksLikeTreeLine = /^[│├└─\s]/.test(line)
      if (childMatch && looksLikeTreeLine) {
        const name = childMatch[1]
        if (name && !out.some((m) => m.line === idx + 1 && m.name === name)) {
          out.push({ name, line: idx + 1, context: line.trim(), file: relFile })
        }
      } else if (!looksLikeTreeLine || line.trim() === '' || line.trim().startsWith('```')) {
        inPackagesTree = false
        packagesTreeIndent = -1
      }
    }
  })

  return out
}

function isWildcardWorkspace(workspaceContents: string | null): boolean {
  if (!workspaceContents) return false
  return /packages\/\*/.test(workspaceContents)
}

function explicitWorkspaceEntries(workspaceContents: string | null): Set<string> {
  const out = new Set<string>()
  if (!workspaceContents) return out
  const rx = new RegExp(WORKSPACE_GLOB_REGEX.source, WORKSPACE_GLOB_REGEX.flags)
  let match: RegExpExecArray | null
  while ((match = rx.exec(workspaceContents)) !== null) {
    if (match[1] && !match[1].endsWith('/*')) out.add(match[1])
  }
  return out
}

/**
 * Core comparison — exposed separately so the vitest suite can drive it
 * with in-memory fixtures.
 */
export function computePackageDrift(input: {
  readmePath: string
  readmeContents: string | null
  workspaceContents: string | null
  /** Packages that actually exist on disk under `packages/`. */
  actualPackages: string[]
  /** Marker lines we consider "user claims this exists" (default: any mention). */
  stripAspirational?: boolean
}): Finding[] {
  const findings: Finding[] = []

  if (!input.readmeContents) return findings

  const mentions = collectMentions(input.readmeContents, input.readmePath)
  const actualSet = new Set(input.actualPackages)
  const wildcardMatch = isWildcardWorkspace(input.workspaceContents)
  const explicit = explicitWorkspaceEntries(input.workspaceContents)

  for (const mention of mentions) {
    const contextLower = mention.context.toLowerCase()
    // Treat "今後" / "planned" / "予定" as intentionally forward-looking
    // mentions when `stripAspirational` is enabled (default true).
    const aspirational =
      input.stripAspirational !== false &&
      /(今後|予定|planned|future|coming soon|予告)/i.test(contextLower)

    const existsOnDisk = actualSet.has(mention.name)
    const coveredByWorkspace =
      wildcardMatch || explicit.has(`packages/${mention.name}`)

    if (!existsOnDisk && !aspirational) {
      findings.push({
        message: `README references packages/${mention.name} but it does not exist on disk.`,
        severity: 'warn',
        location: { file: mention.file, line: mention.line },
        data: {
          package: mention.name,
          context: mention.context,
          coveredByWorkspace,
        },
      })
    }

    if (existsOnDisk && !coveredByWorkspace) {
      findings.push({
        message: `packages/${mention.name} exists on disk but is not covered by pnpm-workspace.yaml.`,
        severity: 'warn',
        location: { file: 'pnpm-workspace.yaml' },
        data: {
          package: mention.name,
          readmeLine: mention.line,
        },
      })
    }
  }

  return findings
}

export const packageExistenceRule: Rule = {
  id: 'package-existence',
  description:
    'README が言及する packages/<name> と pnpm-workspace.yaml / 実ディレクトリの整合を検証する',
  async run({ rootDir }) {
    const readmePath = 'README.md'
    const workspacePath = 'pnpm-workspace.yaml'
    const packagesDir = 'packages'

    const [readmeContents, workspaceContents, actualPackages] = await Promise.all([
      readIfExists(path.join(rootDir, readmePath)),
      readIfExists(path.join(rootDir, workspacePath)),
      listDir(path.join(rootDir, packagesDir)),
    ])

    return computePackageDrift({
      readmePath,
      readmeContents,
      workspaceContents,
      actualPackages,
    })
  },
}
