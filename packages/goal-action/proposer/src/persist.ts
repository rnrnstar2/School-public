import type { LessonDevProposal } from './schema'

// ---------------------------------------------------------------------------
// Types mirroring the decision-ledger repository layer
// ---------------------------------------------------------------------------

export type LessonDevProposalPersistRow = {
  id: string
  capability_slug: string
  outcome_slug: string
  priority: string
  status: string
  gap_ids: string[]
  weakest_axis: string
  evidence: unknown
  candidate_lesson_slug: string | null
  rationale: string | null
  proposed_by: string
  proposed_at: string
  updated_at: string
  metadata: unknown
}

export type LessonDevProposalPersistInsert = Omit<
  LessonDevProposalPersistRow,
  'id' | 'updated_at'
> & {
  id?: string
  updated_at?: string
}

type PersistResult<TRow> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>

type ProposalTableClient = {
  upsert: (
    input: LessonDevProposalPersistInsert,
    options: { onConflict: string },
  ) => {
    select: () => {
      single: () => PersistResult<LessonDevProposalPersistRow>
    }
  }
}

export type LessonDevProposalPersistClient = {
  schema: (schema: 'decision_ledger') => {
    from: (table: 'lesson_dev_proposals') => ProposalTableClient
  }
}

export type PersistProposalsResult = {
  data: LessonDevProposalPersistRow[] | null
  error: string | null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return 'Unknown persistence error'
}

function toInsertRow(
  proposal: LessonDevProposal,
): LessonDevProposalPersistInsert {
  return {
    capability_slug: proposal.capabilitySlug,
    outcome_slug: proposal.outcomeSlug,
    priority: proposal.priority,
    status: proposal.status,
    gap_ids: proposal.gapIds,
    weakest_axis: proposal.weakestAxis,
    evidence: proposal.evidence,
    candidate_lesson_slug: proposal.candidateLessonSlug,
    rationale: proposal.rationale,
    proposed_by: proposal.proposedBy,
    proposed_at: proposal.proposedAt,
    metadata: proposal.metadata,
  }
}

/**
 * Persist proposals to decision_ledger.lesson_dev_proposals via
 * atomic upsert (onConflict: capability_slug,outcome_slug).
 */
export async function persistProposals(
  proposals: LessonDevProposal[],
  client: LessonDevProposalPersistClient,
): Promise<PersistProposalsResult> {
  try {
    const table = client
      .schema('decision_ledger')
      .from('lesson_dev_proposals')
    const rows: LessonDevProposalPersistRow[] = []

    for (const proposal of proposals) {
      const { data, error } = await table
        .upsert(toInsertRow(proposal), {
          onConflict: 'capability_slug,outcome_slug',
        })
        .select()
        .single()

      if (error) throw error
      if (!data) {
        throw new Error(
          `persistProposals returned no row for ${proposal.capabilitySlug}/${proposal.outcomeSlug}`,
        )
      }

      rows.push(data)
    }

    return { data: rows, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}
