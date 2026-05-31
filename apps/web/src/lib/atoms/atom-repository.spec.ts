import { afterEach, describe, expect, it, vi } from 'vitest'

const { createPublicReadClientMock, createServiceClientMock } = vi.hoisted(() => ({
  createPublicReadClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/public-read', () => ({
  createPublicReadClient: createPublicReadClientMock,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: createServiceClientMock,
}))

import {
  applyAtomListFilters,
  fetchAnchorForPersona,
  fetchAtomsByIds,
  fetchAtomsForUserPersonas,
  fetchCurrentAtoms,
  parseAtomListSearchParams,
  type AtomRecord,
} from './atom-repository'

type Row = Record<string, unknown>
type TableMap = Record<string, Row[]>

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createMockClient(tables: TableMap) {
  function createBuilder(table: string) {
    const rows = tables[table] ?? []
    const filters: Array<(row: Row) => boolean> = []
    let limitCount: number | null = null
    let orderBy: { column: string; ascending: boolean } | null = null

    const resolveRows = () => {
      let result = rows.filter((row) => filters.every((filter) => filter(row)))

      const activeOrderBy = orderBy
      if (activeOrderBy) {
        result = [...result].sort((left, right) => {
          const leftValue = left[activeOrderBy.column]
          const rightValue = right[activeOrderBy.column]
          if (leftValue === rightValue) return 0
          if (leftValue == null) return activeOrderBy.ascending ? -1 : 1
          if (rightValue == null) return activeOrderBy.ascending ? 1 : -1
          if (leftValue < rightValue) return activeOrderBy.ascending ? -1 : 1
          return activeOrderBy.ascending ? 1 : -1
        })
      }

      if (typeof limitCount === 'number') {
        result = result.slice(0, limitCount)
      }

      return { data: result, error: null }
    }

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]))
        return builder
      }),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        if (operator === 'is') {
          filters.push((row) => row[column] !== value)
        }
        return builder
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderBy = {
          column,
          ascending: options?.ascending ?? true,
        }
        return builder
      }),
      limit: vi.fn((value: number) => {
        limitCount = value
        return builder
      }),
      maybeSingle: vi.fn(async () => {
        const resolved = resolveRows()
        return {
          data: resolved.data[0] ?? null,
          error: null,
        }
      }),
      then: (onFulfilled: (value: { data: Row[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveRows()).then(onFulfilled, onRejected),
    }

    return builder
  }

  return {
    from: vi.fn((table: string) => createBuilder(table)),
  }
}

