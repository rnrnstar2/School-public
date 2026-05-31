import { describe, expect, it } from 'vitest'

import {
  buildAiDelegationPromptMessages,
  buildMockAiDelegationBrief,
  formatAiDelegationKindLabel,
} from './ai-delegation'

const baseContext = {
  goalTitle: 'Goal tree を整える',
  goalDescription: 'task と context をつなぐ',
  nodeLabel: 'AI に brief を任せる',
  nodeType: 'task',
  nodeStatus: 'pending',
  ownerType: 'ai',
  dependencyLabels: ['依存 task を完了する'],
  siblingLabels: ['goal context に表示する'],
  nextActionPreview: 'API route を追加する',
  contextSnippets: [
    {
      sourceType: 'doc',
      content: 'goal context panel は details で折りたたむ',
    },
  ],
} as const

describe('ai delegation prompts', () => {
  it('builds kind-specific prompt messages with task context', () => {
    const messages = buildAiDelegationPromptMessages('code_brief', baseContext)

    expect(messages.system).toContain('実装ブリーフ')
    expect(messages.user).toContain('Goal: Goal tree を整える')
    expect(messages.user).toContain('Dependencies:')
    expect(messages.user).toContain('goal context panel は details で折りたたむ')
  })

  it('builds a deterministic mock brief for analyze', () => {
    const brief = buildMockAiDelegationBrief('analyze', baseContext)

    expect(formatAiDelegationKindLabel('analyze')).toBe('Analyze Brief')
    expect(brief).toContain('[Mock Analyze Brief] AI に brief を任せる')
    expect(brief).toContain('仮説 1')
    expect(brief).toContain('goal context')
  })
})
