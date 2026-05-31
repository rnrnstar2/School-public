import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { JourneyReport } from './journey-recorder'
import type { PersonaDefinition } from './persona'

/**
 * Journey-report 保存規約 (TQ-119)
 * ------------------------------------------------------------------
 * 出力先        : apps/web/playwright-report/journey-reports/
 * アーカイブ先  : apps/web/playwright-report/journey-reports/archive/
 * ファイル名    : <personaId>-<ISO8601>-<shard>.json
 *                 - ISO8601 は "YYYYMMDDTHHMMSSsssZ" 形式 (ファイルシステム安全な圧縮形)
 *                 - <shard> は "NofM" (Playwright --shard=N/M 指定時) or
 *                   "w<workerIndex>-p<pid>" (shard 未指定時、worker fallback)
 *
 * JSON 形状 (schemaVersion=1):
 *   {
 *     schemaVersion: 1,
 *     shard:         string,
 *     shardIndex:    number | null,
 *     shardTotal:    number | null,
 *     workerIndex:   number | null,
 *     pid:           number,
 *     recordedAt:    string (ISO8601),
 *     reports:       PersistedJourneyReport[]
 *   }
 *
 * 後方互換:
 *   - 既存の flat array フォーマット (`[PersistedJourneyReport, ...]`) も
 *     `/dev/journeys` ページ側で読めるよう維持している。本 writer は新規書き込みの
 *     際は常に新フォーマット (object wrapper) で吐く。
 *   - `PersistedJourneyReport` のフィールドは **削除・改名しない** 契約。追加のみ許容。
 */

export const JOURNEY_REPORT_SCHEMA_VERSION = 1

export interface ShardInfo {
  current: number
  total: number
}

export interface PersistedJourneyReport {
  personaId: string
  personaName: string
  spec: string
  project?: string
  report: JourneyReport
  recordedAt: string
}

export interface JourneyReportFile {
  schemaVersion: typeof JOURNEY_REPORT_SCHEMA_VERSION
  shard: string
  shardIndex: number | null
  shardTotal: number | null
  workerIndex: number | null
  pid: number
  recordedAt: string
  reports: PersistedJourneyReport[]
}

function resolveAppRoot() {
  const candidates = [
    resolve(process.cwd()),
    resolve(process.cwd(), 'apps/web'),
    resolve(process.cwd(), '..'),
  ]

  const match = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'playwright.config.ts')),
  )

  if (!match) {
    throw new Error('apps/web root could not be resolved for journey report writer.')
  }

  return match
}

function hasPathPrefix(fullPath: string, root: string) {
  return fullPath === root || fullPath.startsWith(`${root}${sep}`)
}

/**
 * Shard 判定優先順位:
 *   1. 明示引数 (`shardInfo`)
 *   2. 環境変数 `PLAYWRIGHT_SHARD_CURRENT` / `PLAYWRIGHT_SHARD_TOTAL`
 *      (CI や手動セットアップ時に writer 側が shard を知るための注入経路)
 *   3. いずれも無ければ null
 */
export function resolveShardInfo(explicit?: ShardInfo | null): ShardInfo | null {
  if (explicit && Number.isFinite(explicit.current) && Number.isFinite(explicit.total)) {
    return { current: explicit.current, total: explicit.total }
  }

  const envCurrent = Number.parseInt(process.env.PLAYWRIGHT_SHARD_CURRENT ?? '', 10)
  const envTotal = Number.parseInt(process.env.PLAYWRIGHT_SHARD_TOTAL ?? '', 10)
  if (Number.isFinite(envCurrent) && Number.isFinite(envTotal) && envTotal > 0) {
    return { current: envCurrent, total: envTotal }
  }

  return null
}

function resolveWorkerIndex(): number | null {
  const raw = process.env.TEST_WORKER_INDEX
  if (raw === undefined) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 時刻を ISO8601 の「ファイル名安全な圧縮表現」に変換する。
 *   2026-04-16T12:34:56.789Z → 20260416T123456789Z
 */
export function compactIsoTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '')
}

export function shardSlug(shard: ShardInfo | null, workerIndex: number | null, pid: number) {
  if (shard) {
    return `${shard.current}of${shard.total}`
  }
  const worker = workerIndex ?? 0
  return `w${worker}-p${pid}`
}

/**
 * <persona>-<ISO8601>-<shard>.json 形式のファイル名を生成する。
 */
export function journeyReportFileName(
  persona: Pick<PersonaDefinition, 'id'>,
  options: {
    at?: Date
    shard?: ShardInfo | null
    workerIndex?: number | null
    pid?: number
  } = {},
) {
  const at = options.at ?? new Date()
  const shard = options.shard ?? null
  const workerIndex = options.workerIndex ?? resolveWorkerIndex()
  const pid = options.pid ?? process.pid
  const safePersona = persona.id.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return `${safePersona}-${compactIsoTimestamp(at)}-${shardSlug(shard, workerIndex, pid)}.json`
}

