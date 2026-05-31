import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runLessonSync } from '../src/sync/run.js'
import type {
  SyncPlan,
  SyncRepository,
  SyncSnapshot,
} from '../src/sync/types.js'
import { withTempLessonFactory } from './helpers.js'

const ATOM_YAML = `id: atom.sync.rls-basics
title: Supabase RLSの基礎
persona_tags: [web-builder]
goal_tags: [db-security]
capability_inputs: [supabase-project-created]
capability_outputs: [understand-rls]
hard_prerequisites: []
soft_prerequisites: []
deliverable:
  type: sql_policy
  validation: rls_policy_basic_v1
evidence: [sql_snippet]
media_slots: [diagram]
freshness_sources: [supabase/rls]
status: draft
`

const PERSONA_YAML = `id: persona.web-builder
name: Web Builder
background: Builds a small site with browser-first tools.
goals: [publish-site]
constraints: [limited-time]
preferred_tools: [supabase, vercel]
learning_pace: moderate
`

const ANCHOR_YAML = `id: anchor.web-builder.start
persona_id: persona.web-builder
ordered_atom_ids: [atom.sync.rls-basics]
required_capabilities: [understand-rls]
description: Web builder onboarding anchor.
`

function sha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function emptySnapshot(): SyncSnapshot {
  return {
    atoms: new Map(),
    personas: new Map(),
    anchors: new Map(),
  }
}

class MemorySyncRepository implements SyncRepository {
  readonly loadSnapshotMock = vi.fn<() => Promise<SyncSnapshot>>()
  readonly applyPlanMock = vi.fn<(plan: SyncPlan) => Promise<void>>()

  constructor(private readonly snapshot: SyncSnapshot) {
    this.loadSnapshotMock.mockImplementation(async () => this.snapshot)
    this.applyPlanMock.mockImplementation(async (_plan: SyncPlan) => {})
  }

  async loadSnapshot(): Promise<SyncSnapshot> {
    return await this.loadSnapshotMock()
  }

  async applyPlan(plan: SyncPlan): Promise<void> {
    await this.applyPlanMock(plan)
  }
}

async function writeLessonFiles(root: string): Promise<void> {
  await mkdir(path.join(root, 'lessons', 'personas'), { recursive: true })
  await mkdir(path.join(root, 'lessons', 'anchors'), { recursive: true })
  await clearYamlFiles(path.join(root, 'lessons', 'atoms'))
  await clearYamlFiles(path.join(root, 'lessons', 'personas'))
  await clearYamlFiles(path.join(root, 'lessons', 'anchors'))

  await writeFile(path.join(root, 'lessons', 'atoms', 'atom.sync.rls-basics.yaml'), ATOM_YAML, 'utf8')
  await writeFile(path.join(root, 'lessons', 'personas', 'persona.web-builder.yaml'), PERSONA_YAML, 'utf8')
  await writeFile(path.join(root, 'lessons', 'anchors', 'anchor.web-builder.start.yaml'), ANCHOR_YAML, 'utf8')
}

async function clearYamlFiles(directoryPath: string): Promise<void> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
      .map((entry) => rm(path.join(directoryPath, entry.name), { force: true })),
  )
}

