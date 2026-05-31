/**
 * W60 (Audit B3 #1, CRITICAL): 8 sub-agent の userPayload に **実 plan / atom /
 * memory snippet を含む `context`** が ZAI POST body の user message に到達
 * することの回帰防止テスト。
 *
 * 背景:
 * - W47/W54 で specialized SYSTEM_PROMPT + ZAI parsed output 採用までは配線
 * - **しかし userPayload は count/slug だけの metadata 鞘だった**ため、LLM は
 *   実コンテキストを見ずに `outputSchema` に合致する "valid JSON" を
 *   hallucinate するリスク（B3 が CRITICAL 評価）
 *
 * W60 修正:
 * - 各 sub-agent の userPayload に `context` field を追加
 * - 関連 plan steps / atom briefs / memory snippets / persona profile を
 *   構造化して渡す（top-K / 文字数 cap で token budget 管理）
 *
 * 検証戦略:
 * - `MENTOR_PROVIDER_PHASE3` 未設定で Phase 1 default 状態を再現
 * - `ZAI_PLANNER_API_KEY` + `ZAI_PLANNER_API_URL` を立てて ZAI 経路を発火
 * - `fetchWithRetry` を vi.mock し、最初の POST body を JSON parse して
 *   `messages[1].content` (user role) に `context` が含まれることを assert
 * - context 内に各 sub-agent 固有の grounded shape (atomId / leafId /
 *   memory bullet 本文 / topic+positions など) が出ていることまで確認
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'
import { TechStackScoutSubAgent } from '@/lib/mentor/sub-agents/tech-scout'
import { AiToolCatalogScoutSubAgent } from '@/lib/mentor/sub-agents/tool-scout'
import { JudgeSubAgent } from '@/lib/mentor/sub-agents/judge'
import { TieBreakerSubAgent } from '@/lib/mentor/sub-agents/tie-breaker'
import { LessonMatcherSubAgent } from '@/lib/mentor/sub-agents/lesson-matcher'
import { GoalTreeSubAgent } from '@/lib/mentor/sub-agents/goal-tree'
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({}) } }],
    }),
  })),
}))

import { fetchWithRetry } from '@/lib/api/fetch-with-retry'

const ENV_KEYS_TO_RESTORE = [
  'MENTOR_PROVIDER_PHASE3',
  'ZAI_PLANNER_API_KEY',
  'ZAI_API_KEY',
  'ZAI_PLANNER_API_URL',
  'ZAI_CODING_PLAN_API_URL',
  'ZAI_PLANNER_MODEL',
]

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
  delete process.env.MENTOR_PROVIDER_PHASE3
  process.env.ZAI_PLANNER_API_KEY = 'fake-zai-key'
  process.env.ZAI_PLANNER_API_URL = 'https://api.z.example/v4'
  vi.mocked(fetchWithRetry).mockClear()
})

afterEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
    delete originalEnv[key]
  }
})

/**
 * fetchWithRetry mock の最初の呼び出しから user message content (= userPayload)
 * を JSON.parse して返す。`context` field の存在 / 構造を検証する用。
 */
function extractFirstUserPayload(): Record<string, unknown> | null {
  const calls = vi.mocked(fetchWithRetry).mock.calls
  if (calls.length === 0) return null
  const init = calls[0]?.[1]
  if (!init || typeof init !== 'object') return null
  const body = (init as { body?: string }).body
  if (typeof body !== 'string') return null
  try {
    const parsed = JSON.parse(body) as {
      messages?: Array<{ role?: string; content?: string }>
    }
    const userMsg = parsed.messages?.find((m) => m?.role === 'user')
    if (!userMsg?.content) return null
    return JSON.parse(userMsg.content) as Record<string, unknown>
  } catch {
    return null
  }
}

function buildGoalTree(): GoalTreeDecomposition {
  return {
    objectives: [
      {
        id: 'obj-1',
        title: 'ポートフォリオ公開',
        milestones: [
          {
            id: 'ms-1',
            title: '公開準備',
            leafTasks: [
              {
                id: 'l-1',
                title: 'v0 で LP を生成',
                summary: 'ヒーロー画像と CTA 入りの 1 枚 LP を v0 で雛形生成する',
                human_judgment_required: false,
                automation_potential: 'high',
                recommended_capability: 'design',
              },
            ],
          },
        ],
      },
    ],
  }
}

