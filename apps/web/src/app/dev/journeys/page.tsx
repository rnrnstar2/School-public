import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { sep, resolve } from 'node:path'
import { notFound } from 'next/navigation'
import { JourneysClient, type DashboardJourneyReport } from './JourneysClient'
import { parseManifest } from './parse-manifest'

export const dynamic = 'force-dynamic'

const PLAYWRIGHT_REPORT_REL = 'apps/web/playwright-report'
const REPORT_SHARDS_REL = `${PLAYWRIGHT_REPORT_REL}/journey-reports`

const ALLOWED_FILE_PATHS = new Set([
  'docs/swarmops/journey-manifest.yaml',
  'docs/swarmops/journey-map.md',
  `${PLAYWRIGHT_REPORT_REL}/index.html`,
  `${PLAYWRIGHT_REPORT_REL}/results.json`,
  `${PLAYWRIGHT_REPORT_REL}/journey-reports.json`,
])

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
    throw new Error('repo root could not be resolved for /dev/journeys')
  }

  return match
}

function hasPathPrefix(fullPath: string, root: string) {
  return fullPath === root || fullPath.startsWith(`${root}${sep}`)
}

function normalizeRelPath(relPath: string) {
  return relPath.split(sep).join('/')
}

function resolveSafeRepoPath(repoRoot: string, relPath: string) {
  const normalized = normalizeRelPath(relPath)
  const isAllowedFile = ALLOWED_FILE_PATHS.has(normalized)
  const isAllowedReportRoot = normalized === PLAYWRIGHT_REPORT_REL
  const isAllowedShard = normalized === REPORT_SHARDS_REL
    || normalized.startsWith(`${REPORT_SHARDS_REL}/`)

  if (!isAllowedFile && !isAllowedReportRoot && !isAllowedShard) {
    throw new Error(`blocked dev journeys path: ${relPath}`)
  }

  const fullPath = resolve(repoRoot, relPath)
  if (!hasPathPrefix(fullPath, repoRoot)) {
    throw new Error(`blocked path traversal: ${relPath}`)
  }

  if (isAllowedReportRoot && fullPath !== resolve(repoRoot, PLAYWRIGHT_REPORT_REL)) {
    throw new Error(`blocked Playwright report root traversal: ${relPath}`)
  }

  if (isAllowedShard && !hasPathPrefix(fullPath, resolve(repoRoot, REPORT_SHARDS_REL))) {
    throw new Error(`blocked journey report shard traversal: ${relPath}`)
  }

  return fullPath
}

async function readSafeUtf8(repoRoot: string, relPath: string) {
  try {
    return await readFile(resolveSafeRepoPath(repoRoot, relPath), 'utf8')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('blocked')) {
      throw error
    }
    return null
  }
}

async function readJourneyReportShardJson(repoRoot: string) {
  const reportDir = resolveSafeRepoPath(repoRoot, REPORT_SHARDS_REL)
  if (!hasPathPrefix(reportDir, resolveSafeRepoPath(repoRoot, PLAYWRIGHT_REPORT_REL))) {
    throw new Error('blocked journey report shard directory')
  }

  let fileNames: string[]
  try {
    fileNames = await readdir(reportDir)
  } catch {
    return []
  }

  const jsonFileNames = fileNames.filter((fileName) => /^[a-zA-Z0-9_.-]+\.json$/.test(fileName))
  const payloads = await Promise.all(
    jsonFileNames.map(async (fileName) => ({
      source: `${REPORT_SHARDS_REL}/${fileName}`,
      json: await readSafeUtf8(repoRoot, `${REPORT_SHARDS_REL}/${fileName}`),
    })),
  )

  return payloads.filter((payload): payload is { source: string; json: string } => payload.json !== null)
}

function extractMermaidBlock(mapMd: string | null) {
  if (!mapMd) {
    return null
  }

  return mapMd.match(/```mermaid\s*\n([\s\S]*?)\n```/)?.[1] ?? null
}

