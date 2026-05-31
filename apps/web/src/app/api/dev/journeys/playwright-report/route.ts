import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const REPORT_REL_PATH = 'apps/web/playwright-report/index.html'
const REPORT_ROOT_REL_PATH = 'apps/web/playwright-report'

function resolveRepoRoot() {
  const candidates = [
    resolve(process.cwd()),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '..', '..'),
  ]

  const match = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'docs/swarmops/journey-manifest.yaml'))
    && existsSync(resolve(candidate, 'apps/web/package.json')),
  )

  if (!match) {
    throw new Error('repo root could not be resolved for Playwright report route')
  }

  return match
}

function hasPathPrefix(fullPath: string, root: string) {
  return fullPath === root || fullPath.startsWith(`${root}${sep}`)
}

function resolveSafeReportPath(repoRoot: string) {
  const reportRoot = resolve(repoRoot, REPORT_ROOT_REL_PATH)
  const reportPath = resolve(repoRoot, REPORT_REL_PATH)

  if (!hasPathPrefix(reportRoot, repoRoot)) {
    throw new Error('blocked Playwright report root traversal')
  }

  if (!hasPathPrefix(reportPath, reportRoot)) {
    throw new Error('blocked Playwright report path traversal')
  }

  return reportPath
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const reportPath = resolveSafeReportPath(resolveRepoRoot())

  try {
    const html = await readFile(reportPath, 'utf8')
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return new Response('Playwright report not found', { status: 404 })
  }
}
