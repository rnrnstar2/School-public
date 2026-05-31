import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { CoverageIndexSchema, type LessonNode } from '@school/goal-action-coverage'
import { CanonicalActionSchema, type CanonicalAction } from '@school/goal-action-normalizer'

import {
  DEFAULT_MATCH_WEIGHTS,
  buildMatchBreakdown,
  composeMatchScore,
  matchActions,
  scoreCapability,
} from '../src/index.js'

function makeLesson(overrides: Partial<LessonNode> & Pick<LessonNode, 'id' | 'title'>): LessonNode {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary ?? '',
    track_id: overrides.track_id ?? 'web-builder',
    module_id: overrides.module_id ?? null,
    milestone_id: overrides.milestone_id ?? null,
    status: overrides.status ?? 'published',
    capability_inputs: overrides.capability_inputs ?? [],
    capability_outputs: overrides.capability_outputs ?? [],
    hard_prerequisites: overrides.hard_prerequisites ?? [],
    soft_prerequisites: overrides.soft_prerequisites ?? [],
    persona_tags: overrides.persona_tags ?? ['web-builder'],
    goal_tags: overrides.goal_tags ?? [],
    source_kind: overrides.source_kind ?? 'factory',
    source_path: overrides.source_path ?? `${overrides.id}.yaml`,
    updated_at: overrides.updated_at ?? 'deterministic',
  }
}

function makeAction(
  overrides: Partial<CanonicalAction> & Pick<CanonicalAction, 'actionId' | 'rawAction' | 'capability' | 'outcome' | 'blocker'>,
): CanonicalAction {
  return CanonicalActionSchema.parse({
    actionId: overrides.actionId,
    rawAction: overrides.rawAction,
    capability: overrides.capability,
    outcome: overrides.outcome,
    blocker: overrides.blocker,
    context: {
      stack: overrides.context?.stack ?? [],
    },
  })
}

const lessons = [
  makeLesson({
    id: 'atom.web-builder.choose-project-goal',
    title: 'landing page の目的を決める',
    summary: 'MVP の scope を先に定義して迷いをなくす。',
    capability_outputs: ['define-project-goal'],
    goal_tags: ['landing-page', 'stage:orient'],
  }),
  makeLesson({
    id: 'atom.web-builder.define-mvp-pages',
    title: '最初に必要なページを決める',
    summary: 'MVP page plan を作る。',
    capability_inputs: ['project-goal-decided'],
    capability_outputs: ['define-mvp-pages'],
    hard_prerequisites: ['atom.web-builder.choose-project-goal'],
    goal_tags: ['landing-page', 'stage:scaffold'],
  }),
  makeLesson({
    id: 'atom.web-builder.form-storage-workflow',
    title: 'フォーム送信と Storage 連携を実装する',
    summary: 'form UI を build しながら Supabase Storage を connect する。',
    capability_inputs: ['auth-email-password'],
    capability_outputs: ['form-basics', 'storage-bucket'],
    hard_prerequisites: ['atom.web-builder.choose-project-goal'],
    goal_tags: ['saas-mvp', 'stage:connect'],
  }),
  makeLesson({
    id: 'atom.web-builder.publish-landing-page',
    title: 'LP を公開して Vercel に deploy する',
    summary: 'release 前に preview を確認する。',
    capability_outputs: ['preview-deploy-workflow'],
    goal_tags: ['landing-page', 'stage:ship'],
  }),
  makeLesson({
    id: 'atom.cs-automator.bot-internal-testing',
    title: '社内テストで bot の問題点を洗い出す',
    summary: 'quality を review しながら internal testing を行う。',
    track_id: 'cs-automator',
    capability_inputs: ['chatbot-deployed'],
    capability_outputs: ['run-internal-bot-test'],
    soft_prerequisites: ['atom.cs-automator.bot-response-setup'],
    persona_tags: ['cs-automator'],
    goal_tags: ['customer-support', 'automation'],
  }),
  makeLesson({
    id: 'atom.data-analyst.kpi-tracking-setup',
    title: 'KPI tracking の setup を行う',
    summary: 'analysis 用の tracking sheet を準備する。',
    track_id: 'data-analyst',
    capability_outputs: ['build-kpi-tracking-sheet'],
    persona_tags: ['data-analyst'],
    goal_tags: ['analytics', 'stage:measure'],
  }),
]

const coverageIndex = CoverageIndexSchema.parse({
  schema_version: 'v1',
  content_hash: '1234567890123456789012345678901234567890',
  built_at: 'deterministic',
  lessons,
  atoms: [],
  capabilities: [],
  support_assets: [],
  warnings: [],
})

