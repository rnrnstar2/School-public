import Link from 'next/link'
import { ArrowLeft, GitCompareArrows } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { formatDate } from '@/lib/format'

import { fetchAtomVersionDetail } from '../api'
import { AtomVersionActions } from './atom-version-actions'

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'stable'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'experimental'
        ? 'bg-cyan-100 text-cyan-700'
        : status === 'reviewed'
          ? 'bg-amber-100 text-amber-700'
          : status === 'archived'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  )
}

export default async function AtomVersionDetailPage({
  params,
}: {
  params: Promise<{ versionId: string }>
}) {
  const { versionId } = await params
  const detail = await fetchAtomVersionDetail(versionId)
  const comparisonTitle =
    detail.comparison_basis === 'current_active'
      ? 'Diff vs current active'
      : detail.comparison_basis === 'previous_active'
        ? 'Diff vs previous active'
        : 'Diff unavailable'

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Lesson Model"
        title={detail.title ?? detail.atom.atom_id}
        description="Inspect the imported atom payload, compare it against the current active baseline, and execute explicit publish-state transitions."
        actions={
          <Link
            href="/admin/atom-versions"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Atom
          </p>
          <p className="mt-4 text-xl font-semibold text-slate-950">{detail.atom.atom_id}</p>
          <p className="mt-1 text-sm text-slate-600">{detail.atom.source_path}</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Version
          </p>
          <p className="mt-4 text-xl font-semibold text-slate-950">{detail.version.version_id}</p>
          <p className="mt-1 text-sm text-slate-600">Imported {formatDate(detail.version.imported_at)}</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Status
          </p>
          <div className="mt-4">
            <StatusBadge status={detail.version.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Current active:
            {' '}
            {detail.current_active_version?.version_id ?? 'None'}
          </p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <GitCompareArrows className="h-5 w-5 text-emerald-700" />
          <p className="mt-4 text-xl font-semibold text-slate-950">
            {detail.comparison_version?.version_id ?? 'n/a'}
          </p>
          <p className="mt-1 text-sm text-slate-600">{comparisonTitle}</p>
        </article>
      </div>

      <AtomVersionActions
        versionId={detail.version.version_id}
        currentStatus={detail.version.status}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Selected version
            </p>
            <h2 className="text-xl font-semibold text-slate-950">
              {detail.title ?? detail.atom.atom_id}
            </h2>
            <p className="text-sm text-slate-600">
              Imported by
              {' '}
              {detail.version.imported_by}
              {' '}
              on
              {' '}
              {formatDate(detail.version.imported_at)}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">yaml_content</p>
              <pre className="mt-2 max-h-[360px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(detail.version.yaml_content, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">body_markdown</p>
              <pre className="mt-2 max-h-[360px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
                {detail.version.body_markdown ?? 'No markdown body'}
              </pre>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">metadata</p>
              <pre className="mt-2 max-h-[240px] overflow-auto rounded-2xl bg-slate-100 p-4 text-xs leading-6 text-slate-700">
                {JSON.stringify(detail.version.metadata, null, 2)}
              </pre>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {comparisonTitle}
            </p>
            <h2 className="text-xl font-semibold text-slate-950">
              {detail.comparison_version?.title ?? 'No comparison baseline'}
            </h2>
            <p className="text-sm text-slate-600">
              Current active version:
              {' '}
              {detail.current_active_version?.version_id ?? 'None'}
            </p>
          </div>

          <pre className="max-h-[960px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
            {detail.diff_text}
          </pre>
        </section>
      </div>
    </div>
  )
}
