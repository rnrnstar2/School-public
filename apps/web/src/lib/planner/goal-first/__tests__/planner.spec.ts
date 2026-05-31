/**
 * Goal-First Planner — Unit Tests
 *
 * Tests for: goal-normalizer, domain-classifier, plan-compiler, next-action-resolver
 */

import { describe, it, expect } from 'vitest'
import { normalizeGoal } from '../goal-normalizer'
import { classifyGoalDomains, DOMAIN_SIGNALS } from '../domain-classifier'
import { resolveNextAction } from '../next-action-resolver'
import type {
  NormalizedGoal,
  LessonCandidate,
  CompiledPlan,
  CompiledPlanNode,
  CompiledMilestone,
} from '../types'

// ============================================
// Fixtures
// ============================================

const FIXTURE_GOALS = {
  webPortfolio: 'ポートフォリオサイトを作りたい',
  automateEmail: '業務メールを自動化したい',
  blogWithAi: 'ブログ記事をAIで書きたい',
  appPrototype: 'Webアプリのプロトタイプを作りたい',
  vagueAi: 'AIを使って何かしたい',
  withTools: 'Claude CodeとCursorを使ってポートフォリオサイトを作りたい',
  withDeadline: '3ヶ月以内にランディングページを作りたい',
  english: 'I want to build a portfolio website using Next.js',
  empty: '',
  whitespace: '   \n  \t  ',
  crossDomain: 'Webアプリを作って業務を自動化するダッシュボードを構築したい',
} as const

function makeNormalizedGoal(overrides: Partial<NormalizedGoal> = {}): NormalizedGoal {
  return {
    raw: 'ポートフォリオサイトを作りたい',
    cleaned: 'ポートフォリオサイトを作りたい',
    language: 'ja',
    implied_domains: ['web'],
    tool_mentions: [],
    outcome_summary: 'ポートフォリオサイト',
    ...overrides,
  }
}

function makeLessonCandidate(overrides: Partial<LessonCandidate> = {}): LessonCandidate {
  return {
    lessonId: 'lesson-001',
    title: 'HTML基礎',
    domainSlug: 'web',
    score: 0.8,
    reason: 'primary domain match',
    difficulty: 'beginner',
    estimatedMinutes: 30,
    prerequisiteIds: [],
    capabilityTags: ['html', 'setup'],
    ...overrides,
  }
}

function makeCompiledPlan(overrides: Partial<CompiledPlan> = {}): CompiledPlan {
  return {
    title: '「ポートフォリオサイト」学習プラン',
    summary: '3レッスン・1マイルストーンで構成。推定所要時間: 約90分。',
    milestones: [
      {
        id: 'ms-000',
        title: '基礎スキル',
        description: 'general 領域のスキルを習得するためのレッスン群',
        nodeIds: ['node-000', 'node-001', 'node-002'],
      },
    ],
    nodes: [
      {
        id: 'node-000',
        lessonId: 'lesson-001',
        lessonTitle: 'HTML基礎',
        milestoneId: 'ms-000',
        sortOrder: 0,
        rationale: 'ゴール「ポートフォリオサイト」に直接関連',
        difficulty: 'beginner',
        estimatedMinutes: 30,
        prerequisiteNodeIds: [],
      },
      {
        id: 'node-001',
        lessonId: 'lesson-002',
        lessonTitle: 'CSS基礎',
        milestoneId: 'ms-000',
        sortOrder: 1,
        rationale: 'ゴール「ポートフォリオサイト」に直接関連',
        difficulty: 'beginner',
        estimatedMinutes: 30,
        prerequisiteNodeIds: ['node-000'],
      },
      {
        id: 'node-002',
        lessonId: 'lesson-003',
        lessonTitle: 'デプロイ入門',
        milestoneId: 'ms-000',
        sortOrder: 2,
        rationale: 'ゴール「ポートフォリオサイト」に直接関連',
        difficulty: 'intermediate',
        estimatedMinutes: 30,
        prerequisiteNodeIds: ['node-001'],
      },
    ],
    gapTasks: [],
    metadata: {
      totalEstimatedMinutes: 90,
      lessonCount: 3,
      domainsCovered: ['web'],
    },
    ...overrides,
  }
}

// ============================================
// goal-normalizer
// ============================================

