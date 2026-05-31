'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type {
  ReviewSchedulerDecisionHandler,
  SchedulerDecisionRecord,
} from '@/lib/scheduler/types'

function formatDate(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function badgeClass(ownerApproval: SchedulerDecisionRecord['ownerApproval']) {
  switch (ownerApproval) {
    case 'approved':
    case 'auto':
      return 'bg-emerald-100 text-emerald-700'
    case 'blocked':
    case 'rejected':
      return 'bg-rose-100 text-rose-700'
    case 'pending_owner_review':
    default:
      return 'bg-amber-100 text-amber-800'
  }
}

export function PendingApprovalsPanel({
  items,
  reviewAction,
}: {
  items: SchedulerDecisionRecord[]
  reviewAction: ReviewSchedulerDecisionHandler
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const pendingIds = useMemo(() => new Set(items.map((item) => item.id)), [items])

  const submit = (proposalId: string, decision: 'approved' | 'rejected') => {
    startTransition(async () => {
      const result = await reviewAction({
        proposalId,
        decision,
        reason: reasons[proposalId],
      })

      setMessages((current) => ({
        ...current,
        [proposalId]: result.message,
      }))

      if (result.ok) {
        router.refresh()
      }
    })
  }

  if (items.length === 0) {
    return (
      <Card data-testid="scheduler-pending-empty">
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>No decisions are waiting on owner review.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4" data-testid="scheduler-pending-list">
      {items.map((item) => (
        <Card key={item.id} data-testid={`pending-approval-${item.id}`}>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-lg">
                  {item.capabilitySlug} / {item.outcomeSlug}
                </CardTitle>
                <CardDescription>
                  {item.actionClass} · {item.priority} priority · {item.schedulerJobName ?? 'manual'}
                </CardDescription>
              </div>
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(
                  item.ownerApproval,
                )}`}
              >
                {item.ownerApproval}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-900">Proposed</dt>
                <dd>{formatDate(item.proposedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Candidate lesson</dt>
                <dd>{item.candidateLessonSlug ?? '-'}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-semibold text-slate-900">Rationale</dt>
                <dd>{item.rationale ?? 'No rationale supplied.'}</dd>
              </div>
            </dl>

            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-slate-900">Reason for rejection</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none ring-0 transition focus:border-slate-400"
                placeholder="Required only when rejecting"
                value={reasons[item.id] ?? ''}
                onChange={(event) =>
                  setReasons((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isPending || !pendingIds.has(item.id)}
                onClick={() => submit(item.id, 'approved')}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                disabled={isPending || !pendingIds.has(item.id)}
                onClick={() => submit(item.id, 'rejected')}
              >
                Reject
              </Button>
            </div>

            {messages[item.id] ? (
              <p className="text-sm text-slate-600">{messages[item.id]}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
