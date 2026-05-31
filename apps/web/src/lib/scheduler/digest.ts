import type { SupabaseClient } from '@supabase/supabase-js'

import type { NightlyDigestRecord } from '@school/flywheel-scheduler'

import { createClient } from '@/lib/supabase/server'

import type { NightlyDigestListItem, NightlyDigestSnapshot } from './types'

type UntypedSupabaseClient = SupabaseClient & {
  from: (table: 'nightly_digest') => UntypedQueryBuilder
}

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  then: PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }>['then']
}

export interface NightlyDigestPageRepository {
  listRecentDigests(limit?: number): Promise<NightlyDigestRecord[]>
}

function asUntypedClient(client: SupabaseClient): UntypedSupabaseClient {
  return client as unknown as UntypedSupabaseClient
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

function normalizeHistogram(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([bucket, count]) => [
      bucket,
      toNumber(count),
    ]),
  )
}

function normalizeDigest(row: Record<string, unknown>): NightlyDigestRecord {
  return {
    digestId: String(row.digest_id ?? ''),
    runDate: String(row.run_date ?? ''),
    status: String(row.status ?? 'failed') as NightlyDigestRecord['status'],
    startedAt: String(row.started_at ?? ''),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    newGapCount: toNumber(row.new_gap_count),
    newProposalCount: toNumber(row.new_proposal_count),
    judgeScoreHistogram: normalizeHistogram(row.judge_score_histogram),
    pendingOwnerReviewCount: toNumber(row.pending_owner_review_count),
    failedStages: Array.isArray(row.failed_stages)
      ? row.failed_stages.map((stage) => String(stage) as NightlyDigestRecord['failedStages'][number])
      : [],
    summary: typeof row.summary === 'string' ? row.summary : null,
  }
}

export function createNightlyDigestPageRepository(
  client: SupabaseClient,
): NightlyDigestPageRepository {
  const supabase = asUntypedClient(client)

  return {
    async listRecentDigests(limit = 7) {
      const { data, error } = await supabase
        .from('nightly_digest')
        .select(
          'digest_id, run_date, status, started_at, finished_at, new_gap_count, new_proposal_count, judge_score_histogram, pending_owner_review_count, failed_stages, summary',
        )
        .order('run_date', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data)
        ? data.map((row) => normalizeDigest(row))
        : []
    },
  }
}

export async function createServerNightlyDigestPageRepository() {
  const client = await createClient()
  return createNightlyDigestPageRepository(client)
}

export async function loadNightlyDigestSnapshot(
  repository: NightlyDigestPageRepository,
): Promise<NightlyDigestSnapshot> {
  const digests = await repository.listRecentDigests(7)

  return {
    digests: [...digests]
      .reverse()
      .map((digest): NightlyDigestListItem => ({
        ...digest,
        pendingApprovalsHref: '/admin/scheduler#pending-approvals',
      })),
  }
}