describe('atom-repository', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates current atoms and filters by min status and tags', async () => {
    createPublicReadClientMock.mockReturnValue(
      createMockClient({
        lesson_atoms: [
          { atom_id: 'atom.web.goal', current_version_id: 'v1' },
          { atom_id: 'atom.crm.goal', current_version_id: 'v2' },
        ],
        lesson_atom_versions: [
          {
            version_id: 'v1',
            atom_id: 'atom.web.goal',
            status: 'reviewed',
            yaml_content: {
              title: 'Web Goal',
              persona_tags: ['web-builder'],
              goal_tags: ['website-launch'],
              estimated_minutes: 25,
              deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
              evidence: ['screenshot'],
              media_slots: ['screen_capture'],
            },
            body_markdown: '# body',
            metadata: { revision: 1 },
          },
          {
            version_id: 'v2',
            atom_id: 'atom.crm.goal',
            status: 'draft',
            yaml_content: {
              title: 'CRM Goal',
              persona_tags: ['crm-builder'],
              goal_tags: ['crm-launch'],
              deliverable: { type: 'note', validation: 'manual' },
              evidence: [],
              media_slots: [],
            },
            body_markdown: null,
            metadata: {},
          },
        ],
        lesson_atom_capabilities: [
          { atom_id: 'atom.web.goal', capability: 'goal-ready', direction: 'output' },
          { atom_id: 'atom.web.goal', capability: 'brief-input', direction: 'input' },
          { atom_id: 'atom.crm.goal', capability: 'crm-ready', direction: 'output' },
        ],
        lesson_atom_prerequisites: [
          { atom_id: 'atom.web.goal', prerequisite_atom_id: 'atom.setup', strength: 'hard' },
          { atom_id: 'atom.web.goal', prerequisite_atom_id: 'atom.notes', strength: 'soft' },
        ],
      }),
    )

    const reviewedAtoms = await fetchCurrentAtoms()
    const allAtoms = await fetchCurrentAtoms({ minStatus: 'draft' })
    const filteredAtoms = await fetchCurrentAtoms({
      minStatus: 'draft',
      personaTag: 'web-builder',
      goalTag: 'website-launch',
    })

    expect(reviewedAtoms).toHaveLength(1)
    expect(allAtoms).toHaveLength(2)
    expect(filteredAtoms).toHaveLength(1)
    expect(filteredAtoms[0]).toMatchObject({
      atomId: 'atom.web.goal',
      title: 'Web Goal',
      capabilityInputs: ['brief-input'],
      capabilityOutputs: ['goal-ready'],
      hardPrerequisites: ['atom.setup'],
      softPrerequisites: ['atom.notes'],
      estimatedMinutes: 25,
      deliverable: {
        type: 'markdown_doc',
        validation: 'basic_manual_check_v1',
      },
    })
  })

  it('passes limit through to lesson_atoms .limit() when provided (W62 / W12-NEW-3)', async () => {
    // W62: `/lessons` SSR previously fetched all ~570 atoms even though it
    // rendered only the top 50. This test pins the contract that the
    // `limit` option threads down to the underlying Supabase query so the
    // DB stops materializing unused rows. We assert two things:
    //  1. `.limit(N)` is invoked on the lesson_atoms builder.
    //  2. The returned slice is bounded to N (proves the DB cap is active,
    //     not just a JS-side post-trim).
    const atomRows = Array.from({ length: 100 }, (_, index) => ({
      atom_id: `atom.${index}`,
      current_version_id: `v.${index}`,
    }))
    const versionRows = atomRows.map((row, index) => ({
      version_id: row.current_version_id,
      atom_id: row.atom_id,
      status: 'draft' as const,
      yaml_content: {
        title: `Atom ${index}`,
        deliverable: { type: 'note', validation: 'manual' },
      },
      body_markdown: null,
      metadata: {},
    }))

    const lessonAtomsLimitCalls: number[] = []
    const innerClient = createMockClient({
      lesson_atoms: atomRows,
      lesson_atom_versions: versionRows,
      lesson_atom_capabilities: [],
      lesson_atom_prerequisites: [],
    })

    createPublicReadClientMock.mockReturnValue({
      from: (table: string) => {
        const builder = innerClient.from(table)
        if (table === 'lesson_atoms') {
          const originalLimit = builder.limit.bind(builder)
          builder.limit = ((value: number) => {
            lessonAtomsLimitCalls.push(value)
            return originalLimit(value)
          }) as typeof builder.limit
        }
        return builder
      },
    })

    const limited = await fetchCurrentAtoms({ minStatus: 'draft', limit: 5 })

    expect(lessonAtomsLimitCalls).toEqual([5])
    expect(limited).toHaveLength(5)
  })

  it('starts relation chunks in parallel while preserving 100-id chunking', async () => {
    const atomRows = Array.from({ length: 600 }, (_, index) => ({
      atom_id: `atom.${index}`,
      current_version_id: `version.${index}`,
    }))
    const versionRows = atomRows.map((atomRow, index) => ({
      version_id: atomRow.current_version_id,
      atom_id: atomRow.atom_id,
      status: 'draft',
      yaml_content: {
        title: `Atom ${index}`,
        summary: `Summary ${index}`,
        deliverable: { type: 'note', validation: 'manual' },
      },
      body_markdown: `Body ${index}`,
      metadata: {},
    }))
    const tables: TableMap = {
      lesson_atoms: atomRows,
      lesson_atom_versions: versionRows,
      lesson_atom_capabilities: [],
      lesson_atom_prerequisites: [],
    }
    const releaseRelationQueries = deferred()
    const allRelationQueriesStarted = deferred()
    const relationStarts: Array<{ table: string; column: string; values: unknown[] }> = []
    const relationTables = new Set([
      'lesson_atom_versions',
      'lesson_atom_capabilities',
      'lesson_atom_prerequisites',
    ])

    function createDelayedBuilder(table: string) {
      const rows = tables[table] ?? []
      const filters: Array<(row: Row) => boolean> = []
      let inFilter: { column: string; values: unknown[] } | null = null

      const resolveRows = () => ({
        data: rows.filter((row) => filters.every((filter) => filter(row))),
        error: null,
      })

      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn((column: string, values: unknown[]) => {
          inFilter = { column, values }
          filters.push((row) => values.includes(row[column]))
          return builder
        }),
        not: vi.fn((column: string, operator: string, value: unknown) => {
          if (operator === 'is') {
            filters.push((row) => row[column] !== value)
          }
          return builder
        }),
        then: (
          onFulfilled: (value: { data: Row[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          if (!relationTables.has(table)) {
            return Promise.resolve(resolveRows()).then(onFulfilled, onRejected)
          }

          relationStarts.push({
            table,
            column: inFilter?.column ?? '',
            values: inFilter?.values ?? [],
          })
          if (relationStarts.length === 18) {
            allRelationQueriesStarted.resolve()
          }

          return releaseRelationQueries.promise
            .then(resolveRows)
            .then(onFulfilled, onRejected)
        },
      }

      return builder
    }

    createPublicReadClientMock.mockReturnValue({
      from: vi.fn((table: string) => createDelayedBuilder(table)),
    })

    const resultPromise = fetchCurrentAtoms({ minStatus: 'draft' })

    try {
      await Promise.race([
        allRelationQueriesStarted.promise,
        wait(100).then(() => {
          throw new Error(`Expected 18 relation chunks to start; saw ${relationStarts.length}`)
        }),
      ])

      expect(relationStarts).toHaveLength(18)
      expect(relationStarts.filter((start) => start.table === 'lesson_atom_versions')).toHaveLength(6)
      expect(relationStarts.filter((start) => start.table === 'lesson_atom_capabilities')).toHaveLength(6)
      expect(relationStarts.filter((start) => start.table === 'lesson_atom_prerequisites')).toHaveLength(6)
      expect(relationStarts.every((start) => start.values.length <= 100)).toBe(true)
    } finally {
      releaseRelationQueries.resolve()
    }

    await expect(resultPromise).resolves.toHaveLength(600)
  })

  it('loads persona anchors from lesson_anchors', async () => {
    createPublicReadClientMock.mockReturnValue(
      createMockClient({
        lesson_anchors: [
          {
            anchor_id: 'anchor.web.default',
            persona_id: 'persona.web-builder',
            ordered_atom_ids: ['atom.web.goal', 'atom.web.setup'],
            required_capabilities: ['goal-ready', 'deploy-ready'],
            description: 'default web anchor',
          },
        ],
      }),
    )

    const anchor = await fetchAnchorForPersona('persona.web-builder')

    expect(anchor).toEqual({
      anchorId: 'anchor.web.default',
      personaId: 'persona.web-builder',
      orderedAtomIds: ['atom.web.goal', 'atom.web.setup'],
      requiredCapabilities: ['goal-ready', 'deploy-ready'],
      description: 'default web anchor',
    })
  })

  it('collects atoms and anchors for a user persona set (TQ-222: only reviewed+ atoms)', async () => {
    createServiceClientMock.mockReturnValue(
      createMockClient({
        user_personas: [
          { user_id: 'user-1', persona_id: 'persona.web-builder', weight: 1 },
          { user_id: 'user-1', persona_id: 'persona.crm-builder', weight: 0.5 },
        ],
      }),
    )
    createPublicReadClientMock.mockReturnValue(
      createMockClient({
        lesson_anchors: [
          {
            anchor_id: 'anchor.web.default',
            persona_id: 'persona.web-builder',
            ordered_atom_ids: ['atom.web.goal'],
            required_capabilities: ['goal-ready'],
            description: 'default web anchor',
          },
        ],
        lesson_atoms: [
          { atom_id: 'atom.web.goal', current_version_id: 'v1' },
          { atom_id: 'atom.crm.goal', current_version_id: 'v2' },
          { atom_id: 'atom.draft.skipped', current_version_id: 'v3' },
        ],
        lesson_atom_versions: [
          {
            version_id: 'v1',
            atom_id: 'atom.web.goal',
            status: 'reviewed',
            yaml_content: {
              title: 'Web Goal',
              persona_tags: ['web-builder'],
              goal_tags: ['website-launch'],
              estimated_minutes: 25,
              deliverable: { type: 'markdown_doc', validation: 'manual' },
              evidence: [],
              media_slots: [],
            },
            body_markdown: null,
            metadata: {},
          },
          {
            version_id: 'v2',
            atom_id: 'atom.crm.goal',
            status: 'reviewed',
            yaml_content: {
              title: 'CRM Goal',
              persona_tags: ['crm-builder'],
              goal_tags: ['crm-launch'],
              estimated_minutes: 20,
              deliverable: { type: 'note', validation: 'manual' },
              evidence: [],
              media_slots: [],
            },
            body_markdown: null,
            metadata: {},
          },
          {
            // TQ-222: draft atoms must be filtered out before reaching learners.
            version_id: 'v3',
            atom_id: 'atom.draft.skipped',
            status: 'draft',
            yaml_content: {
              title: 'Draft Skipped',
              persona_tags: ['web-builder'],
              goal_tags: ['website-launch'],
              deliverable: { type: 'note', validation: 'manual' },
              evidence: [],
              media_slots: [],
            },
            body_markdown: null,
            metadata: {},
          },
        ],
        lesson_atom_capabilities: [],
        lesson_atom_prerequisites: [],
      }),
    )

    const result = await fetchAtomsForUserPersonas('user-1')

    expect(result.atoms.map((atom) => atom.atomId)).toEqual([
      'atom.web.goal',
      'atom.crm.goal',
    ])
    expect(result.atoms.every((atom) => atom.status === 'reviewed' || atom.status === 'experimental' || atom.status === 'stable')).toBe(true)
    expect(result.anchors).toHaveLength(2)
    expect(result.anchors[0]?.anchorId).toBe('anchor.web.default')
    expect(result.anchors[1]).toBeNull()
  })

  it('fetchAtomsByIds returns atoms in caller-provided order and drops missing ids', async () => {
    createPublicReadClientMock.mockReturnValue(
      createMockClient({
        lesson_atoms: [
          { atom_id: 'atom.a', current_version_id: 'vA' },
          { atom_id: 'atom.b', current_version_id: 'vB' },
          { atom_id: 'atom.c', current_version_id: 'vC' },
        ],
        lesson_atom_versions: [
          {
            version_id: 'vA',
            atom_id: 'atom.a',
            status: 'reviewed',
            yaml_content: {
              title: 'Atom A',
              deliverable: { type: 'note', validation: 'manual' },
            },
            body_markdown: null,
            metadata: {},
          },
          {
            version_id: 'vB',
            atom_id: 'atom.b',
            status: 'reviewed',
            yaml_content: {
              title: 'Atom B',
              deliverable: { type: 'note', validation: 'manual' },
            },
            body_markdown: null,
            metadata: {},
          },
          {
            version_id: 'vC',
            atom_id: 'atom.c',
            status: 'reviewed',
            yaml_content: {
              title: 'Atom C',
              deliverable: { type: 'note', validation: 'manual' },
            },
            body_markdown: null,
            metadata: {},
          },
        ],
        lesson_atom_capabilities: [],
        lesson_atom_prerequisites: [],
      }),
    )

    const result = await fetchAtomsByIds(['atom.c', 'atom.a', 'atom.missing', 'atom.b'])

    expect(result.map((atom) => atom.atomId)).toEqual(['atom.c', 'atom.a', 'atom.b'])
  })

  it('fetchAtomsByIds returns empty array for empty input', async () => {
    const result = await fetchAtomsByIds([])
    expect(result).toEqual([])
  })
})

