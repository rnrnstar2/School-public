'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type { ReviewLessonProposalGateInput } from './actions'
import { reviewLessonProposalGateAction } from './actions'

export type ApprovalInboxItem = {
  gateId: string
  requestedAt: string
  proposalId: string
  capabilitySlug: string | null
  outcomeSlug: string | null
  priority: string | null
  weakestAxis: string | null
  rationale: string | null
  candidateLessonSlug: string | null
  gapIds: string[]
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function ApprovalInboxClient({
  items,
}: {
  items: ApprovalInboxItem[]
}) {
  const router = useRouter()
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const submit = (input: ReviewLessonProposalGateInput) => {
    startTransition(async () => {
      const result = await reviewLessonProposalGateAction(input)
      setMessages((current) => ({
        ...current,
        [input.gateId]: result.message,
      }))

      if (result.ok) {
        router.refresh()
      }
    })
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>承認待ちはありません</CardTitle>
          <CardDescription>
            lesson proposal の pending gate が入るとここに表示されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/dev/journeys"
            className="inline-flex min-h-10 items-center border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Journey Observatory に戻る
          </a>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.gateId} data-testid={`approval-inbox-gate-${item.gateId}`}>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  {item.capabilitySlug ?? '不明な capability'} / {item.outcomeSlug ?? 'general'}
                </CardTitle>
                <CardDescription>
                  受付: {formatDateTime(item.requestedAt)}
                </CardDescription>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                pending
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-950">priority</dt>
                <dd>{item.priority ?? '-'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">weakest axis</dt>
                <dd>{item.weakestAxis ?? '-'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">candidate lesson</dt>
                <dd>{item.candidateLessonSlug ?? '未提案'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">gap ids</dt>
                <dd>{item.gapIds.length > 0 ? item.gapIds.join(', ') : 'なし'}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-semibold text-slate-950">rationale</dt>
                <dd>{item.rationale ?? '未設定'}</dd>
              </div>
            </dl>

            <label className="block space-y-2">
              <span className="font-semibold text-slate-950">却下理由</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-slate-400"
                placeholder="却下時は必須です"
                value={reasons[item.gateId] ?? ''}
                onChange={(event) =>
                  setReasons((current) => ({
                    ...current,
                    [item.gateId]: event.target.value,
                  }))
                }
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isPending}
                onClick={() =>
                  submit({
                    gateId: item.gateId,
                    proposalId: item.proposalId,
                    decision: 'approved',
                  })
                }
              >
                承認する
              </Button>
              <Button
                disabled={isPending}
                variant="destructive"
                onClick={() =>
                  submit({
                    gateId: item.gateId,
                    proposalId: item.proposalId,
                    decision: 'rejected',
                    reason: reasons[item.gateId],
                  })
                }
              >
                却下する
              </Button>
            </div>

            {messages[item.gateId] ? (
              <p className="text-sm text-slate-600">{messages[item.gateId]}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
