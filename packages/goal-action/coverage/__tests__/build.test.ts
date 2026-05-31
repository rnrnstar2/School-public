import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildCoverageIndex } from '../src/build.js'

const BASELINE_CONTENT_HASH = 'cac766f1d3cae8038117acf5244db998b63d0f3c'

type FactoryLessonFixture = {
  fileName: string
  id: string
  title: string
  status?: 'draft' | 'published' | 'reviewed' | 'experimental' | 'stable' | 'deprecated'
  summary?: string
  capability_inputs?: string[]
  capability_outputs?: string[]
  hard_prerequisites?: string[]
  soft_prerequisites?: string[]
  persona_tags?: string[]
  goal_tags?: string[]
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

async function createFactoryDir(fixtures: FactoryLessonFixture[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coverage-factory-'))
  tempDirs.push(dir)

  await Promise.all(
    fixtures.map((fixture) =>
      fs.writeFile(
        path.join(dir, fixture.fileName),
        yaml.dump({
          id: fixture.id,
          title: fixture.title,
          summary: fixture.summary ?? '',
          persona_tags: fixture.persona_tags ?? [],
          goal_tags: fixture.goal_tags ?? [],
          capability_inputs: fixture.capability_inputs ?? [],
          capability_outputs: fixture.capability_outputs ?? [],
          hard_prerequisites: fixture.hard_prerequisites ?? [],
          soft_prerequisites: fixture.soft_prerequisites ?? [],
          status: fixture.status ?? 'published',
        }),
      ),
    ),
  )

  return dir
}

async function baselineSources() {
  const factoryDir = await createFactoryDir([
    {
      fileName: 'atom.web-builder-ai.choose-project-goal.yaml',
      id: 'atom.web-builder-ai.choose-project-goal',
      title: 'Choose the project goal',
      capability_outputs: ['scope-definition'],
      goal_tags: ['start-project'],
    },
    {
      fileName: 'atom.web-builder-ai.define-mvp-pages.yaml',
      id: 'atom.web-builder-ai.define-mvp-pages',
      title: 'Define MVP pages',
      capability_inputs: ['scope-definition'],
      capability_outputs: ['workflow-planning'],
      hard_prerequisites: ['atom.web-builder-ai.choose-project-goal'],
      goal_tags: ['mvp-planning'],
    },
    {
      fileName: 'atom.ai-automation.design-workflow.yaml',
      id: 'atom.ai-automation.design-workflow',
      title: 'Design an automation workflow',
      capability_outputs: ['workflow-design'],
      goal_tags: ['automation'],
    },
    {
      fileName: 'atom.ai-content-creator.outline-series.yaml',
      id: 'atom.ai-content-creator.outline-series',
      title: 'Outline a content series',
      capability_outputs: ['content-outline'],
      goal_tags: ['content-plan'],
    },
  ])

  return {
    factorySources: [{ dir: factoryDir }],
  }
}

describe('buildCoverageIndex', () => {
  it('returns a populated Coverage Index from canonical factory atoms (AC-02)', async () => {
    const result = await buildCoverageIndex(await baselineSources())

    expect(result.schema_version).toBe('v1')
    expect(result.content_hash).toHaveLength(40)
    expect(result.lessons.length).toBeGreaterThan(0)
    expect(result.atoms.length).toBeGreaterThan(0)
    expect(result.capabilities.length).toBeGreaterThan(0)

    expect(result.lessons.map((lesson) => lesson.id)).toEqual([
      'atom.ai-automation.design-workflow',
      'atom.ai-content-creator.outline-series',
      'atom.web-builder-ai.choose-project-goal',
      'atom.web-builder-ai.define-mvp-pages',
    ])
    expect(result.lessons.every((lesson) => lesson.track_id === null)).toBe(true)
  })

  it('produces identical content_hash for identical input (AC-03)', async () => {
    const first = await buildCoverageIndex(await baselineSources())
    const second = await buildCoverageIndex(await baselineSources())
    expect(first.schema_version).toBe('v1')
    expect(first.content_hash).toBe(BASELINE_CONTENT_HASH)
    expect(first.content_hash).toBe(second.content_hash)
  })

  it('keeps the first deterministic copy when a lesson id is duplicated and warns (AC-04)', async () => {
    const logger = { warn: vi.fn() }

    const olderFactoryDir = await createFactoryDir([
      {
        fileName: 'atom.web-builder-ai.duplicate.yaml',
        id: 'atom.web-builder-ai.duplicate',
        title: 'Old copy',
        capability_outputs: ['dup-cap'],
      },
    ])
    const newerFactoryDir = await createFactoryDir([
      {
        fileName: 'atom.web-builder-ai.duplicate.yaml',
        id: 'atom.web-builder-ai.duplicate',
        title: 'New copy',
        capability_outputs: ['dup-cap'],
      },
    ])

    const result = await buildCoverageIndex({
      factorySources: [{ dir: olderFactoryDir }, { dir: newerFactoryDir }],
      logger,
    })

    const duplicated = result.lessons.filter(
      (l) => l.id === 'atom.web-builder-ai.duplicate',
    )
    expect(duplicated).toHaveLength(1)
    expect(duplicated[0]?.title).toBe('Old copy')
    expect(duplicated[0]?.updated_at).toBe('deterministic')

    expect(logger.warn).toHaveBeenCalled()
    const warnCallsText = logger.warn.mock.calls
      .map((call) => String(call[0]))
      .join('\n')
    expect(warnCallsText).toMatch(/duplicate lesson id/)

    const dropWarnings = result.warnings.filter(
      (w) => w.code === 'duplicate_lesson_dropped',
    )
    expect(dropWarnings).toHaveLength(1)
    expect(dropWarnings[0]?.lesson_id).toBe('atom.web-builder-ai.duplicate')
  })

  it('excludes deprecated lessons and emits a warning (AC-05)', async () => {
    const factoryDir = await createFactoryDir([
      {
        fileName: 'atom.web-builder-ai.active.yaml',
        id: 'atom.web-builder-ai.active',
        title: 'Active lesson',
        capability_outputs: ['live-cap'],
      },
      {
        fileName: 'atom.web-builder-ai.deprecated.yaml',
        id: 'atom.web-builder-ai.deprecated',
        title: 'Legacy lesson',
        status: 'deprecated',
        capability_outputs: ['dead-cap'],
      },
    ])

    const logger = { warn: vi.fn() }
    const result = await buildCoverageIndex({
      factorySources: [{ dir: factoryDir }],
      logger,
    })

    const lessonIds = result.lessons.map((l) => l.id)
    expect(lessonIds).toContain('atom.web-builder-ai.active')
    expect(lessonIds).not.toContain('atom.web-builder-ai.deprecated')

    const capabilityIds = result.capabilities.map((c) => c.id)
    expect(capabilityIds).toContain('live-cap')
    expect(capabilityIds).not.toContain('dead-cap')

    const deprecationWarnings = result.warnings.filter(
      (w) => w.code === 'deprecated_lesson_excluded',
    )
    expect(deprecationWarnings).toHaveLength(1)
    expect(deprecationWarnings[0]?.lesson_id).toBe(
      'atom.web-builder-ai.deprecated',
    )

    expect(logger.warn).toHaveBeenCalled()
  })

  it('sorts lessons + capabilities deterministically so hash is stable regardless of input order', async () => {
    const firstDir = await createFactoryDir([
      {
        fileName: 'atom.web-builder-ai.bee.yaml',
        id: 'atom.web-builder-ai.bee',
        title: 'Bee',
        capability_outputs: ['b-cap'],
      },
    ])
    const secondDir = await createFactoryDir([
      {
        fileName: 'atom.web-builder-ai.ayy.yaml',
        id: 'atom.web-builder-ai.ayy',
        title: 'Ayy',
        capability_outputs: ['a-cap'],
      },
    ])

    const resultA = await buildCoverageIndex({
      factorySources: [{ dir: firstDir }, { dir: secondDir }],
    })
    const resultB = await buildCoverageIndex({
      factorySources: [{ dir: secondDir }, { dir: firstDir }],
    })

    expect(resultA.content_hash).toBe(resultB.content_hash)
    expect(resultA.lessons.map((l) => l.id)).toEqual([
      'atom.web-builder-ai.ayy',
      'atom.web-builder-ai.bee',
    ])
  })
})