describe('runLessonSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects diffs and writes a sync log', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      await writeLessonFiles(lessonFactoryRoot)

      const repository = new MemorySyncRepository({
        atoms: new Map([
          ['atom.legacy.deleted', {
            atomId: 'atom.legacy.deleted',
            sourcePath: 'lesson-factory/lessons/atoms/atom.legacy.deleted.yaml',
            currentVersionId: 'version-legacy',
            currentYamlHash: 'legacy-hash',
            versions: [{ versionId: 'version-legacy', yamlHash: 'legacy-hash', importedAt: '2026-04-01T00:00:00.000Z', status: 'draft' }],
            capabilities: [{ capability: 'legacy-capability', direction: 'output' }],
            prerequisites: [],
          }],
        ]),
        personas: new Map([
          ['persona.legacy.deleted', {
            personaId: 'persona.legacy.deleted',
            sourcePath: 'lesson-factory/lessons/personas/persona.legacy.deleted.yaml',
            currentVersionId: 'persona-version-legacy',
            currentYamlHash: 'legacy-hash',
            versions: [{ versionId: 'persona-version-legacy', yamlHash: 'legacy-hash', importedAt: '2026-04-01T00:00:00.000Z' }],
          }],
        ]),
        anchors: new Map([
          ['anchor.legacy.deleted', {
            anchorId: 'anchor.legacy.deleted',
            yamlHash: 'legacy-anchor-hash',
          }],
        ]),
      })

      const result = await runLessonSync({
        repository,
        now: new Date('2026-04-08T03:00:00.000Z'),
      })

      expect(result.plan.counts.totalChanges).toBe(5)
      expect(result.plan.atoms.find((item) => item.atomId === 'atom.sync.rls-basics')?.state).toBe('create')
      expect(result.plan.atoms.find((item) => item.atomId === 'atom.legacy.deleted')?.state).toBe('deactivate')
      expect(result.plan.personas.find((item) => item.personaId === 'persona.web-builder')?.state).toBe('create')
      expect(result.plan.personas.find((item) => item.personaId === 'persona.legacy.deleted')?.state).toBe('deactivate')
      expect(result.plan.anchors.find((item) => item.anchorId === 'anchor.web-builder.start')?.state).toBe('create')
      expect(result.plan.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('Atom file deleted or missing'),
        expect.stringContaining('Persona file deleted or missing'),
        expect.stringContaining('Anchor file deleted or missing; keeping DB row intact'),
      ]))
      expect(repository.applyPlanMock).toHaveBeenCalledTimes(1)

      const log = JSON.parse(await readFile(result.logPath, 'utf8')) as SyncPlan
      expect(log.counts.totalChanges).toBe(5)
    })
  })

  it('skips apply when yaml hashes already match current rows', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      await writeLessonFiles(lessonFactoryRoot)

      const repository = new MemorySyncRepository({
        atoms: new Map([
          ['atom.sync.rls-basics', {
            atomId: 'atom.sync.rls-basics',
            sourcePath: 'lesson-factory/lessons/atoms/atom.sync.rls-basics.yaml',
            currentVersionId: 'atom-version-1',
            currentYamlHash: sha256(ATOM_YAML),
            versions: [{ versionId: 'atom-version-1', yamlHash: sha256(ATOM_YAML), importedAt: '2026-04-01T00:00:00.000Z', status: 'draft' }],
            capabilities: [
              { capability: 'supabase-project-created', direction: 'input' },
              { capability: 'understand-rls', direction: 'output' },
            ],
            prerequisites: [],
          }],
        ]),
        personas: new Map([
          ['persona.web-builder', {
            personaId: 'persona.web-builder',
            sourcePath: 'lesson-factory/lessons/personas/persona.web-builder.yaml',
            currentVersionId: 'persona-version-1',
            currentYamlHash: sha256(PERSONA_YAML),
            versions: [{ versionId: 'persona-version-1', yamlHash: sha256(PERSONA_YAML), importedAt: '2026-04-01T00:00:00.000Z' }],
          }],
        ]),
        anchors: new Map([
          ['anchor.web-builder.start', {
            anchorId: 'anchor.web-builder.start',
            yamlHash: sha256(ANCHOR_YAML),
          }],
        ]),
      })

      const result = await runLessonSync({
        repository,
        now: new Date('2026-04-08T03:00:00.000Z'),
      })

      expect(result.plan.counts.totalChanges).toBe(0)
      expect(repository.applyPlanMock).not.toHaveBeenCalled()
    })
  })

  it('reports diffs in dry-run mode without applying them', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      await writeLessonFiles(lessonFactoryRoot)

      const repository = new MemorySyncRepository(emptySnapshot())
      const result = await runLessonSync({
        repository,
        dryRun: true,
        now: new Date('2026-04-08T03:00:00.000Z'),
      })

      expect(result.plan.dryRun).toBe(true)
      expect(result.plan.counts.totalChanges).toBe(3)
      expect(repository.applyPlanMock).not.toHaveBeenCalled()
      expect(await readFile(result.logPath, 'utf8')).toContain('"dryRun": true')
    })
  })
})
