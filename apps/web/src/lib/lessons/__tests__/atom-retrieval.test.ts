/**
 * `retrieveCandidateAtomsForGoal` unit tests — TQ-248 (C7 解消)
 *
 * 検証範囲:
 * - pgvector が >= 5 件返したら vector を採用、retrievalMethod=`vector`
 * - pgvector が空 / 失敗なら tag-filter にフォールバック
 * - atom 全 0 件なら `empty` を返す（matcher は空集合許容）
 * - persona / goal tag フィルタが any-match で機能
 * - `LessonMatcherSubAgent.run({ candidateAtoms })` に直接通せる shape
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { retrieveCandidateAtomsForGoal } from '@/lib/lessons/atom-retrieval'
import type { AtomSearchResult } from '@/lib/atoms/atom-embeddings'
import type { AtomRecord } from '@/lib/atoms/atom-repository'
import {
  LessonMatcherSubAgent,
  type LessonMatcherInput,
} from '@/lib/mentor/sub-agents/lesson-matcher'
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'

vi.mock('@/lib/atoms/atom-embeddings', () => ({
  searchAtomsBySimilarity: vi.fn(),
}))
vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchCurrentAtoms: vi.fn(),
}))

import { searchAtomsBySimilarity } from '@/lib/atoms/atom-embeddings'
import { fetchCurrentAtoms } from '@/lib/atoms/atom-repository'

const searchMock = vi.mocked(searchAtomsBySimilarity)
const fetchMock = vi.mocked(fetchCurrentAtoms)

function vectorRow(over: Partial<AtomSearchResult> = {}): AtomSearchResult {
  return {
    atomId: 'atom-1',
    title: 'Vercel デプロイ入門',
    summary: '',
    goalTags: ['landing-page'],
    personaTags: ['web-creator'],
    capabilityOutputs: ['deploy'],
    hardPrerequisites: [],
    estimatedMinutes: 30,
    similarity: 0.8,
    ...over,
  }
}

function dbAtom(over: Partial<AtomRecord> = {}): AtomRecord {
  return {
    atomId: 'atom-1',
    versionId: 'v1',
    status: 'reviewed',
    yamlContent: {},
    bodyMarkdown: null,
    metadata: {},
    title: 'Vercel デプロイ入門',
    personaTags: ['web-creator'],
    goalTags: ['landing-page'],
    capabilityInputs: [],
    capabilityOutputs: ['deploy'],
    hardPrerequisites: [],
    softPrerequisites: [],
    estimatedMinutes: 30,
    deliverable: { type: '', validation: '' },
    evidence: [],
    mediaSlots: [],
    ...over,
  }
}

beforeEach(() => {
  searchMock.mockReset()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('retrieveCandidateAtomsForGoal — TQ-248', () => {
  it('採用: pgvector が >= 5 件返したら vector を採用', async () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      vectorRow({ atomId: `atom-v-${i}`, similarity: 0.5 + i * 0.05 }),
    )
    searchMock.mockResolvedValue(rows)

    const result = await retrieveCandidateAtomsForGoal({
      goal: 'LP を作って公開する',
      personaIds: ['persona.web-creator'],
    })

    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock.mock.calls[0]?.[0]?.personaTags).toEqual(['web-creator'])
    expect(result.retrievalMethod).toBe('vector')
    expect(result.candidateAtoms).toHaveLength(6)
    expect(result.candidateAtoms[0]?.atomId).toBe('atom-v-0')
    expect(result.candidateAtoms[0]?.similarity).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('フォールバック: pgvector が < 5 件なら tag-filter で再取得', async () => {
    searchMock.mockResolvedValue([vectorRow()]) // 1 件のみ
    fetchMock.mockResolvedValue([
      dbAtom({ atomId: 'atom-tag-1' }),
      dbAtom({ atomId: 'atom-tag-2', personaTags: ['p-other'] }),
    ])

    const result = await retrieveCandidateAtomsForGoal({
      goal: 'LP を作る',
      personaIds: ['web-creator'],
    })

    expect(result.retrievalMethod).toBe('tag-filter')
    // persona any-match: web-creator にマッチする atom-tag-1 のみ採用
    // atom-tag-2 は personaTags=['p-other'] で any-match しない
    expect(result.candidateAtoms.map((a) => a.atomId)).toEqual(['atom-tag-1'])
    expect(result.candidateAtoms[0]?.similarity).toBeNull()
  })

  it('フォールバック: pgvector が throw しても tag-filter で継続', async () => {
    searchMock.mockRejectedValue(new Error('rpc_unavailable'))
    fetchMock.mockResolvedValue([dbAtom()])

    const result = await retrieveCandidateAtomsForGoal({
      goal: 'LP',
      personaIds: ['web-creator'],
    })
    expect(result.retrievalMethod).toBe('tag-filter')
    expect(result.candidateAtoms).toHaveLength(1)
  })

  it('空: vector も tag-filter も空なら empty を返す', async () => {
    searchMock.mockResolvedValue([])
    fetchMock.mockResolvedValue([])

    const result = await retrieveCandidateAtomsForGoal({
      goal: 'LP',
      personaIds: [],
    })
    expect(result.retrievalMethod).toBe('empty')
    expect(result.candidateAtoms).toEqual([])
  })

  it('persona 未指定なら personaTags 引数を渡さない', async () => {
    searchMock.mockResolvedValue(Array.from({ length: 5 }, (_, i) => vectorRow({ atomId: `v-${i}` })))
    await retrieveCandidateAtomsForGoal({ goal: 'foo' })
    const call = searchMock.mock.calls[0]?.[0]
    expect(call?.personaTags).toBeUndefined()
  })

  it('maxCandidates で結果数を切る', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => vectorRow({ atomId: `v-${i}` }))
    searchMock.mockResolvedValue(rows)
    const result = await retrieveCandidateAtomsForGoal({
      goal: 'LP',
      maxCandidates: 5,
    })
    expect(result.candidateAtoms).toHaveLength(5)
  })

  it('LessonMatcherSubAgent.run() に直接渡せる shape を返す（C7 統合確認）', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      vectorRow({
        atomId: `atom-${i}`,
        capabilityOutputs: ['deploy'],
        personaTags: ['web-creator'],
        goalTags: ['landing-page'],
      }),
    )
    searchMock.mockResolvedValue(rows)

    const retrieval = await retrieveCandidateAtomsForGoal({
      goal: 'LP を作って Vercel に Deploy',
      personaIds: ['persona.web-creator'],
    })

    // 実 sub-agent に通して matched_atoms が空でないことを確認 (C7 解消の本旨)
    const tree: GoalTreeDecomposition = {
      goal_summary: 'LP',
      objectives: [
        {
          id: 'obj-1',
          title: '公開',
          milestones: [
            {
              id: 'ms-1',
              title: '公開',
              leafTasks: [
                {
                  id: 'leaf-deploy',
                  title: 'Vercel に Deploy する',
                  human_judgment_required: false,
                  automation_potential: 'high',
                  recommended_capability: 'deploy',
                },
              ],
            },
          ],
        },
      ],
    }
    const subAgent = new LessonMatcherSubAgent()
    const matcherInput: LessonMatcherInput = {
      goalTree: tree,
      candidateAtoms: retrieval.candidateAtoms,
      learnerProfile: { personaTags: ['web-creator'] },
    }
    const out = await subAgent.run(matcherInput)

    expect(out.summary.candidateCount).toBe(5)
    expect(out.matches.length).toBeGreaterThan(0)
    expect(out.matches[0]?.leafId).toBe('leaf-deploy')
    expect(out.matches[0]?.atomId).toMatch(/^atom-/)
  })
})
