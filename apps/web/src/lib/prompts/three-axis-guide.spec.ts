import { describe, expect, it } from 'vitest'

import { THREE_AXIS_GUIDE } from './three-axis-guide'
import { codexCliBriefPrompt, claudeCodeBriefPrompt } from './agent-delegation'
import { buildAiDelegationPromptMessages } from './ai-delegation'
import { buildAsk2ActionPromptMessages } from './ask2action'
import {
  ATOM_PLAN_COMPILATION_PROMPT,
  GOAL_NORMALIZATION_PROMPT,
  GOAL_TREE_ATOM_MATCH_PROMPT,
  GOAL_TREE_DECOMPOSITION_PROMPT,
  LESSON_RERANK_PROMPT,
  PLAN_COMPILATION_PROMPT,
  DOMAIN_CLASSIFICATION_PROMPT,
} from '@/lib/planner/goal-first/ai-prompts'
import {
  HEARING_CONFIG,
  PLANNING_CONFIG,
  PLANNING_RECOMPILE_CONFIG,
  COACHING_CONFIG,
  REVIEW_CONFIG,
} from '@/lib/mentor/core/roles'
import { buildLessonChatSystemPrompt } from '@/lib/lessons/chat-prompts'
import { buildLessonFeedbackAdjustmentPrompt } from '@/lib/lessons/feedback-prompts'
import { buildLessonChatSummaryMessages } from '@/lib/lessons/chat-summary-prompts'
import { buildLessonContextBridgePrompt } from '@/lib/lessons/context-bridge-prompts'

const REQUIRED_AXES = ['AI フル活用', '非エンジニア', '最短']

function expectAxesPresent(text: string, label: string) {
  for (const axis of REQUIRED_AXES) {
    expect(text, `${label} should contain "${axis}"`).toContain(axis)
  }
}

describe('TQ-223 THREE_AXIS_GUIDE constant', () => {
  it('declares the 3 axes (AI フル活用 / 非エンジニア / 最短)', () => {
    expectAxesPresent(THREE_AXIS_GUIDE, 'THREE_AXIS_GUIDE')
  })

  it('names the primary persona P-NONENG-WEBAPP', () => {
    expect(THREE_AXIS_GUIDE).toContain('P-NONENG-WEBAPP')
  })
})

describe('TQ-223 mentor role prompts include the 3 軸 preamble', () => {
  it('HEARING_CONFIG.systemPromptTemplate', () => {
    expectAxesPresent(HEARING_CONFIG.systemPromptTemplate, 'HEARING')
  })

  it('PLANNING_CONFIG.systemPromptTemplate', () => {
    expectAxesPresent(PLANNING_CONFIG.systemPromptTemplate, 'PLANNING')
  })

  it('PLANNING_RECOMPILE_CONFIG.systemPromptTemplate', () => {
    expectAxesPresent(
      PLANNING_RECOMPILE_CONFIG.systemPromptTemplate,
      'PLANNING_RECOMPILE',
    )
  })

  it('COACHING_CONFIG.systemPromptTemplate', () => {
    expectAxesPresent(COACHING_CONFIG.systemPromptTemplate, 'COACHING')
  })

  it('REVIEW_CONFIG.systemPromptTemplate', () => {
    expectAxesPresent(REVIEW_CONFIG.systemPromptTemplate, 'REVIEW')
  })
})

