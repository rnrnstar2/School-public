import { describe, expect, it } from 'vitest'

import {
  buildBranchName,
  buildCodexPrompt,
  buildCommitMessage,
  buildPullRequestBody,
  buildWorktreePath,
} from '../src/prompt.js'
import { makeAction } from './test-helpers.js'

describe('prompt helpers', () => {
  it('builds stable branch and worktree paths', () => {
    expect(
      buildBranchName(
        '11111111-1111-4111-8111-111111111111',
        'run-12345678',
      ),
    ).toBe('ai-pr-worker/11111111-111-run-1234')

    expect(
      buildBranchName(
        '11111111-1111-4111-8111-111111111111',
        'run-87654321',
      ),
    ).toBe('ai-pr-worker/11111111-111-run-8765')

    expect(
      buildWorktreePath(
        '/tmp/School-tq-ai-pr-worker',
        '11111111-1111-4111-8111-111111111111',
        'run-12345678',
      ),
    ).toBe(
      '/tmp/School-pr-worker-11111111-1111-4111-8111-111111111111-run-1234',
    )
  })

  it('produces distinct branch names for the same action when the run ids differ', () => {
    expect(
      buildBranchName(
        '11111111-1111-4111-8111-111111111111',
        'run-12345678',
      ),
    ).not.toBe(
      buildBranchName(
        '11111111-1111-4111-8111-111111111111',
        'run-87654321',
      ),
    )
  })

  it('builds commit messages and PR bodies from the action row', () => {
    const action = makeAction({
      title: 'Implement the worker integration end-to-end with a very long descriptive title',
    })

    expect(buildCommitMessage(action)).toContain('feat(ai-pr-worker):')

    const body = buildPullRequestBody(action, 'Changed README and added tests.')
    expect(body).toContain('decision_ledger action')
    expect(body).toContain('Changed README and added tests.')
  })

  it('builds a codex prompt that references the handoff contract and forbids git publish steps', () => {
    const prompt = buildCodexPrompt(makeAction())

    expect(prompt).toContain('docs/swarmops/codex-handoff.md')
    expect(prompt).toContain('Do not commit, push, open the PR')
    expect(prompt).toContain('Metadata:')
  })
})
