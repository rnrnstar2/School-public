#!/usr/bin/env tsx
/**
 * docs-drift runner (TQ-134).
 *
 * Walks the `defaultRules` registry, produces a JSON report on stdout,
 * and a human-readable summary line on stderr. Exit code is always 0 so
 * CI pipelines can run it as a warn-level gate without flipping red.
 *
 * CLI flags:
 *   --root <path>   Override repo root (defaults to `process.cwd()`).
 *   --pretty        Pretty-print JSON (default: 2-space indent).
 *   --rule <id>     Only run rules whose `id` matches (repeatable).
 *
 * Explicitly NOT implemented: `--fix`. Findings are advisory only per
 * spec.md TQ-134 contract.
 */

import { fileURLToPath } from 'url'
import path from 'path'

import { defaultRules } from './rules/index'
import type { Report, Rule, RuleReport } from './types'

export type RunnerOptions = {
  rootDir: string
  /** Restrict to these rule IDs; empty = all rules. */
  ruleFilter?: string[]
  /** Pretty-print JSON (default: true). */
  pretty?: boolean
  rules?: readonly Rule[]
}

export async function runDocsDrift(
  options: RunnerOptions,
): Promise<{ report: Report; json: string; summaryLine: string }> {
  const rules = options.rules ?? defaultRules
  const selected = options.ruleFilter?.length
    ? rules.filter((r) => options.ruleFilter!.includes(r.id))
    : rules

  const ruleReports: RuleReport[] = []
  for (const rule of selected) {
    let findings
    try {
      findings = await rule.run({ rootDir: options.rootDir })
    } catch (err) {
      findings = [
        {
          message: `rule ${rule.id} threw: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'warn' as const,
        },
      ]
    }

    ruleReports.push({
      id: rule.id,
      description: rule.description,
      status: findings.length === 0 ? 'pass' : 'fail',
      findings,
    })
  }

  const rulesFailed = ruleReports.filter((r) => r.status === 'fail').length
  const findingsTotal = ruleReports.reduce((acc, r) => acc + r.findings.length, 0)

  const report: Report = {
    rules: ruleReports,
    summary: {
      rulesTotal: ruleReports.length,
      rulesFailed,
      findingsTotal,
    },
  }

  const json = JSON.stringify(report, null, options.pretty === false ? 0 : 2)
  const summaryLine = `drift detected: ${rulesFailed} rules failed, ${findingsTotal} findings`

  return { report, json, summaryLine }
}

type ParsedArgs = {
  rootDir: string
  ruleFilter: string[]
  pretty: boolean
}

function parseArgs(argv: string[], cwd: string): ParsedArgs {
  const result: ParsedArgs = {
    rootDir: cwd,
    ruleFilter: [],
    pretty: true,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--root': {
        const next = argv[++i]
        if (!next) throw new Error('--root requires a value')
        result.rootDir = path.resolve(next)
        break
      }
      case '--rule': {
        const next = argv[++i]
        if (!next) throw new Error('--rule requires a value')
        result.ruleFilter.push(next)
        break
      }
      case '--pretty':
        result.pretty = true
        break
      case '--compact':
        result.pretty = false
        break
      case '--fix':
        throw new Error('--fix is intentionally not implemented (see spec.md TQ-134)')
      case '-h':
      case '--help':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`unknown argument: ${arg}`)
    }
  }

  return result
}

function printHelp() {
  process.stdout.write(`Usage: pnpm docs:drift [--root <dir>] [--rule <id>] [--compact]\n\n`)
  process.stdout.write(`Options:\n`)
  process.stdout.write(`  --root <dir>  Override repo root (default: cwd).\n`)
  process.stdout.write(`  --rule <id>   Only run the named rule (repeatable).\n`)
  process.stdout.write(`  --compact     Emit compact JSON (default: pretty).\n`)
  process.stdout.write(`  -h, --help    Show this help.\n`)
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsed: ParsedArgs
  try {
    parsed = parseArgs(argv, process.cwd())
  } catch (err) {
    process.stderr.write(
      `docs-drift: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 0
  }

  const { json, summaryLine } = await runDocsDrift({
    rootDir: parsed.rootDir,
    ruleFilter: parsed.ruleFilter,
    pretty: parsed.pretty,
  })

  process.stdout.write(`${json}\n`)
  process.stderr.write(`${summaryLine}\n`)
  return 0
}

const isDirectRun = (() => {
  try {
    const invoked = path.resolve(process.argv[1] ?? '')
    const self = fileURLToPath(import.meta.url)
    return invoked === self
  } catch {
    return false
  }
})()

if (isDirectRun) {
  main().then((code) => process.exit(code))
}
