import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  JOURNEY_REPORT_SCHEMA_VERSION,
  appendJourneyReport,
  journeyReportFileName,
  resolveShardInfo,
  shardSlug,
  type JourneyReportFile,
} from './helpers/journey-report-writer'
import type { PersonaDefinition } from './helpers/persona'
import type { JourneyReport } from './helpers/journey-recorder'

/**
 * TQ-119-01: journey-report-writer shard contract
 *
 * - writer が `<persona>-<ISO8601>-<shard>.json` 規約のファイルを書く
 * - shard を 2 回違う id で呼んでも 2 ファイル残る (= 並列 shard 衝突しない)
 * - JSON は新スキーマ (schemaVersion=1) で `reports` 配列が追記されている
 * - 旧 flat array フォーマットの reader が壊れない (後方互換)
 */

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
    throw new Error('apps/web root could not be resolved for tq-119 spec.')
  }

  return match
}

function makePersona(id: string): PersonaDefinition {
  return {
    id,
    name: `fixture ${id}`,
    background: 'tq-119 contract test persona',
    goalSeed: 'dummy',
    expectedTrack: 'n/a',
    hearingAnswers: {},
    successCriteria: {
      maxStepsToFirstLesson: 50,
      maxDurationMs: 600_000,
      maxAiFrictionEvents: 5,
      requiresNoCode: false,
    },
  }
}

function makeReport(overrides: Partial<JourneyReport> = {}): JourneyReport {
  return {
    steps: 1,
    durationMs: 100,
    aiFrictionEvents: 0,
    blockedTransitions: [],
    recordedSelectors: [],
    criteriaViolations: [],
    ...overrides,
  }
}

