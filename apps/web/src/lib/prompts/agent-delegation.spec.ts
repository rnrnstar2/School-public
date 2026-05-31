import { describe, expect, it } from 'vitest'

import {
  claudeCodeBriefPrompt,
  codexCliBriefPrompt,
  type AgentDelegationTask,
} from './agent-delegation'
import type { AiDelegationPromptContext } from './ai-delegation'

const baseTask: AgentDelegationTask = {
  id: 'node-1',
  label: 'Agent brief を追加する',
  nodeType: 'task',
  nodeStatus: 'pending',
  ownerType: 'ai',
}

const baseContext: AiDelegationPromptContext = {
  goalTitle: 'Goal tree を整える',
  goalDescription: 'task と context をつなぐ',
  nodeLabel: 'Agent brief を追加する',
  nodeType: 'task',
  nodeStatus: 'pending',
  ownerType: 'ai',
  dependencyLabels: ['delegate route を確認する'],
  siblingLabels: ['goal context panel を更新する'],
  nextActionPreview: 'popover に copy button を追加する',
  contextSnippets: [
    {
      sourceType: 'doc',
      content: '既存の ai_delegation_brief は温存する',
    },
  ],
}

describe('agent delegation prompts', () => {
  it('builds a Codex CLI brief with cwd, steps, expected artifacts, and accept criteria', () => {
    const brief = codexCliBriefPrompt(baseTask, baseContext)

    expect(brief).toContain('Codex CLI')
    expect(brief).toContain('cwd: /path/to/project-root')
    expect(brief).toContain('Execution Steps')
    expect(brief).toContain('Expected Artifacts')
    expect(brief).toContain('Accept')
    expect(brief).toContain('bash scripts/ci/local-verify.sh')
  })

  it('builds a Claude Code brief with context, task, hints, and checkpoint sections', () => {
    const brief = claudeCodeBriefPrompt(baseTask, baseContext)

    expect(brief).toContain('Claude Code')
    expect(brief).toContain('Context')
    expect(brief).toContain('Task')
    expect(brief).toContain('Hints')
    expect(brief).toContain('Checkpoint')
    expect(brief).toContain('expected artifact:')
    expect(brief).toContain('accept:')
  })
})
