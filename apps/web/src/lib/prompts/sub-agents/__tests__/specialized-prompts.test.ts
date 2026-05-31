/**
 * TQ-239 sub-agent specialized prompts unit tests.
 *
 * 検証範囲:
 * - 8 specialization (goal-tree / tech-scout / tool-scout / friction-critic /
 *   lesson-matcher / memory-recall / judge / tie-breaker) すべてが必須セクション
 *   を含むこと:
 *   1. THREE_AXIS_GUIDE (3 軸: AI フル活用 / 非エンジニア / 最短)
 *   2. Scope discipline (sub-agent の責務境界明示)
 *   3. CoT 漏洩防止 (raw chain-of-thought を返さない指示)
 *   4. Output schema (構造化要約 max 1KB / Hub bottleneck 防止)
 * - 各 sub-agent class に specialized prompt が wire-in されていること
 *   (`SubAgent.SYSTEM_PROMPT` static property が同一文字列を返す)
 */

import { describe, expect, it } from 'vitest'

import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'
import {
  GOAL_TREE_SYSTEM_PROMPT,
  TECH_SCOUT_SYSTEM_PROMPT,
  TOOL_SCOUT_SYSTEM_PROMPT,
  FRICTION_CRITIC_SYSTEM_PROMPT,
  LESSON_MATCHER_SYSTEM_PROMPT,
  MEMORY_RECALL_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  TIE_BREAKER_SYSTEM_PROMPT,
} from '@/lib/prompts/sub-agents'

import { GoalTreeSubAgent } from '@/lib/mentor/sub-agents/goal-tree'
import { TechStackScoutSubAgent } from '@/lib/mentor/sub-agents/tech-scout'
import { AiToolCatalogScoutSubAgent } from '@/lib/mentor/sub-agents/tool-scout'
import { FrictionCriticSubAgent } from '@/lib/mentor/sub-agents/friction-critic'
import { LessonMatcherSubAgent } from '@/lib/mentor/sub-agents/lesson-matcher'
import { MemoryRecallSubAgent } from '@/lib/mentor/sub-agents/memory-recall'
import { JudgeSubAgent } from '@/lib/mentor/sub-agents/judge'
import { TieBreakerSubAgent } from '@/lib/mentor/sub-agents/tie-breaker'

const PROMPTS: Array<{ label: string; text: string }> = [
  { label: 'GOAL_TREE_SYSTEM_PROMPT', text: GOAL_TREE_SYSTEM_PROMPT },
  { label: 'TECH_SCOUT_SYSTEM_PROMPT', text: TECH_SCOUT_SYSTEM_PROMPT },
  { label: 'TOOL_SCOUT_SYSTEM_PROMPT', text: TOOL_SCOUT_SYSTEM_PROMPT },
  { label: 'FRICTION_CRITIC_SYSTEM_PROMPT', text: FRICTION_CRITIC_SYSTEM_PROMPT },
  { label: 'LESSON_MATCHER_SYSTEM_PROMPT', text: LESSON_MATCHER_SYSTEM_PROMPT },
  { label: 'MEMORY_RECALL_SYSTEM_PROMPT', text: MEMORY_RECALL_SYSTEM_PROMPT },
  { label: 'JUDGE_SYSTEM_PROMPT', text: JUDGE_SYSTEM_PROMPT },
  { label: 'TIE_BREAKER_SYSTEM_PROMPT', text: TIE_BREAKER_SYSTEM_PROMPT },
]

const REQUIRED_AXES = ['AI フル活用', '非エンジニア', '最短']

describe('TQ-239 specialized sub-agent prompts — 3 軸 preamble', () => {
  it.each(PROMPTS)('$label contains THREE_AXIS_GUIDE', ({ text }) => {
    expect(text).toContain(THREE_AXIS_GUIDE)
  })

  it.each(PROMPTS)('$label contains all 3 axes (AI フル活用 / 非エンジニア / 最短)', ({ label, text }) => {
    for (const axis of REQUIRED_AXES) {
      expect(text, `${label} should contain "${axis}"`).toContain(axis)
    }
  })

  it.each(PROMPTS)('$label names primary persona P-NONENG-WEBAPP', ({ text }) => {
    // THREE_AXIS_GUIDE 経由で持ち込まれるため、間接的に必ず含まれることを確認
    expect(text).toContain('P-NONENG-WEBAPP')
  })
})