test.describe('TQ-119-01 journey-report-writer shard contract', { tag: ['@node:TQ-119-01'] }, () => {
  test.describe.configure({ mode: 'serial' })

  const appRoot = resolveAppRoot()
  const reportDir = resolve(appRoot, 'playwright-report', 'journey-reports')
  // 固有 prefix で本テストの残骸とそれ以外の journey-report を区別する
  const PERSONA_A = 'TQ119-A'
  const PERSONA_B = 'TQ119-B'

  test.beforeEach(async () => {
    // Per-test isolation: 本テスト由来のファイルだけ事前に掃除する
    try {
      const entries = await readdir(reportDir)
      await Promise.all(
        entries
          .filter((name) => name.startsWith(`${PERSONA_A}-`) || name.startsWith(`${PERSONA_B}-`))
          .map((name) => rm(resolve(reportDir, name), { force: true })),
      )
    } catch {
      // report dir がまだ存在しなくても OK
    }
    // sticky registry をリセットするため、同一 worker 内の前回実行の影響を消す
    const registry = (globalThis as unknown as Record<symbol, Map<string, string>>)[
      Symbol.for('school.journey-report-writer.sticky')
    ]
    if (registry) {
      for (const key of [...registry.keys()]) {
        if (key.startsWith(`${PERSONA_A}:`) || key.startsWith(`${PERSONA_B}:`)) {
          registry.delete(key)
        }
      }
    }
  })

  test('file name regex conforms to <persona>-<ISO8601>-<shard>.json contract', async () => {
    const name = journeyReportFileName(makePersona(PERSONA_A), {
      at: new Date('2026-04-16T12:34:56.789Z'),
      shard: { current: 1, total: 2 },
      workerIndex: 0,
      pid: 42,
    })
    expect(name).toBe(`${PERSONA_A}-20260416T123456789Z-1of2.json`)
    expect(name).toMatch(/^[A-Za-z0-9_.-]+-\d{8}T\d{9}Z-[A-Za-z0-9_.-]+\.json$/)
  })

  test('shard slug prefers explicit shard over worker fallback', () => {
    expect(shardSlug({ current: 3, total: 4 }, 0, 111)).toBe('3of4')
    expect(shardSlug(null, 2, 111)).toBe('w2-p111')
    expect(shardSlug(null, null, 111)).toBe('w0-p111')
  })

  test('resolveShardInfo picks env vars when no explicit shard', () => {
    const prevCur = process.env.PLAYWRIGHT_SHARD_CURRENT
    const prevTot = process.env.PLAYWRIGHT_SHARD_TOTAL
    try {
      process.env.PLAYWRIGHT_SHARD_CURRENT = '2'
      process.env.PLAYWRIGHT_SHARD_TOTAL = '3'
      expect(resolveShardInfo()).toEqual({ current: 2, total: 3 })
      expect(resolveShardInfo({ current: 1, total: 2 })).toEqual({ current: 1, total: 2 })
    } finally {
      process.env.PLAYWRIGHT_SHARD_CURRENT = prevCur
      process.env.PLAYWRIGHT_SHARD_TOTAL = prevTot
    }
  })

  test('two distinct shards produce two files (no collision)', async () => {
    const personaA = makePersona(PERSONA_A)
    const personaB = makePersona(PERSONA_B)

    const resultShard1 = await appendJourneyReport(
      personaA,
      'TQ-119 fixture shard 1',
      makeReport({ steps: 5 }),
      'chromium',
      { current: 1, total: 2 },
    )
    const resultShard2 = await appendJourneyReport(
      personaB,
      'TQ-119 fixture shard 2',
      makeReport({ steps: 7 }),
      'chromium',
      { current: 2, total: 2 },
    )

    expect(resultShard1.filePath).not.toBe(resultShard2.filePath)
    expect(resultShard1.fileName).toMatch(new RegExp(`^${PERSONA_A}-\\d{8}T\\d{9}Z-1of2\\.json$`))
    expect(resultShard2.fileName).toMatch(new RegExp(`^${PERSONA_B}-\\d{8}T\\d{9}Z-2of2\\.json$`))

    expect(existsSync(resultShard1.filePath)).toBe(true)
    expect(existsSync(resultShard2.filePath)).toBe(true)

    const parsed1 = JSON.parse(readFileSync(resultShard1.filePath, 'utf8')) as JourneyReportFile
    const parsed2 = JSON.parse(readFileSync(resultShard2.filePath, 'utf8')) as JourneyReportFile

    expect(parsed1.schemaVersion).toBe(JOURNEY_REPORT_SCHEMA_VERSION)
    expect(parsed1.shard).toBe('1of2')
    expect(parsed1.shardIndex).toBe(1)
    expect(parsed1.shardTotal).toBe(2)
    expect(parsed1.reports).toHaveLength(1)
    expect(parsed1.reports[0]?.personaId).toBe(PERSONA_A)
    expect(parsed1.reports[0]?.report.steps).toBe(5)

    expect(parsed2.schemaVersion).toBe(JOURNEY_REPORT_SCHEMA_VERSION)
    expect(parsed2.shard).toBe('2of2')
    expect(parsed2.reports).toHaveLength(1)
    expect(parsed2.reports[0]?.report.steps).toBe(7)
  })

  test('multiple writes in the same shard append to a single file', async () => {
    const persona = makePersona(PERSONA_A)

    const first = await appendJourneyReport(
      persona,
      'TQ-119 fixture append #1',
      makeReport({ steps: 1 }),
      'chromium',
      { current: 1, total: 1 },
    )
    const second = await appendJourneyReport(
      persona,
      'TQ-119 fixture append #2',
      makeReport({ steps: 2 }),
      'chromium',
      { current: 1, total: 1 },
    )

    expect(first.filePath).toBe(second.filePath)
    const parsed = JSON.parse(await readFile(first.filePath, 'utf8')) as JourneyReportFile
    expect(parsed.reports).toHaveLength(2)
    expect(parsed.reports[0]?.spec).toBe('TQ-119 fixture append #1')
    expect(parsed.reports[1]?.spec).toBe('TQ-119 fixture append #2')
  })
})
