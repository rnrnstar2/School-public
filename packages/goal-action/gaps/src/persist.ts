import { z } from 'zod/v4'

import { LessonGapSchema, type LessonGap } from './schema'

const PersistGapsInputSchema = z.array(LessonGapSchema)

type PersistResult<TRow> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>

export type LessonGapPersistRow = {
  id: string
  action_id: string
  goal_id: string | null
  weakest_axis: LessonGap['weakestAxis']
  score: number
  capability_score: number
  prerequisite_score: number
  blocker_score: number
  evidence_score: number
  evidence: LessonGap['evidence']
  top_mappings: LessonGap['topMappings']
  status: LessonGap['status']
  detected_at: string
  updated_at: string
  metadata: LessonGap['metadata']
}

export type LessonGapPersistInsert = Omit<LessonGapPersistRow, 'id'> & {
  id?: string
}

type LessonGapTableClient = {
  upsert: (
    input: LessonGapPersistInsert,
    options: { onConflict: string },
  ) => {
    select: () => {
      single: () => PersistResult<LessonGapPersistRow>
    }
  }
}

export type LessonGapPersistClient = {
  schema: (schema: 'decision_ledger') => {
    from: (table: 'lesson_gaps') => LessonGapTableClient
  }
}

export type PersistGapsResult = {
  data: LessonGapPersistRow[] | null
  error: string | null
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown persistence error'
}

function toInsertRow(gap: LessonGap): LessonGapPersistInsert {
  return {
    action_id: gap.actionId,
    goal_id: gap.goalId,
    weakest_axis: gap.weakestAxis,
    score: gap.score,
    capability_score: gap.capabilityScore,
    prerequisite_score: gap.prerequisiteScore,
    blocker_score: gap.blockerScore,
    evidence_score: gap.evidenceScore,
    evidence: gap.evidence,
    top_mappings: gap.topMappings,
    status: gap.status,
    detected_at: gap.detectedAt,
    updated_at: gap.updatedAt,
    metadata: gap.metadata,
  }
}

async function persistGap(
  table: LessonGapTableClient,
  gap: LessonGap,
): PersistResult<LessonGapPersistRow> {
  return table
    .upsert(toInsertRow(gap), { onConflict: 'action_id,goal_id' })
    .select()
    .single()
}

export async function persistGaps(
  gaps: LessonGap[],
  client: LessonGapPersistClient,
): Promise<PersistGapsResult> {
  try {
    const parsed = PersistGapsInputSchema.parse(gaps)
    const table = client.schema('decision_ledger').from('lesson_gaps')
    const rows: LessonGapPersistRow[] = []

    for (const gap of parsed) {
      const { data, error } = await persistGap(table, gap)
      if (error) {
        throw error
      }
      if (!data) {
        throw new Error(
          `persistGaps returned no row for action ${gap.actionId}`,
        )
      }

      rows.push(data)
    }

    return { data: rows, error: null }
  } catch (error) {
    return { data: null, error: toErrorMessage(error) }
  }
}