function buildPlan(): AtomCompiledPlan {
  return {
    goal: 'ポートフォリオを最短で公開する',
    goalTags: ['website-launch'],
    steps: [
      {
        atomId: 'atom-design-lp',
        title: 'v0 で LP の雛形を生成',
        rationale: 'デザイン工程を AI に委譲することで時短',
        recommendedTool: 'v0',
        delegationBrief: 'CTA を 1 つ、ヒーロー画像を 1 枚で構成',
        estimatedMinutes: 30,
        milestoneId: 'ms-0',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      { id: 'ms-0', title: 'design', description: 'd', atomIds: ['atom-design-lp'] },
    ],
    coverageScore: 0.9,
    unsupportedCapabilities: [],
    rationale: 'AI 活用',
    source: 'ai',
  }
}

// ── FrictionCriticSubAgent ──────────────────────────────────────────

describe('W60: FrictionCriticSubAgent userPayload.context grounding', () => {
  it('userPayload に leafBriefs / planSteps / learner / pastFrictionSnippets が含まれる', async () => {
    const subAgent = new FrictionCriticSubAgent()
    await subAgent.run({
      goalTree: buildGoalTree(),
      learnerProfile: {
        cli_familiarity: 'none',
        can_use_local_tools: true,
        available_ai_tools: ['v0', 'cursor'],
        experience_summary: '前回 OAuth で詰まった',
      },
      planDraft: {
        stepBriefs: [
          {
            stepId: 's-1',
            title: 'v0 で雛形',
            rationale: '時短',
            recommendedTool: 'v0',
          },
        ],
      },
      pastFrictionSnippets: ['前回 OAuth で 30 分以上止まった'],
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx).toBeDefined()
    expect(Array.isArray(ctx.leafBriefs)).toBe(true)
    expect((ctx.leafBriefs as Array<Record<string, unknown>>)[0]?.id).toBe('l-1')
    expect((ctx.leafBriefs as Array<Record<string, unknown>>)[0]?.title).toContain(
      'v0',
    )
    expect(Array.isArray(ctx.planSteps)).toBe(true)
    expect((ctx.planSteps as Array<Record<string, unknown>>)[0]?.stepId).toBe('s-1')
    expect((ctx.learner as Record<string, unknown>).cli_familiarity).toBe('none')
    expect(
      (ctx.learner as { available_ai_tools: string[] }).available_ai_tools,
    ).toContain('v0')
    expect(ctx.pastFrictionSnippets).toEqual(
      expect.arrayContaining([expect.stringContaining('OAuth')]),
    )
  })
})

// ── MemoryRecallSubAgent ────────────────────────────────────────────

describe('W60: MemoryRecallSubAgent userPayload.context grounding', () => {
  it('userPayload に recentMemories / negativeFeedback / blockers の本文が含まれる', async () => {
    const subAgent = new MemoryRecallSubAgent()
    await subAgent.run({
      recentMemories: [
        'Vercel deploy はスムーズだった',
        'OAuth 設定で 1 時間詰まった',
      ],
      negativeFeedback: ['説明が長すぎて挫折'],
      blockers: ['CLI に苦手意識'],
      preferredPacing: 'gentle',
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx.recentMemories).toEqual(
      expect.arrayContaining([expect.stringContaining('Vercel')]),
    )
    expect(ctx.recentMemories).toEqual(
      expect.arrayContaining([expect.stringContaining('OAuth')]),
    )
    expect(ctx.negativeFeedback).toEqual(
      expect.arrayContaining([expect.stringContaining('挫折')]),
    )
    expect(ctx.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining('CLI')]),
    )
    expect(ctx.preferredPacing).toBe('gentle')
  })
})

// ── TechStackScoutSubAgent ──────────────────────────────────────────

describe('W60: TechStackScoutSubAgent userPayload.context grounding', () => {
  it('userPayload に goal / planSteps / techPreferences が含まれる', async () => {
    const subAgent = new TechStackScoutSubAgent()
    await subAgent.run({
      goalDomains: ['web-app'],
      techMentions: ['next.js', 'supabase'],
      goal: 'ポートフォリオを最短で公開',
      planSteps: [
        { title: 'Vercel にデプロイ', rationale: '簡単', recommendedTool: 'vercel' },
      ],
      techPreferences: ['Tailwind 必須'],
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx.goal).toContain('ポートフォリオ')
    expect(Array.isArray(ctx.planSteps)).toBe(true)
    expect((ctx.planSteps as Array<Record<string, unknown>>)[0]?.title).toContain(
      'Vercel',
    )
    expect(ctx.techPreferences).toEqual(
      expect.arrayContaining([expect.stringContaining('Tailwind')]),
    )
  })
})

// ── AiToolCatalogScoutSubAgent ──────────────────────────────────────

describe('W60: AiToolCatalogScoutSubAgent userPayload.context grounding', () => {
  it('userPayload に catalogBriefs / goal / planSteps が含まれる', async () => {
    const subAgent = new AiToolCatalogScoutSubAgent()
    await subAgent.run({
      learnerOSAndCli: { os: 'macos', cliFamiliarity: 'comfortable' },
      goal: 'AI ツールで開発を加速',
      planSteps: [{ title: 'コード生成を AI に依頼', recommendedTool: 'cursor' }],
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(Array.isArray(ctx.catalogBriefs)).toBe(true)
    const briefs = ctx.catalogBriefs as Array<Record<string, unknown>>
    expect(briefs.length).toBeGreaterThan(0)
    // Each brief must have id + label + kind for grounding
    expect(briefs[0]?.id).toBeDefined()
    expect(briefs[0]?.label).toBeDefined()
    expect(briefs[0]?.kind).toBeDefined()
    expect(ctx.goal).toContain('AI')
    expect(Array.isArray(ctx.planSteps)).toBe(true)
  })
})

// ── JudgeSubAgent ───────────────────────────────────────────────────

describe('W60: JudgeSubAgent userPayload.context grounding', () => {
  it('userPayload に planSteps / persona / coverageScore / completionCriteria が含まれる', async () => {
    const subAgent = new JudgeSubAgent()
    await subAgent.run({
      planDraft: buildPlan(),
      rubric: 'plan-quality-v1',
      personaProfile: {
        cli_familiarity: 'none',
        personaTags: ['non-engineer'],
        available_ai_tools: ['v0'],
        experience_summary: 'デザイン経験あり',
      },
      completionCriteria: ['LP が公開 URL でアクセス可能'],
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx.goal).toContain('ポートフォリオ')
    expect(Array.isArray(ctx.planSteps)).toBe(true)
    expect((ctx.planSteps as Array<Record<string, unknown>>)[0]?.atomId).toBe(
      'atom-design-lp',
    )
    expect((ctx.planSteps as Array<Record<string, unknown>>)[0]?.recommendedTool).toBe(
      'v0',
    )
    const persona = ctx.persona as Record<string, unknown>
    expect(persona.cli_familiarity).toBe('none')
    expect(persona.personaTags).toEqual(
      expect.arrayContaining(['non-engineer']),
    )
    expect(ctx.coverageScore).toBe(0.9)
    expect(ctx.completionCriteria).toEqual(
      expect.arrayContaining([expect.stringContaining('公開')]),
    )
  })
})

// ── TieBreakerSubAgent ──────────────────────────────────────────────

describe('W60: TieBreakerSubAgent userPayload.context grounding', () => {
  it('userPayload に conflicts (positions 含む) と intent 全文が含まれる', async () => {
    const subAgent = new TieBreakerSubAgent()
    await subAgent.run({
      conductor_intent:
        'ポートフォリオサイトを最短で公開する。学習者は CLI が苦手なので GUI 中心に倒したい',
      conflicting_reports: [
        {
          subAgent: 'tech_scout',
          claims: [
            {
              topic: 'framework_choice',
              recommendation: 'next16-required',
              confidence: 0.9,
              rationale: 'App Router 必須',
            },
          ],
        },
        {
          subAgent: 'non_eng_critic',
          claims: [
            {
              topic: 'framework_choice',
              recommendation: 'no-code-builder',
              confidence: 0.8,
              rationale: 'CLI 苦手なら no-code',
            },
          ],
        },
      ],
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx.intent).toContain('ポートフォリオ')
    expect(Array.isArray(ctx.conflicts)).toBe(true)
    const conflicts = ctx.conflicts as Array<Record<string, unknown>>
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts[0]?.topic).toBe('framework_choice')
    const positions = conflicts[0]?.positions as Array<Record<string, unknown>>
    expect(positions.length).toBe(2)
    expect(positions.some((p) => p.subAgent === 'tech_scout')).toBe(true)
    expect(positions.some((p) => p.subAgent === 'non_eng_critic')).toBe(true)
    expect(positions[0]?.rationale).toBeDefined()
  })
})

// ── LessonMatcherSubAgent ───────────────────────────────────────────

describe('W60: LessonMatcherSubAgent userPayload.context grounding', () => {
  it('userPayload に leafBriefs / candidateAtomBriefs / learner が含まれる', async () => {
    const subAgent = new LessonMatcherSubAgent()
    await subAgent.run({
      goalTree: buildGoalTree(),
      candidateAtoms: [
        {
          atomId: 'atom.common.lp-design',
          title: 'AI で LP 雛形生成',
          goalTags: ['website-launch'],
          personaTags: ['non-engineer'],
          capabilityOutputs: ['design'],
          hardPrerequisites: [],
          estimatedMinutes: 30,
          similarity: 0.8,
        },
      ],
      learnerProfile: {
        personaTags: ['non-engineer'],
        completedAtomIds: ['atom.intro'],
      },
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    const ctx = payload!.context as Record<string, unknown>
    expect(Array.isArray(ctx.leafBriefs)).toBe(true)
    expect((ctx.leafBriefs as Array<Record<string, unknown>>)[0]?.id).toBe('l-1')
    expect(Array.isArray(ctx.candidateAtomBriefs)).toBe(true)
    const briefs = ctx.candidateAtomBriefs as Array<Record<string, unknown>>
    expect(briefs[0]?.atomId).toBe('atom.common.lp-design')
    expect(briefs[0]?.capabilityOutputs).toEqual(
      expect.arrayContaining(['design']),
    )
    expect(briefs[0]?.similarity).toBe(0.8)
    const learner = ctx.learner as Record<string, unknown>
    expect(learner.personaTags).toEqual(expect.arrayContaining(['non-engineer']))
    expect(learner.completedAtomIds).toEqual(
      expect.arrayContaining(['atom.intro']),
    )
  })
})

// ── GoalTreeSubAgent ────────────────────────────────────────────────

describe('W60: GoalTreeSubAgent userPayload.context grounding', () => {
  it('userPayload に hearingKeyPoints / hearingSignals / learner / mentorMemoryBullets が含まれる', async () => {
    // decompose を fake で短絡 (callZaiForGoalTree を呼ばずに済ませる)
    const subAgent = new GoalTreeSubAgent({
      decompose: async () => null,
    })
    await subAgent.run({
      goal: 'ポートフォリオを最短で公開',
      learnerProfile: {
        cli_familiarity: 'basic',
        available_ai_tools: ['v0', 'cursor'],
        experience_summary: 'デザイン 3 年',
        skillLevel: 'beginner',
        goalTags: ['website-launch'],
        blockers: ['OAuth 苦手'],
        mentorMemoryBullets: ['前回 Vercel にデプロイ成功'],
      },
      hearingResult: {
        keyPoints: ['LP は 1 枚で OK', '画像は AI で生成希望'],
        signals: { audience: '個人事業主', deadline: '1 週間以内' },
      },
    })
    const payload = extractFirstUserPayload()
    expect(payload).not.toBeNull()
    expect(payload!.goal).toBe('ポートフォリオを最短で公開')
    const ctx = payload!.context as Record<string, unknown>
    expect(ctx.hearingKeyPoints).toEqual(
      expect.arrayContaining([expect.stringContaining('LP')]),
    )
    const signals = ctx.hearingSignals as Record<string, unknown>
    expect(signals.audience).toBe('個人事業主')
    expect(signals.deadline).toBe('1 週間以内')
    const learner = ctx.learner as Record<string, unknown>
    expect(learner.cli_familiarity).toBe('basic')
    expect(learner.available_ai_tools).toEqual(
      expect.arrayContaining(['v0']),
    )
    expect(learner.experience_summary).toContain('デザイン')
    expect(learner.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining('OAuth')]),
    )
    expect(ctx.mentorMemoryBullets).toEqual(
      expect.arrayContaining([expect.stringContaining('Vercel')]),
    )
  })
})