function toReportArray(parsed: unknown) {
  if (Array.isArray(parsed)) {
    return parsed
  }

  if (
    parsed
    && typeof parsed === 'object'
    && 'reports' in parsed
    && Array.isArray((parsed as { reports?: unknown }).reports)
  ) {
    return (parsed as { reports: unknown[] }).reports
  }

  return []
}

function normalizeJourneyReport(entry: unknown, source: string): DashboardJourneyReport | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const record = entry as Record<string, unknown>
  const report = (record.report && typeof record.report === 'object'
    ? record.report
    : record) as Record<string, unknown>
  const criteriaViolations = Array.isArray(report.criteriaViolations)
    ? report.criteriaViolations.filter((item): item is string => typeof item === 'string')
    : []

  return {
    personaId: String(record.personaId ?? record.persona_id ?? record.persona ?? 'unknown'),
    personaName: typeof record.personaName === 'string' ? record.personaName : undefined,
    project: typeof record.project === 'string' ? record.project : undefined,
    spec: String(record.spec ?? record.specTitle ?? record.title ?? 'unknown'),
    steps: typeof report.steps === 'number' ? report.steps : 0,
    durationMs: typeof report.durationMs === 'number' ? report.durationMs : 0,
    aiFrictionEvents: typeof report.aiFrictionEvents === 'number' ? report.aiFrictionEvents : 0,
    criteriaViolations,
    source,
  }
}

function parseJourneyReports(payloads: Array<{ source: string; json: string | null }>) {
  const reports: DashboardJourneyReport[] = []

  for (const payload of payloads) {
    if (!payload.json) {
      continue
    }

    try {
      const parsed = JSON.parse(payload.json) as unknown
      for (const entry of toReportArray(parsed)) {
        const report = normalizeJourneyReport(entry, payload.source)
        if (report) {
          reports.push(report)
        }
      }
    } catch {
      reports.push({
        personaId: 'unknown',
        spec: `Invalid report JSON: ${payload.source}`,
        steps: 0,
        durationMs: 0,
        aiFrictionEvents: 0,
        criteriaViolations: ['invalid_report_json'],
        source: payload.source,
      })
    }
  }

  return reports
}

function parseManifestSafely(manifestYaml: string | null) {
  if (!manifestYaml) {
    return { manifest: null, manifestError: 'manifest not found' }
  }

  try {
    return { manifest: parseManifest(manifestYaml), manifestError: null }
  } catch (error) {
    return {
      manifest: null,
      manifestError: error instanceof Error ? error.message : 'manifest parse failed',
    }
  }
}

export default async function DevJourneysPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const repoRoot = resolveRepoRoot()
  const [manifestYaml, mapMd, reportHtml, combinedReportsJson, shardReportsJson] =
    await Promise.all([
      readSafeUtf8(repoRoot, 'docs/swarmops/journey-manifest.yaml'),
      readSafeUtf8(repoRoot, 'docs/swarmops/journey-map.md'),
      readSafeUtf8(repoRoot, `${PLAYWRIGHT_REPORT_REL}/index.html`),
      readSafeUtf8(repoRoot, `${PLAYWRIGHT_REPORT_REL}/journey-reports.json`),
      readJourneyReportShardJson(repoRoot),
    ])

  const { manifest, manifestError } = parseManifestSafely(manifestYaml)
  const journeyReports = parseJourneyReports([
    { source: `${PLAYWRIGHT_REPORT_REL}/journey-reports.json`, json: combinedReportsJson },
    ...shardReportsJson,
  ])

  return (
    <JourneysClient
      manifest={manifest}
      manifestError={manifestError}
      mermaidCode={extractMermaidBlock(mapMd)}
      hasPlaywrightReport={reportHtml !== null}
      journeyReports={journeyReports}
    />
  )
}
