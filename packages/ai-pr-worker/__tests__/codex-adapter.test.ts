import { describe, expect, it } from 'vitest'

import type { CommandRunner, RunCommandInput } from '../src/command-runner.js'
import {
  CodexAdapterError,
  RealCodexAdapter,
  extractCodexSessionId,
} from '../src/codex-adapter.js'

function makeRunner(result: {
  exitCode: number
  stdout: string
  stderr: string
}): {
  calls: RunCommandInput[]
  runner: CommandRunner
} {
  const calls: RunCommandInput[] = []
  return {
    calls,
    runner: {
      async run(input) {
        calls.push(input)
        return result
      },
    },
  }
}

describe('RealCodexAdapter', () => {
  it('uses the required codex exec argv/env shape', async () => {
    const { calls, runner } = makeRunner({
      exitCode: 0,
      stdout: 'thread_id: 019d9b79-4ccc-77e0-b41c-268d6c375467',
      stderr: '',
    })

    const adapter = new RealCodexAdapter(runner)
    const result = await adapter.exec({
      worktreePath: '/tmp/worktree',
      prompt: 'Implement the change.',
      outputLastMessagePath: '/tmp/worktree/.ai-pr-worker/last-message.md',
      ghToken: 'gh-token',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      command: 'codex',
      args: [
        'exec',
        '-C',
        '/tmp/worktree',
        '--dangerously-bypass-approvals-and-sandbox',
        '--output-last-message',
        '/tmp/worktree/.ai-pr-worker/last-message.md',
        'Implement the change.',
      ],
      env: {
        GH_TOKEN: 'gh-token',
      },
    })
    expect(result.sessionId).toBe('019d9b79-4ccc-77e0-b41c-268d6c375467')
  })

  it('throws a structured error on codex failure', async () => {
    const { runner } = makeRunner({
      exitCode: 7,
      stdout: '',
      stderr: 'codex session_id: 019d9b79-4ccc-77e0-b41c-268d6c375467 failed',
    })

    const adapter = new RealCodexAdapter(runner)

    await expect(
      adapter.exec({
        worktreePath: '/tmp/worktree',
        prompt: 'Implement the change.',
        outputLastMessagePath: '/tmp/worktree/.ai-pr-worker/last-message.md',
        ghToken: 'gh-token',
      }),
    ).rejects.toMatchObject({
      name: 'CodexAdapterError',
      exitCode: 7,
      sessionId: '019d9b79-4ccc-77e0-b41c-268d6c375467',
    })
  })
})

describe('extractCodexSessionId', () => {
  it('finds explicit session or thread ids', () => {
    expect(
      extractCodexSessionId(
        'thread_id: 019d9b79-4ccc-77e0-b41c-268d6c375467',
      ),
    ).toBe('019d9b79-4ccc-77e0-b41c-268d6c375467')
  })

  it('returns null when stdout only contains unrelated UUIDs without a session/thread tag', () => {
    expect(
      extractCodexSessionId(
        'action_id=11111111-1111-4111-8111-111111111111 run=22222222-2222-4222-8222-222222222222',
      ),
    ).toBeNull()
  })

  it('extracts only the tagged UUID when multiple UUIDs are present', () => {
    expect(
      extractCodexSessionId(
        [
          'action_id=11111111-1111-4111-8111-111111111111',
          'Session ID: 019d9b79-4ccc-77e0-b41c-268d6c375467',
          'goal_id=22222222-2222-4222-8222-222222222222',
        ].join('\n'),
      ),
    ).toBe('019d9b79-4ccc-77e0-b41c-268d6c375467')
  })
})