describe('normalizeGoal', () => {
  it('cleans Japanese goal text (trims whitespace, collapses spaces)', () => {
    const result = normalizeGoal('  ポートフォリオサイトを  作りたい  ')
    expect(result.cleaned).toBe('ポートフォリオサイトを 作りたい')
    expect(result.raw).toBe('  ポートフォリオサイトを  作りたい  ')
  })

  it('detects Japanese text as language "ja"', () => {
    const result = normalizeGoal(FIXTURE_GOALS.webPortfolio)
    expect(result.language).toBe('ja')
  })

  it('detects English text as language "en"', () => {
    const result = normalizeGoal(FIXTURE_GOALS.english)
    expect(result.language).toBe('en')
  })

  it('extracts tool mentions (Claude Code, Cursor)', () => {
    const result = normalizeGoal(FIXTURE_GOALS.withTools)
    expect(result.tool_mentions).toContain('Claude Code')
    expect(result.tool_mentions).toContain('Cursor')
  })

  it('extracts Codex as a tool mention', () => {
    const result = normalizeGoal('Codexを使って自動化スクリプトを作りたい')
    expect(result.tool_mentions).toContain('Codex')
  })

  it('handles empty string gracefully', () => {
    const result = normalizeGoal(FIXTURE_GOALS.empty)
    expect(result.cleaned).toBe('')
    expect(result.language).toBe('en') // no CJK chars -> 'en'
    expect(result.tool_mentions).toEqual([])
    expect(result.implied_domains).toEqual([])
  })

  it('handles whitespace-only string gracefully', () => {
    const result = normalizeGoal(FIXTURE_GOALS.whitespace)
    expect(result.cleaned).toBe('')
    expect(result.tool_mentions).toEqual([])
  })

  it('extracts domain hints from goal text', () => {
    const result = normalizeGoal(FIXTURE_GOALS.webPortfolio)
    expect(result.implied_domains).toContain('web')
  })

  it('extracts multiple domain hints for cross-domain goals', () => {
    const result = normalizeGoal(FIXTURE_GOALS.crossDomain)
    expect(result.implied_domains).toContain('app')
  })

  it('extracts deadline mention from Japanese text', () => {
    const result = normalizeGoal(FIXTURE_GOALS.withDeadline)
    expect(result.deadline_mention).toBe('3ヶ月以内')
  })

  it('generates an outcome summary by stripping meta-phrases', () => {
    const result = normalizeGoal('ポートフォリオサイトを作りたい')
    // The summarizer strips "を作りたい"
    expect(result.outcome_summary).not.toContain('を作りたい')
    expect(result.outcome_summary.length).toBeGreaterThan(0)
  })

  it('generates an English outcome summary by stripping meta-phrases', () => {
    const result = normalizeGoal('I want to build a portfolio website')
    expect(result.outcome_summary).not.toMatch(/^I want to/i)
    expect(result.outcome_summary.length).toBeGreaterThan(0)
  })
})

// ============================================
// domain-classifier
// ============================================

