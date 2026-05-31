import { describe, expect, it, vi } from 'vitest'

import { CliUsageError, parseCliArgs, resolveGhTokenForCli, runCli } from '../src/cli.js'

describe('parseCliArgs', () => {
  it('parses the required run command and action id', () => {
    expect(
      parseCliArgs([
        'run',
        '--action-id',
        '11111111-1111-4111-8111-111111111111',
      ]),
    ).toEqual({
      command: 'run',
      actionId: '11111111-1111-4111-8111-111111111111',
      dryRun: false,
      adapter: 'real',
    })
  })

  it('supports inline adapter and dry-run flags', () => {
    expect(
      parseCliArgs([
        'run',
        '--action-id=11111111-1111-4111-8111-111111111111',
        '--dry-run',
        '--adapter=fake',
      ]),
    ).toEqual({
      command: 'run',
      actionId: '11111111-1111-4111-8111-111111111111',
      dryRun: true,
      adapter: 'fake',
    })
  })

  it('rejects unknown commands and malformed UUIDs', () => {
    expect(() => parseCliArgs(['plan'])).toThrow(CliUsageError)
    expect(() =>
      parseCliArgs(['run', '--action-id', 'not-a-uuid']),
    ).toThrow('Invalid UUID')
  })
})

describe('runCli', () => {
  it('dispatches parsed options into the runner', async () => {
    const runner = vi.fn(async () => 0)

    await expect(
      runCli(
        ['run', '--action-id', '11111111-1111-4111-8111-111111111111'],
        runner,
      ),
    ).resolves.toBe(0)

    expect(runner).toHaveBeenCalledWith({
      command: 'run',
      actionId: '11111111-1111-4111-8111-111111111111',
      dryRun: false,
      adapter: 'real',
    })
  })

  it('allows real-adapter dry-runs without GH_TOKEN', async () => {
    const runner = vi.fn(async (options) => {
      expect(resolveGhTokenForCli(options, {})).toBeUndefined()
      return 0
    })

    await expect(
      runCli(
        [
          'run',
          '--adapter=real',
          '--dry-run',
          '--action-id=11111111-1111-4111-8111-111111111111',
        ],
        runner,
      ),
    ).resolves.toBe(0)
  })
})
