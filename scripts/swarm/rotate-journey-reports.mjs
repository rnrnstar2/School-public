#!/usr/bin/env node
/**
 * rotate-journey-reports.mjs
 *
 * apps/web/playwright-report/journey-reports/ の古い journey-report ファイルを
 * apps/web/playwright-report/journey-reports/archive/ に退避する補助スクリプト。
 *
 * Usage:
 *   node scripts/swarm/rotate-journey-reports.mjs [options]
 *
 * Options:
 *   --keep N         最新 N 件を残し、残りを archive/ に移動する (default: 5)
 *   --dry-run        実際には移動せず、対象ファイルのみ列挙する
 *   --pattern RE     ファイル名フィルタ (default: .+\.json$)
 *   --help           このヘルプを表示
 *
 * 規約:
 *   journey-report-writer.ts は `<persona>-<ISO8601>-<shard>.json` 形式で書き込む
 *   (TQ-119)。このスクリプトは mtime 降順で最新 N 件以外を archive/ に mv する。
 */
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..')
const REPORT_DIR = resolve(REPO_ROOT, 'apps/web/playwright-report/journey-reports')
const ARCHIVE_DIR = resolve(REPORT_DIR, 'archive')

function parseArgs(argv) {
  const out = { keep: 5, dryRun: false, pattern: /.+\.json$/ }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      out.help = true
    } else if (arg === '--dry-run') {
      out.dryRun = true
    } else if (arg === '--keep') {
      const next = argv[i + 1]
      const parsed = Number.parseInt(next, 10)
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`--keep expects a non-negative integer, got: ${next}`)
      }
      out.keep = parsed
      i += 1
    } else if (arg === '--pattern') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--pattern expects a regex string')
      }
      out.pattern = new RegExp(next)
      i += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return out
}

function printHelp() {
  const helpBlock = `Usage: node scripts/swarm/rotate-journey-reports.mjs [options]

Options:
  --keep N       Keep the N newest reports (default: 5)
  --dry-run      Print planned moves without executing
  --pattern RE   Regex filter on file names (default: .+\\.json$)
  --help         Show this help`
  // eslint-disable-next-line no-console
  console.log(helpBlock)
}

function hasPathPrefix(fullPath, root) {
  return fullPath === root || fullPath.startsWith(`${root}${sep}`)
}

async function listCandidates(pattern) {
  let entries
  try {
    entries = await readdir(REPORT_DIR, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const files = entries.filter((entry) => entry.isFile() && pattern.test(entry.name))
  const stats = await Promise.all(
    files.map(async (entry) => {
      const fullPath = resolve(REPORT_DIR, entry.name)
      const info = await stat(fullPath)
      return { name: entry.name, fullPath, mtimeMs: info.mtimeMs }
    }),
  )
  // newest first
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return stats
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const candidates = await listCandidates(args.pattern)
  if (candidates.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[rotate-journey-reports] no journey-report files found; nothing to do.')
    return
  }

  const toKeep = candidates.slice(0, args.keep)
  const toArchive = candidates.slice(args.keep)

  if (toArchive.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[rotate-journey-reports] ${candidates.length} files present; all within --keep=${args.keep}.`,
    )
    return
  }

  if (!args.dryRun) {
    await mkdir(ARCHIVE_DIR, { recursive: true })
  }

  // eslint-disable-next-line no-console
  console.log(
    `[rotate-journey-reports] keeping ${toKeep.length}, archiving ${toArchive.length} (dry-run=${args.dryRun})`,
  )

  for (const file of toArchive) {
    const target = resolve(ARCHIVE_DIR, file.name)
    if (!hasPathPrefix(target, ARCHIVE_DIR)) {
      throw new Error(`blocked archive path traversal: ${file.name}`)
    }
    // eslint-disable-next-line no-console
    console.log(
      `[rotate-journey-reports] ${args.dryRun ? 'DRY' : 'MOVE'} ${file.name} -> archive/${file.name}`,
    )
    if (!args.dryRun) {
      await rename(file.fullPath, target)
    }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[rotate-journey-reports] failed:', error?.message ?? error)
  process.exitCode = 1
})
