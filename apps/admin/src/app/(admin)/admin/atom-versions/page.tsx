import Link from 'next/link'
import { GitCompareArrows, Layers3 } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { formatDate } from '@/lib/format'

import {
  fetchAtomVersions,
  type AdminAtomVersionListItem,
  type AdminAtomVersionStatus,
} from './api'

const STATUS_TABS = [
  'draft',
  'reviewed',
  'experimental',
  'stable',
  'archived',
  'all',
] as const

function isStatusTab(value: string | undefined): value is AdminAtomVersionStatus | 'all' {
  return value ? STATUS_TABS.includes(value as (typeof STATUS_TABS)[number]) : false
}

function buildTabHref(status: (typeof STATUS_TABS)[number], atomId: string) {
  const searchParams = new URLSearchParams()
  searchParams.set('status', status)

  if (atomId) {
    searchParams.set('atom_id', atomId)
  }

  return `/admin/atom-versions?${searchParams.toString()}`
}

function StatusBadge({ status }: { status: AdminAtomVersionListItem['status'] }) {
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

export default async function AtomVersionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const requestedStatus = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status
  const requestedAtomId = Array.isArray(resolvedSearchParams.atom_id)
    ? resolvedSearchParams.atom_id[0]
    : resolvedSearchParams.atom_id
  const activeStatus = isStatusTab(requestedStatus) ? requestedStatus : 'all'
  const atomIdFilter = requestedAtomId?.trim() ?? ''

  const versions = await fetchAtomVersions({
    status: activeStatus,
    atomId: atomIdFilter || undefined,
    limit: 80,
  })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Lesson Model"
        title="Atom Versions"
        description="Review synced atom versions, compare against the current active revision, and promote only by explicit owner action."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <Layers3 className="h-5 w-5 text-cyan-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{versions.length}</p>
          <p className="mt-1 text-sm text-slate-600">Versions in this filter</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <GitCompareArrows className="h-5 w-5 text-emerald-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {versions.filter((version) => version.is_current).length}
          </p>
          <p className="mt-1 text-sm text-slate-600">Currently active</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current filter
          </p>
          <p className="mt-4 text-2xl font-semibold text-slate-950">{activeStatus}</p>
          <p className="mt-1 text-sm text-slate-600">
            {atomIdFilter ? `atom_id = ${atomIdFilter}` : 'All atoms'}
          </p>
        </article>
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((status) => {
            const isActive = status === activeStatus
            return (
              <Link
                key={status}
                href={buildTabHref(status, atomIdFilter)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-300 text-slate-700 hover:border-slate-950 hover:text-slate-950'
                }`}
              >
                {status}
              </Link>
            )
          })}
        </div>

        <form className="mt-4 flex flex-col gap-3 md:flex-row" action="/admin/atom-versions">
          <input type="hidden" name="status" value={activeStatus} />
          <input
            type="text"
            name="atom_id"
            defaultValue={atomIdFilter}
            placeholder="Filter by atom_id"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
          />
          <button
            type="submit"
            className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            Apply
          </button>
          {atomIdFilter ? (
            <Link
              href={buildTabHref(activeStatus, '')}
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {versions.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No atom versions found</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Synced versions will appear here after lesson sync writes into
            {' '}
            <code>lesson_atom_versions</code>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {['Atom', 'Title', 'Status', 'Imported', 'Current'].map((column) => (
                    <th
                      key={column}
                      className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {versions.map((version) => (
                  <tr key={version.version_id} className="align-top hover:bg-slate-50/80">
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <Link
                        href={`/admin/atom-versions/${version.version_id}`}
                        className="block space-y-1"
                      >
                        <p className="font-semibold text-slate-900">{version.atom_id}</p>
                        <p className="text-xs text-slate-500">{version.atom.source_path}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <Link
                        href={`/admin/atom-versions/${version.version_id}`}
                        className="block space-y-1"
                      >
                        <p className="font-semibold text-slate-900">
                          {version.title ?? 'Untitled atom'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Current active:
                          {' '}
                          {version.current_active_version?.title ?? 'None'}
                        </p>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <Link href={`/admin/atom-versions/${version.version_id}`} className="block">
                        <StatusBadge status={version.status} />
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <Link
                        href={`/admin/atom-versions/${version.version_id}`}
                        className="block space-y-1"
                      >
                        <p>{formatDate(version.imported_at)}</p>
                        <p className="text-xs text-slate-500">{version.imported_by}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <Link href={`/admin/atom-versions/${version.version_id}`} className="block">
                        {version.is_current ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Current
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            Historical
                          </span>
                        )}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
