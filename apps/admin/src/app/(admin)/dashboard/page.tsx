import Link from 'next/link'

import { MetricGrid } from '@/components/admin/metric-grid'
import { PageHeader } from '@/components/admin/page-header'
import { PrimaryLink } from '@/components/admin/primary-link'
import { getDashboardData } from '@/lib/admin-data'
import { formatDate } from '@/lib/format'

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

async function loadDashboardData() {
  try {
    return await getDashboardData()
  } catch (err) {
    console.error(
      'Failed to load dashboard data',
      err instanceof Error ? err.stack : err,
    )
    throw err
  }
}

export default async function DashboardPage() {
  const { stats, latestAtoms } = await loadDashboardData()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Atom operations at a glance"
        description="Monitor the atom-based content model and jump directly into the latest synced records."
        actions={
          <>
            <PrimaryLink href="/admin/atoms">Browse atoms</PrimaryLink>
            <PrimaryLink href="/admin/atom-versions">Version history</PrimaryLink>
          </>
        }
      />

      <MetricGrid
        items={[
          {
            label: 'Atoms',
            value: String(stats.atoms),
            detail: 'Current atom definitions with a published version.',
            icon: 'atoms',
            accent: 'bg-cyan-100 text-cyan-700',
          },
          {
            label: 'Versions',
            value: String(stats.versions),
            detail: 'Historical atom version snapshots.',
            icon: 'versions',
            accent: 'bg-emerald-100 text-emerald-700',
          },
          {
            label: 'Personas',
            value: String(stats.personas),
            detail: 'Learner personas used for plan compilation.',
            icon: 'personas',
            accent: 'bg-amber-100 text-amber-700',
          },
          {
            label: 'Anchors',
            value: String(stats.anchors),
            detail: 'Anchor flows wiring personas to atom sequences.',
            icon: 'anchors',
            accent: 'bg-rose-100 text-rose-700',
          },
        ]}
      />

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Recently updated atoms</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Latest atom records with their current active version status.
            </p>
          </div>
          <Link
            href="/admin/atom-versions"
            className="text-sm font-semibold text-cyan-700 transition hover:text-cyan-900"
          >
            View all versions
          </Link>
        </div>

        {latestAtoms.length === 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-slate-900">No atoms available yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
              Atom records will appear here once the sync pipeline writes current versions into
              {' '}
              <code>lesson_atoms</code>.
            </p>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-[1.5rem] border border-slate-200">
            {latestAtoms.map((atom) => (
              <Link
                key={atom.atomId}
                href={`/admin/atom-versions?atom_id=${encodeURIComponent(atom.atomId)}`}
                className="flex flex-col gap-4 bg-white px-5 py-4 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{atom.title}</p>
                  <p className="text-sm text-slate-600">{atom.atomId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <StatusBadge status={atom.status} />
                  <span>Updated {formatDate(atom.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
