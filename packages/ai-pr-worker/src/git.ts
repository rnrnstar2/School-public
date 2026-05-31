import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'

import type { CommandRunner, RunCommandResult } from './command-runner.js'

export interface CreateWorktreeInput {
  repoRoot: string
  branchName: string
  worktreePath: string
}

export interface GitClient {
  createWorktree(input: CreateWorktreeInput): Promise<void>
  ensureChanges(worktreePath: string): Promise<void>
  commitAll(worktreePath: string, message: string): Promise<void>
  pushBranch(worktreePath: string, branchName: string): Promise<void>
  removeWorktree(repoRoot: string, worktreePath: string): Promise<void>
  deleteLocalBranch(repoRoot: string, branchName: string): Promise<void>
  resolveRepoRoot(cwd: string): Promise<string>
}

export class GitCommandError extends Error {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string

  constructor(message: string, result: RunCommandResult) {
    super(message)
    this.name = 'GitCommandError'
    this.exitCode = result.exitCode
    this.stdout = result.stdout
    this.stderr = result.stderr
  }
}

function ensureSuccess(message: string, result: RunCommandResult): void {
  if (result.exitCode !== 0) {
    throw new GitCommandError(message, result)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export class RealGitClient implements GitClient {
  constructor(private readonly runner: CommandRunner) {}

  async createWorktree(input: CreateWorktreeInput): Promise<void> {
    const fetchResult = await this.runner.run({
      command: 'git',
      args: ['fetch', 'origin', 'main'],
      cwd: input.repoRoot,
    })
    ensureSuccess('git fetch origin main failed', fetchResult)

    const result = await this.runner.run({
      command: 'git',
      args: [
        'worktree',
        'add',
        '-B',
        input.branchName,
        input.worktreePath,
        'origin/main',
      ],
      cwd: input.repoRoot,
    })
    ensureSuccess('git worktree add failed', result)
  }

  async ensureChanges(worktreePath: string): Promise<void> {
    const result = await this.runner.run({
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: worktreePath,
    })
    ensureSuccess('git status --porcelain failed', result)

    if (!result.stdout.trim()) {
      throw new GitCommandError('codex produced no file changes', result)
    }
  }

  async commitAll(worktreePath: string, message: string): Promise<void> {
    const addResult = await this.runner.run({
      command: 'git',
      args: ['add', '-A'],
      cwd: worktreePath,
    })
    ensureSuccess('git add -A failed', addResult)

    const commitResult = await this.runner.run({
      command: 'git',
      args: ['commit', '-m', message],
      cwd: worktreePath,
    })
    ensureSuccess('git commit failed', commitResult)
  }

  async pushBranch(worktreePath: string, branchName: string): Promise<void> {
    const result = await this.runner.run({
      command: 'git',
      args: ['push', '-u', 'origin', branchName],
      cwd: worktreePath,
    })
    ensureSuccess('git push failed', result)
  }

  async removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
    if (!(await pathExists(worktreePath))) return

    const result = await this.runner.run({
      command: 'git',
      args: ['worktree', 'remove', '--force', worktreePath],
      cwd: repoRoot,
    })
    ensureSuccess('git worktree remove failed', result)
  }

  async deleteLocalBranch(repoRoot: string, branchName: string): Promise<void> {
    const result = await this.runner.run({
      command: 'git',
      args: ['branch', '-D', branchName],
      cwd: repoRoot,
    })

    if (
      result.exitCode !== 0 &&
      !result.stderr.includes("not found") &&
      !result.stderr.includes("branch named")
    ) {
      throw new GitCommandError('git branch -D failed', result)
    }
  }

  async resolveRepoRoot(cwd: string): Promise<string> {
    const result = await this.runner.run({
      command: 'git',
      args: ['rev-parse', '--show-toplevel'],
      cwd,
    })
    ensureSuccess('git rev-parse --show-toplevel failed', result)
    return result.stdout.trim()
  }
}
