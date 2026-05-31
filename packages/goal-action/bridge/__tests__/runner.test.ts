import { describe, expect, it } from 'vitest'

import { ApprovalMissingError } from '../src/approval-gate.js'
import { dryRun } from '../src/dry-run.js'
import { UnresolvedStagePlaceholderError } from '../src/errors.js'
import type { PipelineClient } from '../src/pipeline-client.js'
import {
  execute,
  resolveStageArgs,
  type BridgePersist,
  type IntakeWriter,
  type RuntimePaths,
} from '../src/runner.js'
import type {
  ApprovalRow,
  BridgeStage,
  IntakeBundle,
  LessonDevProposalInput,
  StageResult,
} from '../src/schema.js'
import { intakeYamlPath } from '../src/stage-commands.js'

// Real `lesson-factory/package.json` scripts (minus bridge-forbidden
// `publish`, and minus owner-only helpers that the bridge does not call:
// `new`, `sync`, `legacy-import`, `run`, `list`). The bridge must only emit
// commands that match this regex.
const REAL_LESSON_SCRIPT = /^lesson:(research|draft|critique|media|eval)$/

// pnpm workspace-filter prefix applied to every CLI-backed stage so the
// root repo resolves the script via the `@school/lesson-factory` package.
// See: packages/goal-action/bridge/src/stage-commands.ts::PNPM_FILTER_ARGS.
const PNPM_FILTER_PREFIX = ['--filter', '@school/lesson-factory'] as const

const PROPOSAL_ID = 'ffffffff-ffff-4fff-afff-ffffffffffff'