async function readExistingReports(filePath: string): Promise<PersistedJourneyReport[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is PersistedJourneyReport => Boolean(item))
    }
    if (
      parsed
      && typeof parsed === 'object'
      && 'reports' in parsed
      && Array.isArray((parsed as { reports?: unknown }).reports)
    ) {
      return (parsed as { reports: PersistedJourneyReport[] }).reports.filter(Boolean)
    }
    return []
  } catch {
    return []
  }
}

/**
 * 既存 per-process shard ファイル (<pid>.json) — TQ-113 時代の遺物。
 * 新フォーマットに切り替えた後は書き込まないが、同一 worker で既に書き込み済みの
 * reports は一度だけ新ファイルに吸収し、古い方は触らない（後続 rotate 対象）。
 */
function legacyShardPath(reportDir: string) {
  return resolve(reportDir, `${process.pid}.json`)
}

/**
 * writer のメインエントリ。
 *
 * 既存 consumer（journey-recorder / personas/*.spec.ts / /dev/journeys）と互換を保つため、
 * 引数の先頭 4 つのシグネチャは **一切変更しない**。shard 情報は optional 5 番目で渡す。
 *
 * 同一 process (= 同一 worker) 内の複数 report を同じ shard ファイルに追記する。
 * ファイル名に ISO8601 を含むため、process が異なれば（= worker / shard が異なれば）
 * ファイルが被らない。worker 内で複数 test が走ると最初の test 時刻でファイル名を固定する。
 */
export async function appendJourneyReport(
  persona: PersonaDefinition,
  spec: string,
  report: JourneyReport,
  project?: string,
  shardInfo?: ShardInfo | null,
) {
  const appRoot = resolveAppRoot()
  const reportRoot = resolve(appRoot, 'playwright-report')
  const reportDir = resolve(reportRoot, 'journey-reports')

  if (!hasPathPrefix(reportDir, reportRoot)) {
    throw new Error('blocked journey report path traversal')
  }

  await mkdir(reportDir, { recursive: true })

  const shard = resolveShardInfo(shardInfo)
  const workerIndex = resolveWorkerIndex()
  const pid = process.pid

  // 同一 worker 内の書き込みを同一ファイルに集約するため、worker 単位でファイル名を
  // 決定して sticky に使う。初回呼び出し時の時刻をファイル名に焼き付け、以降は同名に
  // append する。グローバル変数で持つと worker 分離で自然に隔離される。
  const stickyKey = `${persona.id}:${shardSlug(shard, workerIndex, pid)}`
  const registry = getStickyRegistry()
  let fileName = registry.get(stickyKey)
  if (!fileName) {
    fileName = journeyReportFileName(persona, {
      at: new Date(),
      shard,
      workerIndex,
      pid,
    })
    registry.set(stickyKey, fileName)
  }

  const filePath = resolve(reportDir, fileName)
  if (!hasPathPrefix(filePath, reportDir)) {
    throw new Error('blocked journey report path traversal')
  }

  const tempPath = resolve(
    reportDir,
    `${pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  )

  const existing = await readExistingReports(filePath)
  // 互換吸収: 最初の書き込み時に legacy <pid>.json があれば同 worker 分の報告として取り込む。
  if (existing.length === 0) {
    const legacy = await readExistingReports(legacyShardPath(reportDir))
    existing.push(...legacy)
  }

  const recordedAt = new Date().toISOString()
  const next: JourneyReportFile = {
    schemaVersion: JOURNEY_REPORT_SCHEMA_VERSION,
    shard: shardSlug(shard, workerIndex, pid),
    shardIndex: shard?.current ?? null,
    shardTotal: shard?.total ?? null,
    workerIndex,
    pid,
    recordedAt,
    reports: [
      ...existing,
      {
        personaId: persona.id,
        personaName: persona.name,
        spec,
        project,
        report,
        recordedAt,
      },
    ],
  }

  await writeFile(tempPath, JSON.stringify(next, null, 2), 'utf8')
  await rename(tempPath, filePath)

  return { filePath, fileName, shard: next.shard, schemaVersion: next.schemaVersion }
}

// ------------------------------------------------------------------
// per-worker sticky file-name registry
//
// NOTE: Playwright はテストを "worker" と呼ぶ子プロセスで並列実行する。Node の
// モジュール状態は worker ごとに独立なので、単純な WeakMap/Map 保持で worker 間の
// 分離が自然に効く。テスト間でのファイル共有を意図するなら globalThis 経由で持つ。
// ------------------------------------------------------------------
const STICKY_SYMBOL = Symbol.for('school.journey-report-writer.sticky')

function getStickyRegistry(): Map<string, string> {
  const global = globalThis as unknown as Record<symbol, Map<string, string>>
  if (!global[STICKY_SYMBOL]) {
    global[STICKY_SYMBOL] = new Map<string, string>()
  }
  return global[STICKY_SYMBOL]
}