const perfectAction = makeAction({
  actionId: 'action-plan-perfect',
  rawAction: 'landing-page の goal と MVP を決める',
  capability: 'plan',
  outcome: 'clarify_scope',
  blocker: 'clarity',
  context: { stack: ['Next.js'] },
})

const softAction = makeAction({
  actionId: 'action-build-soft',
  rawAction: 'フォーム送信画面を実装する',
  capability: 'build',
  outcome: 'create_asset',
  blocker: 'integration',
  context: { stack: ['Supabase', 'TypeScript'] },
})

const noMatchAction = makeAction({
  actionId: 'action-measure-none',
  rawAction: '広告 KPI を分析する',
  capability: 'measure',
  outcome: 'measure_performance',
  blocker: 'quality',
  context: { stack: ['PostgreSQL'] },
})

describe('matchActions', () => {
  it('returns ranked mappings per action and exports the default weights (AC-01, AC-02)', () => {
    const result = matchActions({
      actions: [perfectAction],
      coverageIndex,
    })

    expect(DEFAULT_MATCH_WEIGHTS).toStrictEqual({
      capability: 0.5,
      prerequisite: 0.2,
      blocker: 0.2,
      evidence: 0.1,
    })
    expect(result).toHaveLength(3)
    expect(result[0]?.lesson.id).toBe('atom.web-builder.choose-project-goal')
    expect(result[0]?.rank).toBe(1)
    expect(result.map((entry) => entry.score)).toStrictEqual(
      [...result.map((entry) => entry.score)].sort((a, b) => b - a),
    )
  })

  it('keeps perfect matches high and unrelated matches low (AC-03)', () => {
    const perfect = matchActions({
      actions: [perfectAction],
      coverageIndex,
      topK: 1,
    })[0]
    const noMatchBreakdown = buildMatchBreakdown(noMatchAction, lessons[0]!)
    const noMatchScore = composeMatchScore(noMatchBreakdown, DEFAULT_MATCH_WEIGHTS)

    expect(perfect?.score).toBeGreaterThanOrEqual(0.9)
    expect(scoreCapability(noMatchAction, lessons[0]!)).toBe(0)
    expect(noMatchScore).toBeLessThanOrEqual(0.2)
  })

  it('lands soft matches in the middle band (AC-04)', () => {
    const softBreakdown = buildMatchBreakdown(softAction, lessons[2]!)
    const softScore = composeMatchScore(softBreakdown, DEFAULT_MATCH_WEIGHTS)

    expect(softBreakdown.capability).toBe(0.5)
    expect(softScore).toBeGreaterThanOrEqual(0.3)
    expect(softScore).toBeLessThanOrEqual(0.7)
  })

  it('is deterministic across repeat calls (AC-05)', () => {
    const first = matchActions({
      actions: [perfectAction, softAction],
      coverageIndex,
      topK: 4,
    })
    const second = matchActions({
      actions: [perfectAction, softAction],
      coverageIndex,
      topK: 4,
    })

    expect(first).toStrictEqual(second)
  })

  it('applies topK per action with a default of 3 (AC-06)', () => {
    const defaultTopK = matchActions({ actions: [perfectAction], coverageIndex })
    const top1 = matchActions({ actions: [perfectAction], coverageIndex, topK: 1 })
    const top5 = matchActions({ actions: [perfectAction], coverageIndex, topK: 5 })

    expect(defaultTopK).toHaveLength(3)
    expect(top1).toHaveLength(1)
    expect(top5).toHaveLength(5)
    expect(top5.map((mapping) => mapping.rank)).toStrictEqual([1, 2, 3, 4, 5])
  })

  it('changes only the composed score when weights change (AC-07)', () => {
    const baseline = matchActions({
      actions: [softAction],
      coverageIndex,
      topK: 1,
    })[0]
    const reweighted = matchActions({
      actions: [softAction],
      coverageIndex,
      topK: 1,
      weights: {
        capability: 0.5,
        prerequisite: 0.05,
        blocker: 0.35,
        evidence: 0.1,
      },
    })[0]

    expect(baseline?.lesson.id).toBe(reweighted?.lesson.id)
    expect(baseline?.breakdown).toStrictEqual(reweighted?.breakdown)
    expect(baseline?.score).not.toBe(reweighted?.score)
  })

  it('does not import any LLM SDK in src (AC-08)', () => {
    const grepOutput = execFileSync(
      'sh',
      ['-lc', 'grep -R -n "openai\\|anthropic\\|@ai-sdk" src || true'],
      { cwd: new URL('..', import.meta.url) },
    )
      .toString()
      .trim()

    expect(grepOutput).toBe('')
  })
})