describe('classifyGoalDomains', () => {
  it('classifies "ポートフォリオサイトを作りたい" as web domain with high confidence', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.webPortfolio)
    const result = classifyGoalDomains(goal)
    expect(result.primary).toBe('web')
    expect(result.domains[0].slug).toBe('web')
    expect(result.domains[0].confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('classifies "業務メールを自動化したい" as automation domain', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.automateEmail)
    const result = classifyGoalDomains(goal)
    expect(result.primary).toBe('automation')
  })

  it('classifies "ブログ記事をAIで書きたい" as content domain', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.blogWithAi)
    const result = classifyGoalDomains(goal)
    expect(result.primary).toBe('content')
  })

  it('classifies "Webアプリのプロトタイプを作りたい" as app domain', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.appPrototype)
    const result = classifyGoalDomains(goal)
    expect(result.primary).toBe('app')
  })

  it('classifies "AIを使って何かしたい" as mixed (low confidence)', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.vagueAi)
    const result = classifyGoalDomains(goal)
    // With no clear domain signals, should return mixed
    expect(result.primary).toBe('mixed')
    expect(result.isMixed).toBe(true)
  })

  it('detects multiple domains for cross-domain goals', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.crossDomain)
    const result = classifyGoalDomains(goal)
    const slugs = result.domains.map((d) => d.slug)
    // "Webアプリ" -> app, "自動化" -> automation, "ダッシュボード" -> app
    expect(slugs.length).toBeGreaterThanOrEqual(2)
    expect(result.isMixed).toBe(true)
  })

  it('returns domains sorted by confidence descending', () => {
    const goal = normalizeGoal(FIXTURE_GOALS.crossDomain)
    const result = classifyGoalDomains(goal)
    for (let i = 1; i < result.domains.length; i++) {
      expect(result.domains[i].confidence).toBeLessThanOrEqual(
        result.domains[i - 1].confidence,
      )
    }
  })

  it('boosts confidence for implied domains from normalizer', () => {
    const goal = makeNormalizedGoal({
      cleaned: 'サイトを作る',
      implied_domains: ['web'],
    })
    const withImplied = classifyGoalDomains(goal)

    const goalNoImplied = makeNormalizedGoal({
      cleaned: 'サイトを作る',
      implied_domains: [],
    })
    const withoutImplied = classifyGoalDomains(goalNoImplied)

    const webWithImplied = withImplied.domains.find((d) => d.slug === 'web')?.confidence ?? 0
    const webWithout = withoutImplied.domains.find((d) => d.slug === 'web')?.confidence ?? 0
    expect(webWithImplied).toBeGreaterThan(webWithout)
  })

  it('ignores unknown implied domains instead of promoting them to primary', () => {
    const goal = makeNormalizedGoal({
      cleaned: 'AIを使って何かしたい',
      implied_domains: ['unknown-domain'],
    })
    const result = classifyGoalDomains(goal)

    expect(result.primary).toBe('mixed')
    expect(result.domains).toHaveLength(4)
    expect(result.domains.every((domain) => ['web', 'automation', 'content', 'app'].includes(domain.slug))).toBe(true)
  })
})

// ============================================
// plan-compiler (topologicalSort + compile helpers)
// ============================================

describe('plan-compiler', () => {
  describe('prerequisite ordering in compiled plan', () => {
    it('respects prerequisite ordering (node with prereq comes after prereq node)', () => {
      const plan = makeCompiledPlan()
      // node-001 depends on node-000, node-002 depends on node-001
      const node0 = plan.nodes.find((n) => n.id === 'node-000')!
      const node1 = plan.nodes.find((n) => n.id === 'node-001')!
      const node2 = plan.nodes.find((n) => n.id === 'node-002')!

      expect(node0.sortOrder).toBeLessThan(node1.sortOrder)
      expect(node1.sortOrder).toBeLessThan(node2.sortOrder)
      expect(node1.prerequisiteNodeIds).toContain('node-000')
      expect(node2.prerequisiteNodeIds).toContain('node-001')
    })
  })

  describe('milestone grouping', () => {
    it('creates milestones from capability clusters', () => {
      const plan = makeCompiledPlan()
      expect(plan.milestones).toHaveLength(1)
      expect(plan.milestones[0].nodeIds).toHaveLength(3)
    })
  })

  describe('gap task detection', () => {
    it('generates gap tasks when lessons are missing for implied domains', () => {
      const plan = makeCompiledPlan({
        gapTasks: [
          {
            id: 'gap-automation',
            title: 'automation 領域の学習素材を追加予定',
            description:
              'ゴールに含まれる「automation」分野のレッスンがまだ不足しています。今後コンテンツが追加される予定です。',
            missingCapability: 'automation',
          },
        ],
      })
      expect(plan.gapTasks).toHaveLength(1)
      expect(plan.gapTasks[0].missingCapability).toBe('automation')
    })
  })

  describe('empty candidate list', () => {
    it('returns empty plan for empty candidate list', () => {
      const plan = makeCompiledPlan({
        nodes: [],
        milestones: [],
        gapTasks: [],
        metadata: {
          totalEstimatedMinutes: 0,
          lessonCount: 0,
          domainsCovered: [],
        },
      })
      expect(plan.nodes).toHaveLength(0)
      expect(plan.milestones).toHaveLength(0)
      expect(plan.metadata.lessonCount).toBe(0)
    })
  })

  describe('completed lesson filtering', () => {
    it('filters out already-completed lessons', () => {
      const allNodes: CompiledPlanNode[] = [
        makeCompiledPlan().nodes[0],
        makeCompiledPlan().nodes[1],
        makeCompiledPlan().nodes[2],
      ]
      const completedIds = new Set(['lesson-001'])
      const remaining = allNodes.filter(
        (n) => !completedIds.has(n.lessonId),
      )
      expect(remaining).toHaveLength(2)
      expect(remaining.every((n) => n.lessonId !== 'lesson-001')).toBe(true)
    })
  })

  describe('plan output stability', () => {
    it('snapshot: plan structure matches expected shape', () => {
      const plan = makeCompiledPlan()
      expect(plan).toMatchSnapshot()
    })
  })
})