describe('TQ-223 lesson prompts include the 3 軸 preamble', () => {
  it('lesson chat system prompt', () => {
    const built = buildLessonChatSystemPrompt({
      lessonContext: 'sample lesson',
      personalizationBlock: null,
    })
    expectAxesPresent(built, 'lesson chat system prompt')
  })

  it('lesson feedback adjustment prompt', () => {
    const built = buildLessonFeedbackAdjustmentPrompt({
      lessonTitle: 'sample',
      difficultyRating: 3,
      clarityRating: 3,
      comment: null,
      personalizationBlock: null,
    })
    expectAxesPresent(built, 'lesson feedback prompt')
  })

  it('lesson chat summary system message', () => {
    const messages = buildLessonChatSummaryMessages({
      chatMessages: [],
      lessonTitle: 'sample',
    })
    const system = messages.find((m) => m.role === 'system')
    expect(system).toBeDefined()
    expectAxesPresent(system!.content, 'lesson chat summary system')
  })

  it('lesson context-bridge prompt', () => {
    const built = buildLessonContextBridgePrompt({
      lessonContext: 'sample lesson',
      taskContext: 'sample task',
      personalizationBlock: null,
    })
    expectAxesPresent(built, 'lesson context-bridge prompt')
  })
})

describe('TQ-223 goal-first planner prompts include the 3 軸 preamble', () => {
  it.each([
    ['GOAL_NORMALIZATION_PROMPT', GOAL_NORMALIZATION_PROMPT],
    ['DOMAIN_CLASSIFICATION_PROMPT', DOMAIN_CLASSIFICATION_PROMPT],
    ['LESSON_RERANK_PROMPT', LESSON_RERANK_PROMPT],
    ['PLAN_COMPILATION_PROMPT', PLAN_COMPILATION_PROMPT],
    ['ATOM_PLAN_COMPILATION_PROMPT', ATOM_PLAN_COMPILATION_PROMPT],
    ['GOAL_TREE_DECOMPOSITION_PROMPT', GOAL_TREE_DECOMPOSITION_PROMPT],
    ['GOAL_TREE_ATOM_MATCH_PROMPT', GOAL_TREE_ATOM_MATCH_PROMPT],
  ])('%s contains the 3 axes', (label, prompt) => {
    expectAxesPresent(prompt, label)
  })
})

describe('TQ-223 delegation / ask2action prompts include the 3 軸 preamble', () => {
  const baseContext = {
    goalTitle: 'goal',
    goalDescription: null,
    nodeLabel: 'task',
    nodeType: 'task',
    nodeStatus: 'todo',
    ownerType: 'ai' as const,
    dependencyLabels: [] as string[],
    siblingLabels: [] as string[],
    nextActionPreview: null,
    contextSnippets: [] as { sourceType: string; content: string }[],
  }

  const sampleTask = {
    id: 'node-1',
    label: 'task',
    nodeType: 'task',
    nodeStatus: 'todo',
    ownerType: 'ai',
  }

  it('codexCliBriefPrompt', () => {
    expectAxesPresent(codexCliBriefPrompt(sampleTask, baseContext), 'codexCliBriefPrompt')
  })

  it('claudeCodeBriefPrompt', () => {
    expectAxesPresent(
      claudeCodeBriefPrompt(sampleTask, baseContext),
      'claudeCodeBriefPrompt',
    )
  })

  it.each(['prompt', 'code_brief', 'analyze'] as const)(
    'buildAiDelegationPromptMessages kind=%s',
    (kind) => {
      const { system } = buildAiDelegationPromptMessages(kind, baseContext)
      expectAxesPresent(system, `ai-delegation ${kind}`)
    },
  )

  it('buildAsk2ActionPromptMessages', () => {
    const { system } = buildAsk2ActionPromptMessages({
      goalTitle: 'goal',
      goalDescription: null,
      nodes: [],
    })
    expectAxesPresent(system, 'ask2action system')
  })
})

describe('TQ-223 HEARING / Live hearing stack contradiction is resolved', () => {
  it('HEARING_SYSTEM_PROMPT no longer hard-codes "Next.js + Supabase + Vercel で固定"', () => {
    expect(HEARING_CONFIG.systemPromptTemplate).not.toContain(
      'スタックは Next.js + Supabase + Vercel で固定',
    )
  })

  it('HEARING_SYSTEM_PROMPT instructs flexible stack selection', () => {
    expect(HEARING_CONFIG.systemPromptTemplate).toContain(
      '技術スタックはペルソナや goal に応じて柔軟に決定',
    )
  })
})