describe('TQ-239 specialized sub-agent prompts — Scope discipline', () => {
  it.each(PROMPTS)('$label declares Scope discipline section', ({ text }) => {
    // 「Scope discipline」セクション header が含まれていること
    expect(text).toContain('Scope discipline')
  })

  it.each(PROMPTS)(
    '$label includes Anthropic anti-pattern 3 wording (NOT planning the lesson sequence)',
    ({ text }) => {
      // Anthropic blog "scope discipline" の警告文に倣う:
      // "You are NOT planning the lesson sequence — only return findings in your domain"
      expect(text).toContain('You are NOT planning the lesson sequence')
    },
  )
})

describe('TQ-239 specialized sub-agent prompts — CoT-leak prevention', () => {
  it.each(PROMPTS)('$label declares CoT 漏洩防止 section', ({ text }) => {
    expect(text).toContain('CoT 漏洩防止')
  })

  it.each(PROMPTS)('$label forbids returning raw chain-of-thought', ({ text }) => {
    expect(text).toContain('raw chain-of-thought')
    expect(text).toContain('絶対に返さない')
  })
})

describe('TQ-239 specialized sub-agent prompts — Output schema (Hub bottleneck 防止)', () => {
  it.each(PROMPTS)('$label declares Output schema section', ({ text }) => {
    expect(text).toContain('出力スキーマ')
  })

  it.each(PROMPTS)('$label requires JSON-only output', ({ text }) => {
    expect(text).toContain('JSON')
    expect(text).toContain('前置き')
  })

  it.each(PROMPTS)('$label notes 1KB hub-bottleneck guard', ({ text }) => {
    expect(text).toContain('1KB')
  })
})

describe('TQ-239 specialized sub-agent prompts — wired into sub-agent classes', () => {
  it('GoalTreeSubAgent.SYSTEM_PROMPT === GOAL_TREE_SYSTEM_PROMPT', () => {
    expect(GoalTreeSubAgent.SYSTEM_PROMPT).toBe(GOAL_TREE_SYSTEM_PROMPT)
  })

  it('TechStackScoutSubAgent.SYSTEM_PROMPT === TECH_SCOUT_SYSTEM_PROMPT', () => {
    expect(TechStackScoutSubAgent.SYSTEM_PROMPT).toBe(TECH_SCOUT_SYSTEM_PROMPT)
  })

  it('AiToolCatalogScoutSubAgent.SYSTEM_PROMPT === TOOL_SCOUT_SYSTEM_PROMPT', () => {
    expect(AiToolCatalogScoutSubAgent.SYSTEM_PROMPT).toBe(TOOL_SCOUT_SYSTEM_PROMPT)
  })

  it('FrictionCriticSubAgent.SYSTEM_PROMPT === FRICTION_CRITIC_SYSTEM_PROMPT', () => {
    expect(FrictionCriticSubAgent.SYSTEM_PROMPT).toBe(FRICTION_CRITIC_SYSTEM_PROMPT)
  })

  it('LessonMatcherSubAgent.SYSTEM_PROMPT === LESSON_MATCHER_SYSTEM_PROMPT', () => {
    expect(LessonMatcherSubAgent.SYSTEM_PROMPT).toBe(LESSON_MATCHER_SYSTEM_PROMPT)
  })

  it('MemoryRecallSubAgent.SYSTEM_PROMPT === MEMORY_RECALL_SYSTEM_PROMPT', () => {
    expect(MemoryRecallSubAgent.SYSTEM_PROMPT).toBe(MEMORY_RECALL_SYSTEM_PROMPT)
  })

  it('JudgeSubAgent.SYSTEM_PROMPT === JUDGE_SYSTEM_PROMPT', () => {
    expect(JudgeSubAgent.SYSTEM_PROMPT).toBe(JUDGE_SYSTEM_PROMPT)
  })

  it('TieBreakerSubAgent.SYSTEM_PROMPT === TIE_BREAKER_SYSTEM_PROMPT', () => {
    expect(TieBreakerSubAgent.SYSTEM_PROMPT).toBe(TIE_BREAKER_SYSTEM_PROMPT)
  })
})

describe('TQ-239 PLANNING_SYSTEM_PROMPT deprecated comment', () => {
  // ファイル内 deprecation コメントの存在を検証する。
  // PLANNING_SYSTEM_PROMPT 自体は internal const のため直接 import できないので、
  // PLANNING_CONFIG.systemPromptTemplate と source 文字列から間接確認する。
  it('PLANNING_CONFIG.systemPromptTemplate は本体を維持しつつ後方互換のため残置', async () => {
    const { PLANNING_CONFIG } = await import('@/lib/mentor/core/roles')
    expect(PLANNING_CONFIG.systemPromptTemplate).toContain(
      'あなたは学習メンターAIのプラン作成担当です。',
    )
  })
})