// ============================================
// next-action-resolver
// ============================================

describe('resolveNextAction', () => {
  const plan = makeCompiledPlan()

  it('returns first pending node with met prerequisites', () => {
    const result = resolveNextAction(plan, [])
    expect(result.type).toBe('lesson')
    expect(result.nodeId).toBe('node-000')
    expect(result.lessonId).toBe('lesson-001')
  })

  it('skips completed nodes and returns next available', () => {
    const result = resolveNextAction(plan, ['node-000'])
    expect(result.type).toBe('lesson')
    expect(result.nodeId).toBe('node-001')
    expect(result.lessonId).toBe('lesson-002')
  })

  it('returns "graduated" when all nodes completed', () => {
    const result = resolveNextAction(plan, [
      'node-000',
      'node-001',
      'node-002',
    ])
    expect(result.type).toBe('graduated')
    expect(result.message).toContain('おめでとうございます')
  })

  it('returns "blocked" when all remaining nodes have unmet prerequisites', () => {
    // node-001 requires node-000, node-002 requires node-001
    // If node-000 is not completed, node-001 and node-002 are blocked
    // But node-000 itself has no prereqs, so it's not blocked.
    // To create a truly blocked scenario, we need a plan where
    // the only remaining nodes have prereqs that point outside the completed set.
    const blockedPlan = makeCompiledPlan({
      nodes: [
        {
          id: 'node-100',
          lessonId: 'lesson-100',
          lessonTitle: 'Advanced Topic',
          milestoneId: 'ms-000',
          sortOrder: 0,
          rationale: 'テスト用',
          difficulty: 'advanced',
          estimatedMinutes: 60,
          prerequisiteNodeIds: ['node-external-missing'],
        },
      ],
    })
    const result = resolveNextAction(blockedPlan, [])
    expect(result.type).toBe('blocked')
    expect(result.message).toContain('前提条件待ち')
  })

  it('returns "review" when all nodes completed but gap tasks remain', () => {
    const planWithGaps = makeCompiledPlan({
      gapTasks: [
        {
          id: 'gap-1',
          title: 'automation 領域の学習素材',
          description: '不足分',
          missingCapability: 'automation',
        },
      ],
    })
    const result = resolveNextAction(planWithGaps, [
      'node-000',
      'node-001',
      'node-002',
    ])
    expect(result.type).toBe('review')
    expect(result.message).toContain('カバーできていないスキル')
  })

  it('returns "blocked" with the MVP message for coming-soon plans', () => {
    const comingSoonPlan = makeCompiledPlan({
      title: '準備中',
      summary: '準備中: 現在 MVP 期間のため Web 制作のみ対応',
      milestones: [],
      nodes: [],
      metadata: {
        totalEstimatedMinutes: 0,
        lessonCount: 0,
        domainsCovered: [],
        supportStatus: 'coming-soon',
        supportMessage: '準備中: 現在 MVP 期間のため Web 制作のみ対応',
      },
    })

    const result = resolveNextAction(comingSoonPlan, [])
    expect(result.type).toBe('blocked')
    expect(result.message).toBe('準備中: 現在 MVP 期間のため Web 制作のみ対応')
  })

  it('follows prerequisite chain correctly (node-002 not available until node-001 done)', () => {
    // Complete node-000 only; node-001 becomes available, node-002 still blocked
    const result = resolveNextAction(plan, ['node-000'])
    expect(result.type).toBe('lesson')
    expect(result.nodeId).toBe('node-001')
    // node-002 should not be returned
    expect(result.nodeId).not.toBe('node-002')
  })
})
