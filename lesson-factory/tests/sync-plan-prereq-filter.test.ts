import { describe, expect, it } from 'vitest'

import type { Lesson } from '../src/core/types.js'
import { buildSyncPlan } from '../src/sync/plan.js'
import type {
  AtomSnapshot,
  SourceDocument,
  SyncSnapshot,
  SyncSources,
} from '../src/sync/types.js'

function createAtomSource(
  id: string,
  overrides: Partial<Lesson> = {},
): SourceDocument<Lesson> {
  const value: Lesson = {
    id,
    title: id,
    persona_tags: [],
    goal_tags: [],
    capability_inputs: [],
    capability_outputs: [],
    hard_prerequisites: [],
    soft_prerequisites: [],
    deliverable: {
      type: 'markdown_doc',
      validation: 'test-validation',
    },
    evidence: [],
    media_slots: [],
    freshness_sources: [],
    status: 'draft',
    ...overrides,
  }

  return {
    kind: 'atom',
    id,
    absolutePath: `/tmp/${id}.yaml`,
    relativePath: `lesson-factory/lessons/atoms/${id}.yaml`,
    rawYaml: `id: ${id}\n`,
    yamlHash: `hash:${id}`,
    value,
  }
}

function createAtomSnapshot(
  atomId: string,
  prerequisites: AtomSnapshot['prerequisites'],
): AtomSnapshot {
  return {
    atomId,
    sourcePath: `lesson-factory/lessons/atoms/${atomId}.yaml`,
    currentVersionId: `version:${atomId}`,
    currentYamlHash: `hash:${atomId}`,
    versions: [{
      versionId: `version:${atomId}`,
      yamlHash: `hash:${atomId}`,
      importedAt: '2026-04-01T00:00:00.000Z',
      status: 'draft',
    }],
    capabilities: [],
    prerequisites,
  }
}

function emptySnapshot(): SyncSnapshot {
  return {
    atoms: new Map(),
    personas: new Map(),
    anchors: new Map(),
  }
}

describe('buildSyncPlan prerequisite filtering', () => {
  it('drops missing prerequisites from desired state and records warnings', () => {
    const sources: SyncSources = {
      atoms: [
        createAtomSource('atom.x.a', {
          hard_prerequisites: ['atom.x.b', 'atom.x.ghost'],
        }),
        createAtomSource('atom.x.b'),
      ],
      personas: [],
      anchors: [],
      anchorsDirectoryExists: true,
    }
    const snapshot: SyncSnapshot = {
      ...emptySnapshot(),
      atoms: new Map([
        ['atom.x.a', createAtomSnapshot('atom.x.a', [
          {
            prerequisiteAtomId: 'atom.x.removed',
            strength: 'hard',
          },
        ])],
      ]),
    }

    const plan = buildSyncPlan({
      sources,
      snapshot,
      dryRun: true,
      generatedAt: '2026-04-20T00:00:00.000Z',
    })

    const atomPlan = plan.atoms.find((item) => item.atomId === 'atom.x.a')

    expect(atomPlan).toBeDefined()
    expect(atomPlan?.source?.value.hard_prerequisites).toEqual(['atom.x.b'])
    expect(atomPlan?.source?.value.soft_prerequisites).toEqual([])
    expect(atomPlan?.prerequisiteDiff.add).toEqual([
      {
        prerequisiteAtomId: 'atom.x.b',
        strength: 'hard',
      },
    ])
    expect(atomPlan?.prerequisiteDiff.remove).toEqual([
      {
        prerequisiteAtomId: 'atom.x.removed',
        strength: 'hard',
      },
    ])
    expect(plan.warnings).toEqual([
      'atom.x.a: dropped prerequisite atom.x.ghost (not in source atoms)',
    ])
  })
})