function makeProposal(
  overrides: Partial<LessonDevProposalInput> = {},
): LessonDevProposalInput {
  return {
    id: PROPOSAL_ID,
    capability_slug: 'prompt-quality',
    outcome_slug: 'production-ready',
    priority: 'high',
    status: 'approved',
    gap_ids: ['gap-1'],
    weakest_axis: 'blocker',
    evidence: {},
    candidate_lesson_slug: null,
    rationale: 'prompts fail QA eval on edge cases',
    proposed_by: 'ai',
    proposed_at: '2026-04-17T10:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function approvedRow(): ApprovalRow {
  return {
    id: 'gate-1',
    gate_type: 'general',
    status: 'approved',
    decided_by: 'owner',
    decided_at: '2026-04-17T09:00:00.000Z',
    reason: 'LGTM',
    expires_at: null,
    metadata: { lesson_dev_proposal_id: PROPOSAL_ID },
  }
}

function makeFakeClient(
  overrides: Partial<Record<BridgeStage, 'success' | 'failed'>> = {},
): {
  client: PipelineClient
  calls: BridgeStage[]
} {
  const calls: BridgeStage[] = []
  const client: PipelineClient = {
    async run({ stage }): Promise<StageResult> {
      calls.push(stage)
      const outcome = overrides[stage] ?? 'success'
      if (outcome === 'failed') {
        return {
          stage,
          status: 'failed',
          stdout: '',
          stderr: `${stage} exploded`,
          durationMs: 1,
          error: `${stage} stage failure`,
        }
      }
      return {
        stage,
        status: 'success',
        stdout: `${stage} ok`,
        stderr: '',
        durationMs: 1,
        error: null,
      }
    },
  }
  return { client, calls }
}

function makeFakePersist(): {
  persist: BridgePersist
  rows: Parameters<BridgePersist['recordRun']>[0][]
} {
  const rows: Parameters<BridgePersist['recordRun']>[0][] = []
  return {
    persist: {
      async recordRun(row) {
        rows.push(row)
      },
    },
    rows,
  }
}

function makeFakeIntakeWriter(): {
  writer: IntakeWriter
  writes: Array<{ targetPath: string; bundle: IntakeBundle }>
} {
  const writes: Array<{ targetPath: string; bundle: IntakeBundle }> = []
  return {
    writer: {
      async writeIntakeYaml(payload) {
        writes.push(payload)
      },
    },
    writes,
  }
}

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe('dryRun', () => {
  it('returns a plan with the six bridge stages in order', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })

    expect(plan.stages).toEqual([
      'intake',
      'context-fetch',
      'draft',
      'critique',
      'media',
      'eval',
    ])
  })

  it('never includes publish in the plan', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    expect(plan.stages).not.toContain('publish' as never)
    expect(plan.entries.map((e) => e.stage)).not.toContain('publish' as never)
  })

  it('defaults to skipping the media stage', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const media = plan.entries.find((e) => e.stage === 'media')
    expect(media?.skip).toBe(true)
  })

  it('maps each non-internal stage to a real lesson-factory script (workspace-filtered)', () => {
    // P0-1: `lesson:intake` / `lesson:context-fetch` do NOT exist in
    // `lesson-factory/package.json`. Bridge stage names are kept, but every
    // emitted CLI command must match a real script. Also: publish never
    // appears.
    // Round 4 P2-1: every CLI-backed stage must be prefixed with
    // `--filter @school/lesson-factory` so the root `pnpm` invocation
    // resolves the `lesson:*` script via the workspace package (the repo
    // root has no such scripts).
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    for (const entry of plan.entries) {
      if (entry.effect !== null) {
        // Bridge-internal effect — no CLI command.
        expect(entry.cmd).toBeNull()
        continue
      }
      expect(entry.cmd).toBe('pnpm')
      // First two args MUST be the workspace filter flags.
      expect(entry.args[0]).toBe('--filter')
      expect(entry.args[1]).toBe('@school/lesson-factory')
      // Script name sits at index 2 after the filter prefix.
      const script = entry.args[2]
      expect(script).toMatch(REAL_LESSON_SCRIPT)
      // Hard-reject the naive `lesson:intake` / `lesson:context-fetch`
      // shapes the bridge used to emit before round 2.
      expect(script).not.toBe('lesson:intake')
      expect(script).not.toBe('lesson:context-fetch')
      expect(script).not.toBe('lesson:publish')
    }
  })

  it('represents `intake` as a bridge-internal effect, not a CLI command', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const intake = plan.entries.find((e) => e.stage === 'intake')
    expect(intake).toBeDefined()
    expect(intake!.effect).toBe('write-intake-yaml')
    expect(intake!.cmd).toBeNull()
    // Target path is derived from the slug so the plan is deterministic.
    expect(intake!.args[0]).toBe(intakeYamlPath(plan.slug))
  })

  it('maps context-fetch to `pnpm --filter @school/lesson-factory lesson:research <intake-yaml>`', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const entry = plan.entries.find((e) => e.stage === 'context-fetch')!
    expect(entry.cmd).toBe('pnpm')
    expect(entry.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:research',
      '<intake-yaml>',
    ])
  })

  it('maps draft to `pnpm --filter @school/lesson-factory lesson:draft <intake-yaml> --context <research>`', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const entry = plan.entries.find((e) => e.stage === 'draft')!
    expect(entry.cmd).toBe('pnpm')
    expect(entry.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:draft',
      '<intake-yaml>',
      '--context',
      '<research-output>',
    ])
  })

  it('maps critique, media, eval to workspace-filtered CLI args', () => {
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const critique = plan.entries.find((e) => e.stage === 'critique')!
    expect(critique.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:critique',
      '<draft-json>',
    ])
    const media = plan.entries.find((e) => e.stage === 'media')!
    expect(media.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:media',
      '<draft-json>',
    ])
    const evalE = plan.entries.find((e) => e.stage === 'eval')!
    expect(evalE.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:eval',
      '<draft-json>',
      '<critique-json>',
    ])
  })

  it('rejects any occurrence of `lesson:intake`/`lesson:context-fetch`', () => {
    // Extra guard against regressions to the round-1 shape. Script name
    // sits at index 2 after the `--filter @school/lesson-factory` prefix
    // added in round 4.
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    const scripts = plan.entries
      .filter((e) => e.cmd !== null)
      .map((e) => e.args[2])
    expect(scripts).not.toContain('lesson:intake')
    expect(scripts).not.toContain('lesson:context-fetch')
    expect(scripts).not.toContain('lesson:publish')
  })

  it('prefixes every CLI-backed stage with `--filter @school/lesson-factory` (Round 4 P2-1)', () => {
    // Exhaustive guard: the root repo has no `lesson:*` scripts, so a bare
    // `pnpm lesson:research ...` would fail with "command not found". The
    // workspace filter is REQUIRED for every non-effect stage.
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })
    for (const entry of plan.entries) {
      if (entry.effect !== null) continue
      expect(entry.args.slice(0, 2)).toEqual([...PNPM_FILTER_PREFIX])
    }
  })
})

