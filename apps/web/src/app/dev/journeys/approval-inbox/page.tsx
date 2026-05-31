import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from '@school/ui'

import {
  OwnerAppMetadataRoleRequiredError,
  requireOwnerRouteUser,
} from '@/app/api/admin/atom-versions/_server'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

import {
  ApprovalInboxClient,
  type ApprovalInboxItem,
} from './ApprovalInboxClient'

export const dynamic = 'force-dynamic'

function extractProposalId(metadata: unknown) {
  if (
    metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && typeof (metadata as Record<string, unknown>).lesson_dev_proposal_id === 'string'
  ) {
    return (metadata as Record<string, unknown>).lesson_dev_proposal_id as string
  }

  return null
}

type OwnerPendingLessonProposalRow =
  Database['decision_ledger']['Views']['v_owner_pending_lesson_proposals']['Row']

function normalizeApprovalInboxItem(
  row: OwnerPendingLessonProposalRow,
): ApprovalInboxItem | null {
  const gateId = row.gate_id
  const proposalId = row.proposal_id ?? extractProposalId(row.gate_metadata)
  const requestedAt = row.requested_at

  if (!gateId || !proposalId || !requestedAt) {
    return null
  }

  return {
    gateId,
    requestedAt,
    proposalId,
    capabilitySlug: row.capability_slug,
    outcomeSlug: row.outcome_slug,
    priority: row.priority,
    weakestAxis: row.weakest_axis,
    rationale: row.rationale,
    candidateLessonSlug: row.candidate_lesson_slug,
    gapIds: row.gap_ids ?? [],
  } satisfies ApprovalInboxItem
}

async function loadApprovalInboxItems(): Promise<ApprovalInboxItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('decision_ledger')
    .from('v_owner_pending_lesson_proposals')
    .select('*')
    .order('requested_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .map((row) => normalizeApprovalInboxItem(row))
    .filter((item): item is ApprovalInboxItem => item !== null)
}

function renderAccessCard(title: string, description: string) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </section>
  )
}

export default async function ApprovalInboxPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  try {
    const owner = await requireOwnerRouteUser({
      requireAppMetadataRole: true,
    })

    if (!owner) {
      return renderAccessCard(
        'owner 権限が必要です',
        'lesson proposal の承認 inbox は owner のみ閲覧できます。',
      )
    }
  } catch (error) {
    if (error instanceof OwnerAppMetadataRoleRequiredError) {
      return renderAccessCard(
        'approval inbox を表示できません',
        'RLS app_metadata 要件を満たしていないため inbox を表示できません。owner の場合は管理者に連絡してください。',
      )
    }

    throw error
  }

  const items = await loadApprovalInboxItems()

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Goal2Action / Owner Inbox
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          lesson proposal 承認 inbox
        </h1>
        <p className="max-w-3xl text-sm text-slate-600">
          gap loop が作成した lesson proposal gate をここで承認または却下します。
          publish / stable への昇格はこの画面では扱いません。
        </p>
        <Link
          href="/dev/journeys"
          className="inline-flex min-h-10 items-center border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Journey Observatory に戻る
        </Link>
      </header>

      <ApprovalInboxClient items={items} />
    </section>
  )
}
