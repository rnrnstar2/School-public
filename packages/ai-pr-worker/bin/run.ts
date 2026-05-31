#!/usr/bin/env -S npx tsx

import { resolveGhTokenForCli, runCli } from '../src/cli.js'
import { createExecaRunner } from '../src/command-runner.js'
import { WorkerExitError } from '../src/errors.js'
import { FakeCodexAdapter, FakeGhAdapter } from '../src/fake-adapters.js'
import { RealCodexAdapter } from '../src/codex-adapter.js'
import { RealGhAdapter } from '../src/gh-adapter.js'
import { RealGitClient } from '../src/git.js'
import { createSupabaseAiPrWorkerRepository } from '../src/repository.js'
import { runWorker } from '../src/worker.js'

async function main(): Promise<void> {
  const runner = createExecaRunner()
  const git = new RealGitClient(runner)

  const exitCode = await runCli(process.argv.slice(2), async (options) => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      throw new WorkerExitError(
        'NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required',
        1,
      )
    }

    const repoRoot = await git.resolveRepoRoot(
      process.env.AI_PR_WORKER_REPO_ROOT ?? process.cwd(),
    )
    const repository = createSupabaseAiPrWorkerRepository({
      url: supabaseUrl,
      serviceRoleKey,
    })

    const codex =
      options.adapter === 'fake'
        ? new FakeCodexAdapter()
        : new RealCodexAdapter(runner)
    const gh =
      options.adapter === 'fake'
        ? new FakeGhAdapter()
        : new RealGhAdapter(runner)

    await runWorker(
      {
        actionId: options.actionId,
        dryRun: options.dryRun,
        ghToken: resolveGhTokenForCli(options, process.env),
      },
      {
        repoRoot,
        repository,
        git,
        codex,
        gh,
      },
    )

    return 0
  })
  process.exitCode = exitCode
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  if (error instanceof WorkerExitError) {
    process.exitCode = error.exitCode
    return
  }
  process.exitCode = 1
})
