import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import { requireOwnerRouteUser } from '@/app/api/admin/atom-versions/_server'
import {
  createServerNightlyDigestPageRepository,
  loadNightlyDigestSnapshot,
} from '@/lib/scheduler/digest'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatHistogram(histogram: Record<string, number>) {
  const entries = Object.entries(histogram)
  if (entries.length === 0) {
    return 'No judge scores recorded'
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, count]) => `${bucket}: ${count}`)
    .join(' / ')
}

export default async function AdminDigestPage() {
  const user = await requireOwnerRouteUser()

  if (!user) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Owner access required</CardTitle>
            <CardDescription>
              The nightly digest is limited to owner reviewers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }

  const repository = await createServerNightlyDigestPageRepository()
  const snapshot = await loadNightlyDigestSnapshot(repository)

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Morning Digest
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">Nightly flywheel digest</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Review the last seven nightly runs, confirm failures from the previous night,
          and jump straight into the pending approval queue.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Last 7 runs</CardTitle>
          <CardDescription>
            Counts reflect only the stages that completed successfully during each run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4" data-testid="nightly-digest-list">
          {snapshot.digests.length === 0 ? (
            <p
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
              data-testid="nightly-digest-empty"
            >
              No nightly digests have been recorded yet.
            </p>
          ) : (
            snapshot.digests.map((digest) => (
              <article
                key={digest.digestId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                data-testid={`nightly-digest-${digest.digestId}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-950">{digest.runDate}</h2>
                    <p className="text-sm text-slate-600">
                      {digest.status} · started {formatDate(digest.startedAt)} · finished{' '}
                      {formatDate(digest.finishedAt)}
                    </p>
                  </div>
                  <Link
                    className="inline-flex w-fit items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    href={digest.pendingApprovalsHref}
                  >
                    Pending approvals ({digest.pendingOwnerReviewCount})
                  </Link>
                </div>

                <dl className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="font-semibold text-slate-900">New gaps</dt>
                    <dd>{digest.newGapCount}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">New proposals</dt>
                    <dd>{digest.newProposalCount}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-semibold text-slate-900">Judge histogram</dt>
                    <dd>{formatHistogram(digest.judgeScoreHistogram)}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-semibold text-slate-900">Failed stages</dt>
                    <dd>
                      {digest.failedStages.length === 0
                        ? 'None'
                        : digest.failedStages.join(', ')}
                    </dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-semibold text-slate-900">Summary</dt>
                    <dd>{digest.summary ?? 'No summary recorded.'}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