// ---------------------------------------------------------------------------
// execute — approval gate
// ---------------------------------------------------------------------------

describe('execute', () => {
  it('throws ApprovalMissingError when no approval row exists', async () => {
    const { client } = makeFakeClient()
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await expect(
      execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => null },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-1',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(ApprovalMissingError)

    // Nothing should have been persisted because we aborted before any stage.
    expect(rows).toHaveLength(0)
  })

  it('runs intake → context-fetch → draft before the critique placeholder guard throws', async () => {
    // With stdout→path wiring deferred (spec non-goal), critique receives an
    // unresolved `<draft-json>` placeholder and the runner throws BEFORE
    // shelling out to `pnpm lesson:critique`. Stages up to that point still
    // execute successfully; the run is persisted as failed with
    // failedStage='critique'.
    const { client, calls } = makeFakeClient()
    const { persist, rows } = makeFakePersist()
    const { writer, writes } = makeFakeIntakeWriter()

    await expect(
      execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-1',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)

    // intake is handled as a bridge-internal effect — the pipeline client
    // should only see the CLI-backed stages up to draft. critique is
    // rejected before invocation.
    expect(calls).toEqual(['context-fetch', 'draft'])

    // intakeWriter is invoked exactly once with the plan's derived path.
    expect(writes).toHaveLength(1)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.failedStage).toBe('critique')
    expect(rows[0]!.proposalId).toBe(PROPOSAL_ID)
    expect(rows[0]!.runId).toBe('run-1')
  })

  it('resolves placeholder tokens to real paths at execution time', async () => {
    // Verify that context-fetch receives the concrete `intakeYamlPath(slug)`
    // instead of the literal `<intake-yaml>` placeholder, and that the
    // optional `--context <research-output>` pair is stripped when research
    // output is unavailable. critique is expected to throw — we only care
    // about the pre-critique call shape here.
    const seenCalls: Array<{ stage: BridgeStage; args: string[] }> = []
    const client: PipelineClient = {
      async run({ stage, args }): Promise<StageResult> {
        seenCalls.push({ stage, args })
        return {
          stage,
          status: 'success',
          stdout: '',
          stderr: '',
          durationMs: 0,
          error: null,
        }
      },
    }
    const { persist } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await expect(
      execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-resolve',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)

    // Derive slug the same way the runner would so we can assert resolved
    // path shape without relying on the thrown-path result (there is none).
    const plan = dryRun({
      proposal: makeProposal(),
      now: () => new Date('2026-04-17T12:00:00.000Z'),
    })

    const ctxFetch = seenCalls.find((c) => c.stage === 'context-fetch')!
    expect(ctxFetch.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:research',
      intakeYamlPath(plan.slug),
    ])

    // Draft should also see the resolved intake path. researchOutput is
    // unavailable (no-op research client), so the `--context <research>`
    // pair is stripped before shelling out. Workspace filter prefix is
    // still present.
    const draftCall = seenCalls.find((c) => c.stage === 'draft')!
    expect(draftCall.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:draft',
      intakeYamlPath(plan.slug),
    ])
    expect(draftCall.args).not.toContain('--context')

    // critique must NOT have been invoked — guard rejects unresolved
    // `<draft-json>` before the pipeline client is called.
    expect(seenCalls.find((c) => c.stage === 'critique')).toBeUndefined()
  })

  it('short-circuits and records failure when the draft stage fails', async () => {
    const { client, calls } = makeFakeClient({ draft: 'failed' })
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    const result = await execute(
      { proposal: makeProposal() },
      {
        pipelineClient: client,
        approvalGate: { fetchRow: async () => approvedRow() },
        persist,
        intakeWriter: writer,
        runIdFactory: () => 'run-2',
        now: () => new Date('2026-04-17T12:00:00.000Z'),
      },
    )

    expect(result.status).toBe('failed')
    expect(result.failedStage).toBe('draft')
    expect(result.error).toBe('draft stage failure')

    // Stages after draft (critique, media, eval) must not be invoked.
    // intake is bridge-internal so it's NOT in the pipeline client call log.
    expect(calls).toEqual(['context-fetch', 'draft'])

    // Only the stages we actually ran + any preceding skips should be in
    // stageResults; downstream stages are not included. intake counts too
    // because the internal effect succeeded.
    const recordedStages = result.stageResults.map((s) => s.stage)
    expect(recordedStages).toEqual(['intake', 'context-fetch', 'draft'])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.failedStage).toBe('draft')
  })

  it('records failure when intakeWriter is missing for the intake effect', async () => {
    // Regression guard: if a caller forgets to supply the intakeWriter the
    // runner surfaces the misconfiguration via a failed stage result (not a
    // silent success or a thrown error that skips recordRun).
    const { client, calls } = makeFakeClient()
    const { persist, rows } = makeFakePersist()

    const result = await execute(
      { proposal: makeProposal() },
      {
        pipelineClient: client,
        approvalGate: { fetchRow: async () => approvedRow() },
        persist,
        // intentionally no intakeWriter
        runIdFactory: () => 'run-no-writer',
        now: () => new Date('2026-04-17T12:00:00.000Z'),
      },
    )

    expect(result.status).toBe('failed')
    expect(result.failedStage).toBe('intake')
    // Nothing downstream should have been invoked via the pipeline client.
    expect(calls).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('never exposes publish in plan or stageResults', async () => {
    // Even though execute throws at the critique guard, the persisted
    // stageResults must not leak a `publish` entry. Publish is owner-manual
    // only and must never be represented anywhere in the bridge pipeline.
    const { client } = makeFakeClient()
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await expect(
      execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-3',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)

    expect(rows).toHaveLength(1)
    const stages = rows[0]!.stageResults.map((s) => s.stage)
    expect(stages).not.toContain('publish' as never)
  })

  it('prefers input.now over deps.now for timestamps (P2-1)', async () => {
    // The execute call will throw at the critique guard, but the persisted
    // row must still use `input.now` for startedAt/finishedAt — the clock
    // override is authoritative for the whole run regardless of outcome.
    const { client } = makeFakeClient()
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await expect(
      execute(
        {
          proposal: makeProposal(),
          now: () => new Date('2030-01-02T03:04:05.000Z'),
        },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-now',
          // deps.now intentionally differs from input.now; input.now must win.
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.startedAt).toBe('2030-01-02T03:04:05.000Z')
    expect(rows[0]!.finishedAt).toBe('2030-01-02T03:04:05.000Z')
  })

  it('uses input.now when approval expiry check runs (P2-1)', async () => {
    const { client } = makeFakeClient()
    const { persist } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    // Approval expired relative to deps.now (2026-04-17) but still valid
    // relative to input.now (2026-04-16) — input.now must be the authority.
    // If deps.now had been used, approval would have been rejected as
    // expired and `ApprovalMissingError` would have thrown first. Instead
    // we expect the pipeline to proceed past the approval gate and throw
    // later at the critique placeholder guard, proving input.now was used.
    const expiringRow: ApprovalRow = {
      ...approvedRow(),
      expires_at: '2026-04-16T12:00:00.000Z',
    }

    await expect(
      execute(
        {
          proposal: makeProposal(),
          now: () => new Date('2026-04-16T06:00:00.000Z'),
        },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => expiringRow },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-expiry',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)
    // Crucially NOT ApprovalMissingError — input.now satisfied the expiry.
  })
})

// ---------------------------------------------------------------------------
// resolveStageArgs — unresolved placeholder detection (Round 3 P1-1)
// ---------------------------------------------------------------------------

function emptyRuntimePaths(): RuntimePaths {
  return {
    intakeYaml: null,
    researchOutput: null,
    draftJson: null,
    critiqueJson: null,
    mediaJson: null,
    evalJson: null,
  }
}

describe('resolveStageArgs (Round 3 P1-1)', () => {
  it('flags a bare <draft-json> placeholder as missing when draftJson is unresolved', () => {
    const result = resolveStageArgs(
      ['lesson:critique', '<draft-json>'],
      emptyRuntimePaths(),
    )

    expect(result.missing).toEqual(['<draft-json>'])
    expect(result.args).toEqual(['lesson:critique', '<draft-json>'])
  })

  it('flags multiple distinct placeholders in first-seen order with de-duplication', () => {
    const result = resolveStageArgs(
      ['lesson:eval', '<draft-json>', '<critique-json>', '<draft-json>'],
      emptyRuntimePaths(),
    )

    // Deduped (first-seen order) so error message is stable.
    expect(result.missing).toEqual(['<draft-json>', '<critique-json>'])
  })

  it('returns missing: [] when every placeholder resolves to a concrete path', () => {
    const result = resolveStageArgs(
      ['lesson:eval', '<draft-json>', '<critique-json>'],
      {
        intakeYaml: 'intake.yaml',
        researchOutput: 'research.json',
        draftJson: 'draft.json',
        critiqueJson: 'critique.json',
        mediaJson: null,
        evalJson: null,
      },
    )

    expect(result.missing).toEqual([])
    expect(result.args).toEqual(['lesson:eval', 'draft.json', 'critique.json'])
  })

  it('strips `--context <research-output>` so it is not reported as missing', () => {
    const result = resolveStageArgs(
      ['lesson:draft', '<intake-yaml>', '--context', '<research-output>'],
      {
        intakeYaml: 'intake.yaml',
        researchOutput: null,
        draftJson: null,
        critiqueJson: null,
        mediaJson: null,
        evalJson: null,
      },
    )

    expect(result.args).toEqual(['lesson:draft', 'intake.yaml'])
    expect(result.missing).toEqual([])
  })

  it('ignores non-placeholder CLI tokens (e.g. flag names) when scanning for missing', () => {
    const result = resolveStageArgs(
      ['lesson:draft', '--some-flag', 'value', '<draft-json>'],
      emptyRuntimePaths(),
    )

    expect(result.missing).toEqual(['<draft-json>'])
    // `--some-flag` / `value` are ordinary args and NOT flagged.
    expect(result.args).toEqual([
      'lesson:draft',
      '--some-flag',
      'value',
      '<draft-json>',
    ])
  })
})

// ---------------------------------------------------------------------------
// execute — unresolved stage placeholder guard (Round 3 P1-1 integration)
// ---------------------------------------------------------------------------

describe('execute (unresolved stage placeholder guard)', () => {
  it('throws UnresolvedStagePlaceholderError at critique, records failed row, does NOT invoke pipelineClient.run for critique', async () => {
    // Fake pipeline client never supplies upstream output paths — the
    // runtimePaths entries for draftJson/critiqueJson stay null, so the
    // critique stage sees a literal `<draft-json>` placeholder and the
    // guard fires before `pipelineClient.run` is reached.
    const seenStages: BridgeStage[] = []
    const client: PipelineClient = {
      async run({ stage }): Promise<StageResult> {
        seenStages.push(stage)
        return {
          stage,
          status: 'success',
          stdout: '',
          stderr: '',
          durationMs: 0,
          error: null,
        }
      },
    }

    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    let captured: UnresolvedStagePlaceholderError | null = null
    try {
      await execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-guard',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      )
    } catch (err) {
      captured = err as UnresolvedStagePlaceholderError
    }

    expect(captured).toBeInstanceOf(UnresolvedStagePlaceholderError)
    expect(captured!.stage).toBe('critique')
    expect(captured!.tokens).toEqual(['<draft-json>'])
    expect(captured!.message).toMatch(/critique/)
    expect(captured!.message).toMatch(/<draft-json>/)
    // Error text must point to the follow-up TQ work per spec non-goals.
    expect(captured!.message).toMatch(/stdout→path wiring/)

    // pipelineClient.run ran for context-fetch + draft but NOT critique.
    expect(seenStages).toEqual(['context-fetch', 'draft'])
    expect(seenStages).not.toContain('critique' as BridgeStage)

    // persist.recordRun was called with status='failed' / failedStage='critique'.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.failedStage).toBe('critique')
    expect(rows[0]!.error).toMatch(/critique/)
    expect(rows[0]!.error).toMatch(/<draft-json>/)
    expect(rows[0]!.runId).toBe('run-guard')

    // The critique stageResult must be present and marked failed — the row
    // surfaces the guard failure alongside the upstream successes.
    const critiqueResult = rows[0]!.stageResults.find(
      (s) => s.stage === 'critique',
    )
    expect(critiqueResult?.status).toBe('failed')
    expect(critiqueResult?.error).toMatch(/critique/)
  })
})

// ---------------------------------------------------------------------------
// execute — stdout→path wiring (Round 6 P1-1)
// ---------------------------------------------------------------------------

/**
 * Build a fake pipeline client whose `run` returns the provided `stdout` for
 * each stage. Records the args it was invoked with so tests can assert that
 * placeholder tokens were resolved to concrete paths before the shell-out.
 */
function makeStdoutFakeClient(stdoutByStage: Partial<Record<BridgeStage, string>>): {
  client: PipelineClient
  calls: Array<{ stage: BridgeStage; args: string[] }>
} {
  const calls: Array<{ stage: BridgeStage; args: string[] }> = []
  const client: PipelineClient = {
    async run({ stage, args }): Promise<StageResult> {
      calls.push({ stage, args })
      return {
        stage,
        status: 'success',
        stdout: stdoutByStage[stage] ?? '',
        stderr: '',
        durationMs: 1,
        error: null,
      }
    },
  }
  return { client, calls }
}

describe('execute (stdout→path wiring, Round 6 P1-1)', () => {
  it('parses draft stdout and resolves <draft-json> into the critique call', async () => {
    // Happy-path slice: context-fetch and draft both emit real
    // "saved to <path>" lines, critique consumes the resolved `<draft-json>`.
    const stdoutByStage: Partial<Record<BridgeStage, string>> = {
      'context-fetch':
        'FreshContextBundle saved to /tmp/factory/research.json (3 contexts).',
      draft: 'Draft saved to /tmp/factory/draft.json.',
      critique: 'Critique saved to /tmp/factory/critique.json.',
      eval: 'Eval bundle saved to /tmp/factory/eval.json.',
    }
    const { client, calls } = makeStdoutFakeClient(stdoutByStage)
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    const result = await execute(
      { proposal: makeProposal() },
      {
        pipelineClient: client,
        approvalGate: { fetchRow: async () => approvedRow() },
        persist,
        intakeWriter: writer,
        runIdFactory: () => 'run-happy',
        now: () => new Date('2026-04-17T12:00:00.000Z'),
      },
    )

    // End-to-end success: the full chain intake → context-fetch → draft →
    // critique → eval completes. media is skipped by default per the plan.
    expect(result.status).toBe('success')
    expect(result.failedStage).toBeNull()
    expect(result.error).toBeNull()

    const criticalCall = calls.find((c) => c.stage === 'critique')!
    // critique arg must be the RESOLVED draft path, NOT `<draft-json>`.
    expect(criticalCall.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:critique',
      '/tmp/factory/draft.json',
    ])
    expect(criticalCall.args).not.toContain('<draft-json>')

    // draft must have received the parsed research-output path as --context.
    const draftCall = calls.find((c) => c.stage === 'draft')!
    expect(draftCall.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:draft',
      intakeYamlPath(rows[0]!.slug),
      '--context',
      '/tmp/factory/research.json',
    ])

    // eval must have received resolved draft + critique paths.
    const evalCall = calls.find((c) => c.stage === 'eval')!
    expect(evalCall.args).toEqual([
      ...PNPM_FILTER_PREFIX,
      'lesson:eval',
      '/tmp/factory/draft.json',
      '/tmp/factory/critique.json',
    ])
    expect(evalCall.args).not.toContain('<draft-json>')
    expect(evalCall.args).not.toContain('<critique-json>')

    // Persisted row reflects the full successful chain.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('success')
    expect(rows[0]!.failedStage).toBeNull()
  })

  it('propagates research-output into draft --context when context-fetch stdout matches', async () => {
    // Slice of the above that isolates the context-fetch → draft hop.
    const { client, calls } = makeStdoutFakeClient({
      'context-fetch':
        'FreshContextBundle saved to /tmp/ctx/bundle.json (5 contexts).',
      draft: 'Draft saved to /tmp/factory/draft.json.',
      critique: 'Critique saved to /tmp/factory/critique.json.',
      eval: 'Eval bundle saved to /tmp/factory/eval.json.',
    })
    const { persist } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await execute(
      { proposal: makeProposal() },
      {
        pipelineClient: client,
        approvalGate: { fetchRow: async () => approvedRow() },
        persist,
        intakeWriter: writer,
        runIdFactory: () => 'run-ctx-to-draft',
        now: () => new Date('2026-04-17T12:00:00.000Z'),
      },
    )

    const draftCall = calls.find((c) => c.stage === 'draft')!
    // --context is preserved and points at the resolved bundle path.
    expect(draftCall.args).toContain('--context')
    const ctxIdx = draftCall.args.indexOf('--context')
    expect(draftCall.args[ctxIdx + 1]).toBe('/tmp/ctx/bundle.json')
  })

  it('throws UnresolvedStagePlaceholderError with stdout fragment when upstream phrasing does not match', async () => {
    // draft emits an unexpected line (e.g. silent success) — critique cannot
    // resolve `<draft-json>` and the guard fires with the clipped stdout
    // fragment surfaced for debugging.
    const weirdStdout = 'something something no saved-to line here'
    const { client, calls } = makeStdoutFakeClient({
      'context-fetch':
        'FreshContextBundle saved to /tmp/ctx/bundle.json (1 contexts).',
      draft: weirdStdout,
    })
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    let captured: UnresolvedStagePlaceholderError | null = null
    try {
      await execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-bad-stdout',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      )
    } catch (err) {
      captured = err as UnresolvedStagePlaceholderError
    }

    expect(captured).toBeInstanceOf(UnresolvedStagePlaceholderError)
    expect(captured!.stage).toBe('critique')
    expect(captured!.tokens).toEqual(['<draft-json>'])
    // Stdout fragment is attached to the error message so debugging is cheap.
    expect(captured!.upstreamStdout).toContain(weirdStdout)
    expect(captured!.message).toMatch(/something something no saved-to line here/)

    // context-fetch + draft ran; critique did NOT.
    const invoked = calls.map((c) => c.stage)
    expect(invoked).toEqual(['context-fetch', 'draft'])
    expect(invoked).not.toContain('critique' as BridgeStage)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.failedStage).toBe('critique')
  })

  it('falls back to missing-placeholder error when context-fetch stdout is silent', async () => {
    // context-fetch returns empty stdout → researchOutput stays null, so the
    // `--context <research-output>` pair is stripped (optional input). draft
    // emits no saved-to line either → draftJson stays null → critique throws.
    // Regression: the existing "--context is optional" behaviour must still
    // hold when stdout parsing yields nothing.
    const { client, calls } = makeStdoutFakeClient({
      'context-fetch': '',
      draft: '',
    })
    const { persist } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    await expect(
      execute(
        { proposal: makeProposal() },
        {
          pipelineClient: client,
          approvalGate: { fetchRow: async () => approvedRow() },
          persist,
          intakeWriter: writer,
          runIdFactory: () => 'run-silent',
          now: () => new Date('2026-04-17T12:00:00.000Z'),
        },
      ),
    ).rejects.toBeInstanceOf(UnresolvedStagePlaceholderError)

    // draft should have been invoked WITHOUT --context (stripped since the
    // research-output placeholder was never resolved).
    const draftCall = calls.find((c) => c.stage === 'draft')!
    expect(draftCall.args).not.toContain('--context')
    expect(draftCall.args).not.toContain('<research-output>')
  })

  it('captures media/eval output paths into runtimePaths via stdout parsing', async () => {
    // Forward-compat: media and eval are terminal today, but the runner still
    // captures their output paths from stdout so bridge run rows have them
    // available. This is a light-touch assertion via the final stdout on the
    // persisted stageResults — both lines should have been preserved intact.
    const { client } = makeStdoutFakeClient({
      'context-fetch':
        'FreshContextBundle saved to /tmp/ctx.json (2 contexts).',
      draft: 'Draft saved to /tmp/draft.json.',
      critique: 'Critique saved to /tmp/critique.json.',
      eval: 'Eval bundle saved to /tmp/eval.json.',
    })
    const { persist, rows } = makeFakePersist()
    const { writer } = makeFakeIntakeWriter()

    const result = await execute(
      { proposal: makeProposal() },
      {
        pipelineClient: client,
        approvalGate: { fetchRow: async () => approvedRow() },
        persist,
        intakeWriter: writer,
        runIdFactory: () => 'run-terminal',
        now: () => new Date('2026-04-17T12:00:00.000Z'),
      },
    )

    expect(result.status).toBe('success')
    // eval's stdout line is preserved on the stage result for downstream
    // consumers (e.g. the bridge run logger) to read the concrete output path.
    const evalStage = rows[0]!.stageResults.find((s) => s.stage === 'eval')
    expect(evalStage?.stdout).toBe('Eval bundle saved to /tmp/eval.json.')
  })
})
