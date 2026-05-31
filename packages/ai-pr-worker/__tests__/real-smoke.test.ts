import { describe, expect, it } from 'vitest'

import { RealCodexAdapter } from '../src/codex-adapter.js'
import { createExecaRunner } from '../src/command-runner.js'
import { RealGhAdapter } from '../src/gh-adapter.js'
import { RealGitClient } from '../src/git.js'
import { createSupabaseAiPrWorkerRepository } from '../src/repository.js'
import { runWorker } from '../src/worker.js'

const runReal = process.env.RUN_REAL_PR_WORKER === '1'
const d = runReal ? describe : describe.skip

d('real ai-pr-worker smoke', () => {
  it(
    'runs the real codex exec + gh pr create flow when explicitly enabled',
    async () => {
      const actionId = process.env.AI_PR_WORKER_SMOKE_ACTION_ID
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      const ghToken = process.env.GH_TOKEN

      if (!actionId || !supabaseUrl || !serviceRoleKey || !ghToken) {
        throw new Error(
          'RUN_REAL_PR_WORKER=1 requires AI_PR_WORKER_SMOKE_ACTION_ID, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and GH_TOKEN.',
        )
      }

      const runner = createExecaRunner()
      const git = new RealGitClient(runner)
      const repoRoot = await git.resolveRepoRoot(
        process.env.AI_PR_WORKER_REPO_ROOT ?? process.cwd(),
      )

      const result = await runWorker(
        {
          actionId,
          dryRun: false,
          ghToken,
        },
        {
          repoRoot,
          repository: createSupabaseAiPrWorkerRepository({
            url: supabaseUrl,
            serviceRoleKey,
          }),
          git,
          codex: new RealCodexAdapter(runner),
          gh: new RealGhAdapter(runner),
        },
      )

      expect(result.status).toBe('succeeded')
      expect(result.prUrl).toMatch(/^https:\/\/github\.com\//)
    },
    180_000,
  )
})
