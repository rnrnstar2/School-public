import { execa } from 'execa'

export interface RunCommandInput {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string | undefined>
}

export interface RunCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandRunner {
  run(input: RunCommandInput): Promise<RunCommandResult>
}

export function createExecaRunner(
  baseEnv: NodeJS.ProcessEnv = process.env,
): CommandRunner {
  return {
    async run({ command, args, cwd, env }): Promise<RunCommandResult> {
      const result = await execa(command, args, {
        cwd,
        env: {
          ...baseEnv,
          ...env,
        },
        reject: false,
      })

      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      }
    },
  }
}
