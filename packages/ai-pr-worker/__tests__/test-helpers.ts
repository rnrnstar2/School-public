import type {
  AiPrWorkerRunInsert,
  AiPrWorkerRunRow,
  AiPrWorkerRunUpdate,
  ProposedActionRow,
  WorkerBacklink,
} from '../src/schema.js'
import { mergeActionMetadata, type AiPrWorkerRepository } from '../src/repository.js'

export const ACTION_ID = '11111111-1111-4111-8111-111111111111'
export const GOAL_ID = '22222222-2222-4222-8222-222222222222'

export function makeAction(
  overrides: Partial<ProposedActionRow> = {},
): ProposedActionRow {
  return {
    id: ACTION_ID,
    goal_id: GOAL_ID,
    node_id: null,
    title: 'Implement AI PR worker test fixture',
    description: 'Touch the fixture repository and open a pull request.',
    action_type: 'pr',
    priority: 'P1',
    status: 'approved',
    owner_approval: 'approved',
    rationale: 'Needed for deterministic integration coverage',
    estimated_effort_hours: 1,
    metadata: {
      scope: 'tests',
    },
    proposed_by: 'ai',
    proposed_at: '2026-04-17T12:00:00.000Z',
    updated_at: '2026-04-17T12:00:00.000Z',
    ...overrides,
  }
}

export class MemoryRepository implements AiPrWorkerRepository {
  readonly runs: AiPrWorkerRunRow[] = []
  readonly backlinks: WorkerBacklink[] = []

  private loadIndex = 0
  private backlinkMetadata: unknown = null
  private claimQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly actionSequence: ProposedActionRow[] = [],
    private readonly activeRuns: number = 0,
  ) {}

  async loadAction(): Promise<ProposedActionRow> {
    if (this.actionSequence.length === 0) {
      return makeAction()
    }
    const index = Math.min(this.loadIndex, this.actionSequence.length - 1)
    this.loadIndex += 1
    return structuredClone(this.actionSequence[index]!)
  }

  async claimRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow> {
    const claimOperation = async (): Promise<AiPrWorkerRunRow> => {
      const activeRunCount =
        this.activeRuns +
        this.runs.filter(
          (run) =>
            run.status === 'running' || run.status === 'pending_owner_approval',
        ).length

      const status =
        (input.status === 'running' || input.status === 'pending_owner_approval') &&
        activeRunCount >= 3
          ? 'rate_limited'
          : input.status

      return this.createRun({
        ...input,
        status,
        finishedAt:
          status === 'rate_limited' ? input.startedAt : input.finishedAt,
        errorLog:
          status === 'rate_limited'
            ? 'AI PR worker rate limit exceeded for the current hour'
            : input.errorLog,
      })
    }

    const pending = this.claimQueue.then(claimOperation)
    this.claimQueue = pending.then(
      () => undefined,
      () => undefined,
    )

    return pending
  }

  async createRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow> {
    const row: AiPrWorkerRunRow = {
      run_id: `run-${this.runs.length + 1}`,
      action_id: input.actionId,
      status: input.status,
      branch_name: input.branchName,
      pr_url: input.prUrl,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      error_log: input.errorLog,
      codex_session_id: input.codexSessionId,
      worker_subject: input.workerSubject ?? 'worker-subject',
      metadata: input.metadata ?? {},
    }
    this.runs.push(row)
    return structuredClone(row)
  }

  async updateRun(
    runId: string,
    patch: AiPrWorkerRunUpdate,
  ): Promise<AiPrWorkerRunRow> {
    const current = this.runs.find((run) => run.run_id === runId)
    if (!current) {
      throw new Error(`Unknown run id: ${runId}`)
    }

    if (patch.status !== undefined) current.status = patch.status
    if (patch.branchName !== undefined) current.branch_name = patch.branchName
    if (patch.prUrl !== undefined) current.pr_url = patch.prUrl
    if (patch.finishedAt !== undefined) current.finished_at = patch.finishedAt
    if (patch.errorLog !== undefined) current.error_log = patch.errorLog
    if (patch.codexSessionId !== undefined) {
      current.codex_session_id = patch.codexSessionId
    }
    if (patch.metadata !== undefined) current.metadata = patch.metadata

    return structuredClone(current)
  }

  async updateActionBacklink(
    _actionId: string,
    backlink: WorkerBacklink,
  ): Promise<void> {
    this.backlinks.push(backlink)
    const latest =
      this.actionSequence[this.actionSequence.length - 1]?.metadata ?? {}
    this.backlinkMetadata = mergeActionMetadata(latest, backlink)
  }

  get mergedBacklinkMetadata(): unknown {
    return this.backlinkMetadata
  }
}