// W56: SSR filter for /lessons. Asserts the filter helpers actually
// reduce atom counts so the SSR HTML payload (was 2.1 MB / 570 atoms) is
// bounded by the chosen limit + filter spec.
describe('applyAtomListFilters (W56 SSR filter)', () => {
  function makeAtom(overrides: Partial<AtomRecord>): AtomRecord {
    return {
      atomId: overrides.atomId ?? 'atom.test',
      versionId: 'v1',
      status: 'reviewed',
      yamlContent: {},
      bodyMarkdown: null,
      metadata: {},
      title: overrides.title ?? 'テストレッスン',
      personaTags: overrides.personaTags ?? [],
      goalTags: overrides.goalTags ?? [],
      capabilityInputs: overrides.capabilityInputs ?? [],
      capabilityOutputs: overrides.capabilityOutputs ?? [],
      hardPrerequisites: overrides.hardPrerequisites ?? [],
      softPrerequisites: overrides.softPrerequisites ?? [],
      estimatedMinutes: overrides.estimatedMinutes ?? null,
      deliverable: overrides.deliverable ?? { type: 'note', validation: 'manual' },
      evidence: overrides.evidence ?? [],
      mediaSlots: overrides.mediaSlots ?? [],
      ...overrides,
    }
  }

  const corpus: AtomRecord[] = [
    makeAtom({
      atomId: 'atom.web.goal',
      title: 'Web ゴール',
      personaTags: ['web-builder'],
      goalTags: ['website-launch', 'ai-content'],
      capabilityOutputs: ['goal-ready'],
      mediaSlots: ['video-walkthrough', 'screen_capture'],
      evidence: ['screenshot'],
      status: 'reviewed',
    }),
    makeAtom({
      atomId: 'atom.crm.kanban',
      title: 'CRM カンバン',
      personaTags: ['crm-builder'],
      goalTags: ['crm-launch'],
      capabilityOutputs: ['crm-ready'],
      mediaSlots: ['diagram'],
      evidence: ['screenshot'],
      status: 'draft',
    }),
    makeAtom({
      atomId: 'atom.writer.outline',
      title: 'AI ライターのアウトライン',
      personaTags: ['ai-writer', 'web-builder'],
      goalTags: ['writing', 'ai-content'],
      capabilityOutputs: ['outline-ready'],
      mediaSlots: ['video-tour'],
      evidence: ['markdown_doc'],
      status: 'stable',
    }),
    makeAtom({
      atomId: 'atom.marketer.audit',
      title: 'マーケター監査',
      personaTags: ['ai-marketer'],
      goalTags: ['marketing'],
      capabilityOutputs: ['audit-ready'],
      mediaSlots: ['diagram'],
      evidence: ['screenshot'],
      status: 'experimental',
    }),
  ]

  it('returns all atoms unchanged when filter spec is empty', () => {
    const result = applyAtomListFilters(corpus, {})
    expect(result).toHaveLength(corpus.length)
  })

  it('reduces atom count when persona filter is applied (W56 size check)', () => {
    const before = corpus.length
    const result = applyAtomListFilters(corpus, { persona: 'ai-writer' })
    expect(result.length).toBeLessThan(before)
    expect(result.every((atom) => atom.personaTags.includes('ai-writer'))).toBe(true)
  })

  it('reduces atom count when track filter is applied (alias for goalTag)', () => {
    const before = corpus.length
    const result = applyAtomListFilters(corpus, { track: 'ai-content' })
    expect(result.length).toBeLessThan(before)
    expect(result.every((atom) => atom.goalTags.includes('ai-content'))).toBe(true)
    // The Web ゴール and AI ライター atoms both carry ai-content goal tag.
    expect(result.map((atom) => atom.atomId).sort()).toEqual([
      'atom.web.goal',
      'atom.writer.outline',
    ])
  })

  it('reduces atom count when contentType filter is applied (matches mediaSlots/evidence)', () => {
    const before = corpus.length
    const result = applyAtomListFilters(corpus, { contentType: 'video' })
    expect(result.length).toBeLessThan(before)
    expect(result.map((atom) => atom.atomId).sort()).toEqual([
      'atom.web.goal',
      'atom.writer.outline',
    ])
  })

  it('reduces atom count when q (search) filter is applied', () => {
    const before = corpus.length
    const result = applyAtomListFilters(corpus, { q: 'カンバン' })
    expect(result.length).toBeLessThan(before)
    expect(result.map((atom) => atom.atomId)).toEqual(['atom.crm.kanban'])
  })

  it('reduces atom count when status filter is applied', () => {
    const before = corpus.length
    const result = applyAtomListFilters(corpus, { status: 'stable' })
    expect(result.length).toBeLessThan(before)
    expect(result.map((atom) => atom.atomId)).toEqual(['atom.writer.outline'])
  })

  it('caps result count at limit even without other filters', () => {
    const result = applyAtomListFilters(corpus, { limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('combines multiple filters (persona + track + contentType + limit)', () => {
    const result = applyAtomListFilters(corpus, {
      persona: 'web-builder',
      track: 'ai-content',
      contentType: 'video',
      limit: 50,
    })
    // Both atom.web.goal and atom.writer.outline have web-builder persona
    // and ai-content goal tag and a video media slot.
    expect(result.map((atom) => atom.atomId).sort()).toEqual([
      'atom.web.goal',
      'atom.writer.outline',
    ])
  })

  it('uses resolveSummary callback for q haystack', () => {
    const result = applyAtomListFilters(
      corpus,
      { q: 'スコープ確認' },
      (atom) => (atom.atomId === 'atom.crm.kanban' ? 'スコープ確認のためのカンバン' : ''),
    )
    expect(result.map((atom) => atom.atomId)).toEqual(['atom.crm.kanban'])
  })
})

describe('parseAtomListSearchParams (W56)', () => {
  it('returns default limit when no params provided', () => {
    const result = parseAtomListSearchParams({}, { limit: 50 })
    expect(result).toEqual({
      q: undefined,
      persona: undefined,
      track: undefined,
      contentType: undefined,
      status: undefined,
      limit: 50,
    })
  })

  it('parses recognized keys and trims whitespace', () => {
    const result = parseAtomListSearchParams(
      {
        q: '  ai writer  ',
        persona: 'ai-writer',
        track: 'ai-content',
        contentType: 'video',
        status: 'reviewed',
        limit: '25',
        unknown: 'ignored',
      },
      { limit: 50 },
    )
    expect(result).toEqual({
      q: 'ai writer',
      persona: 'ai-writer',
      track: 'ai-content',
      contentType: 'video',
      status: 'reviewed',
      limit: 25,
    })
  })

  it('caps explicit limit at 1000 to bound payload', () => {
    const result = parseAtomListSearchParams({ limit: '99999' }, { limit: 50 })
    expect(result.limit).toBe(1000)
  })

  it('falls back to default limit when limit is invalid', () => {
    const result = parseAtomListSearchParams({ limit: 'not-a-number' }, { limit: 50 })
    expect(result.limit).toBe(50)
  })

  it('falls back to default limit when limit is zero or negative', () => {
    expect(parseAtomListSearchParams({ limit: '0' }, { limit: 50 }).limit).toBe(50)
    expect(parseAtomListSearchParams({ limit: '-5' }, { limit: 50 }).limit).toBe(50)
  })

  it('drops empty-string params (treats them as absent)', () => {
    const result = parseAtomListSearchParams(
      { q: '', persona: '   ', track: undefined },
      { limit: 50 },
    )
    expect(result.q).toBeUndefined()
    expect(result.persona).toBeUndefined()
    expect(result.track).toBeUndefined()
  })

  it('handles array-shaped values by picking the first non-empty entry', () => {
    const result = parseAtomListSearchParams({ persona: ['', 'web-builder', 'other'] }, { limit: 50 })
    expect(result.persona).toBe('web-builder')
  })

  it('rejects unknown status values', () => {
    const result = parseAtomListSearchParams({ status: 'bogus' }, { limit: 50 })
    expect(result.status).toBeUndefined()
  })
})
