import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Mail, MessageSquare } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { acknowledgeImprovementProposalAction } from '@/lib/actions'
import {
  getImprovementProposalById,
  getImprovementProposals,
} from '@/lib/admin-data'
import { formatDate } from '@/lib/format'
import {
  buildFindingDetailHref,
  buildImprovementProposalHref,
  resolveImprovementProposalFilter,
  selectImprovementProposalId,
} from '@/lib/improvement-proposals'

const FILTERS = [
  { value: 'all', label: 'All reports' },
  { value: 'unacknowledged', label: 'Unacknowledged' },
  { value: 'acknowledged', label: 'Acknowledged' },
] as const

export default async function ImprovementProposalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const requestedStatus = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status
  const requestedProposalId = Array.isArray(resolvedSearchParams.proposal)
    ? resolvedSearchParams.proposal[0]
    : resolvedSearchParams.proposal
  const filter = resolveImprovementProposalFilter(requestedStatus)

  const proposals = await getImprovementProposals(filter)
  const activeProposalId = selectImprovementProposalId(proposals, requestedProposalId)
  const activeProposal = activeProposalId
    ? await getImprovementProposalById(activeProposalId)
    : null

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Improvement Loop"
        title="Improvement proposals"
        description="Read-only nightly proposal reports built from confusion, freshness, and capability-gap miners. This surface acknowledges reports but does not edit lesson content."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{proposals.length}</p>
          <p className="mt-1 text-sm text-slate-600">Reports in this filter</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {proposals.filter((proposal) => !proposal.acknowledged).length}
          </p>
          <p className="mt-1 text-sm text-slate-600">Need acknowledgement</p>
        </article>
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current filter
          </p>
          <p className="mt-4 text-2xl font-semibold capitalize text-slate-950">{filter}</p>
          <p className="mt-1 text-sm text-slate-600">
            Latest report appears on the right when available.
          </p>
        </article>
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filterOption) => {
            const href = buildImprovementProposalHref({
              filter: filterOption.value,
              proposalId: activeProposalId,
            })
            const isActive = filterOption.value === filter

            return (
              <Link
                key={filterOption.value}
                href={href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-300 text-slate-700 hover:border-slate-950 hover:text-slate-950'
                }`}
              >
                {filterOption.label}
              </Link>
            )
          })}
        </div>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No improvement proposals yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Nightly rule-based reports will appear here after the improvement loop writes into
            {' '}
            <code>improvement_proposals</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Latest reports</h2>
              <p className="mt-1 text-sm text-slate-600">
                Select a report to inspect the markdown and linked findings.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {proposals.map((proposal) => {
                const href = buildImprovementProposalHref({
                  filter,
                  proposalId: proposal.proposal_id,
                })
                const isActive = proposal.proposal_id === activeProposalId

                return (
                  <Link
                    key={proposal.proposal_id}
                    href={href}
                    className={`block px-5 py-4 transition ${
                      isActive ? 'bg-cyan-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">{proposal.summary}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          {formatDate(proposal.generated_at)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          proposal.acknowledged
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {proposal.acknowledged ? 'Acknowledged' : 'Open'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{proposal.finding_count} findings</span>
                      {proposal.delivery_channel === 'email' ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          Email
                        </span>
                      ) : proposal.delivery_channel === 'discord' ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Discord
                        </span>
                      ) : (
                        <span>Stored in DB</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </aside>

          <section className="space-y-6 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
            {activeProposal ? (
              <>
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                      Proposal Detail
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                      {activeProposal.summary}
                    </h2>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      <span>Generated {formatDate(activeProposal.generated_at)}</span>
                      <span>
                        Delivery:
                        {' '}
                        {activeProposal.delivery_channel ?? 'db-only'}
                      </span>
                      <span>{activeProposal.finding_count} linked findings</span>
                    </div>
                  </div>
                  {!activeProposal.acknowledged ? (
                    <form action={acknowledgeImprovementProposalAction}>
                      <input type="hidden" name="proposal_id" value={activeProposal.proposal_id} />
                      <button
                        type="submit"
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Mark acknowledged
                      </button>
                    </form>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                      Acknowledged
                    </span>
                  )}
                </div>

                <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                    {activeProposal.detailed_markdown}
                  </pre>
                </article>

                <div className="space-y-4 border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-950">Linked findings</h3>
                  <div className="grid gap-3">
                    {activeProposal.findings.map((finding) => {
                      const detailHref = buildFindingDetailHref(finding)
                      const subject = finding.atom_id ?? finding.capability ?? 'n/a'

                      return (
                        <div
                          key={finding.finding_id}
                          className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-slate-900">
                              {finding.finding_type}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                finding.severity === 'high'
                                  ? 'bg-rose-100 text-rose-700'
                                  : finding.severity === 'medium'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {finding.severity}
                            </span>
                            <span className="text-slate-500">{subject}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                            {detailHref ? (
                              <Link href={detailHref} className="font-medium text-cyan-700 hover:text-cyan-900">
                                Open source record
                              </Link>
                            ) : (
                              <span>No source record link</span>
                            )}
                            {finding.persona_id ? <span>Persona: {finding.persona_id}</span> : null}
                            {finding.atom_id ? <span>Atom: {finding.atom_id}</span> : null}
                            {finding.capability ? <span>Capability: {finding.capability}</span> : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                <h2 className="text-lg font-semibold text-slate-900">Select a proposal</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                  Choose a report from the list to review the markdown detail and acknowledgement state.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
