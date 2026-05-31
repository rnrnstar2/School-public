import type { JsonValue, OwnerApprovalState, ProposalActionClass } from '../types'

export interface PrWorkerRequest {
  proposalId: string
  capabilitySlug: string
  outcomeSlug: string
  ownerApproval: Extract<OwnerApprovalState, 'auto' | 'approved'>
  actionClass: ProposalActionClass
  requestedBy: string
  metadata?: Record<string, JsonValue | undefined>
}

export interface PrWorkerResult {
  accepted: boolean
  jobId: string | null
  note: string
}

export interface PrWorker {
  triggerApprovedProposal(request: PrWorkerRequest): Promise<PrWorkerResult>
}

export class MockPrWorker implements PrWorker {
  readonly calls: PrWorkerRequest[] = []

  constructor(
    private readonly responder: (request: PrWorkerRequest) => PrWorkerResult = (
      request,
    ) => ({
      accepted: true,
      jobId: `mock-pr-${request.proposalId}`,
      note: 'mock worker accepted proposal',
    }),
  ) {}

  async triggerApprovedProposal(request: PrWorkerRequest): Promise<PrWorkerResult> {
    this.calls.push(request)
    return this.responder(request)
  }
}

type DynamicImporter = (specifier: string) => Promise<Record<string, unknown>>

const dynamicImport: DynamicImporter = new Function(
  'specifier',
  'return import(specifier)',
) as DynamicImporter

export class RealPrWorker implements PrWorker {
  async triggerApprovedProposal(request: PrWorkerRequest): Promise<PrWorkerResult> {
    const module = await dynamicImport('@school/ai-pr-worker').catch((error) => {
      throw new Error(
        `Unable to load @school/ai-pr-worker. Wire this in G2A-012. ${String(error)}`,
      )
    })

    const enqueue = module['enqueueApprovedProposal']
    if (typeof enqueue !== 'function') {
      throw new Error(
        'TODO(G2A-012): @school/ai-pr-worker must export enqueueApprovedProposal(request).',
      )
    }

    const result = await (
      enqueue as (payload: PrWorkerRequest) => Promise<PrWorkerResult | void>
    )(request)

    return (
      result ?? {
        accepted: true,
        jobId: null,
        note: 'ai-pr-worker returned no job id',
      }
    )
  }
}
