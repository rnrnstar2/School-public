'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { JourneyManifest, JourneyNode, JourneyPersona } from './parse-manifest'

export interface DashboardJourneyReport {
  personaId: string
  personaName?: string
  project?: string
  spec: string
  steps: number
  durationMs: number
  aiFrictionEvents: number
  criteriaViolations: string[]
  source: string
}

interface JourneysClientProps {
  manifest: JourneyManifest | null
  manifestError: string | null
  mermaidCode: string | null
  hasPlaywrightReport: boolean
  journeyReports: DashboardJourneyReport[]
}

type MermaidApi = {
  initialize(config: Record<string, unknown>): void
  render(id: string, code: string): Promise<{ svg: string }>
}

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  deprecated: 'border-slate-200 bg-slate-100 text-slate-600',
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function getPersonaLabel(personas: JourneyPersona[], personaId: string) {
  return personas.find((persona) => persona.id === personaId)?.name ?? personaId
}

function matchesPersona(report: DashboardJourneyReport, personaId: string) {
  return report.personaId === personaId || report.project === personaId
}

function ReportPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
      {children}
    </div>
  )
}

export function JourneysClient({
  manifest,
  manifestError,
  mermaidCode,
  hasPlaywrightReport,
  journeyReports,
}: JourneysClientProps) {
  const [selectedPersona, setSelectedPersona] = useState('all')
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null)
  const [mermaidError, setMermaidError] = useState<string | null>(null)
  const mermaidId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const personas = manifest?.personas ?? []

  const visibleNodes = useMemo(() => {
    const nodes = manifest?.nodes ?? []
    if (selectedPersona === 'all') {
      return nodes
    }

    return nodes.filter((node) => node.persona === selectedPersona)
  }, [manifest?.nodes, selectedPersona])

  const visibleReports = useMemo(() => {
    if (selectedPersona === 'all') {
      return journeyReports
    }

    return journeyReports.filter((report) => matchesPersona(report, selectedPersona))
  }, [journeyReports, selectedPersona])

  useEffect(() => {
    let cancelled = false

    async function renderMermaid() {
      if (!mermaidCode) {
        setMermaidSvg(null)
        setMermaidError(null)
        return
      }

      try {
        const mermaidModule = await import('mermaid') as { default: MermaidApi }
        mermaidModule.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
        })
        const result = await mermaidModule.default.render(`journey-map-${mermaidId}`, mermaidCode)
        if (!cancelled) {
          setMermaidSvg(result.svg)
          setMermaidError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setMermaidSvg(null)
          setMermaidError(error instanceof Error ? error.message : 'Mermaid render failed')
        }
      }
    }

    void renderMermaid()

    return () => {
      cancelled = true
    }
  }, [mermaidCode, mermaidId])

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b border-slate-200 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">SwarmOps dev-only</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Journey Observatory</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Playwright report, journey manifest, Mermaid map, and JourneyReport metrics for local development.
              </p>
            </div>
            <Link
              href="/dev/journeys/approval-inbox"
              className="inline-flex min-h-10 items-center border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              承認 inbox を開く
            </Link>
          </div>
        </header>

        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2" aria-label="persona lane filter">
            <button
              type="button"
              onClick={() => setSelectedPersona('all')}
              className={cx(
                'min-h-9 border px-3 py-1.5 text-sm font-medium transition',
                selectedPersona === 'all'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              全 persona
            </button>
            {personas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                onClick={() => setSelectedPersona(persona.id)}
                className={cx(
                  'flex min-h-9 items-center gap-2 border px-3 py-1.5 text-sm font-medium transition',
                  selectedPersona === persona.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <span
                  className="h-2.5 w-2.5 border border-slate-400"
                  style={{ backgroundColor: persona.lane_color ?? '#e2e8f0' }}
                  aria-hidden="true"
                />
                {persona.name ?? persona.id}
              </button>
            ))}
          </div>
        </div>

        <section className="border-b border-slate-200 py-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Playwright Report</h2>
              <p className="mt-1 text-sm text-slate-600">apps/web/playwright-report/index.html</p>
            </div>
          </div>
          {hasPlaywrightReport ? (
            <div className="h-[560px] overflow-hidden border border-slate-300">
              <iframe
                title="Playwright HTML report"
                src="/api/dev/journeys/playwright-report"
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <ReportPlaceholder>
              レポート未生成。<code className="mx-1 bg-white px-1">pnpm --filter web test:e2e</code>
              を実行してください
            </ReportPlaceholder>
          )}
        </section>

        <section className="border-b border-slate-200 py-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Journey Manifest</h2>
              <p className="mt-1 text-sm text-slate-600">
                {visibleNodes.length} node(s) shown
              </p>
            </div>
          </div>
          {manifestError ? (
            <ReportPlaceholder>{manifestError}</ReportPlaceholder>
          ) : (
            <ManifestTable nodes={visibleNodes} personas={personas} />
          )}
        </section>

        <section className="border-b border-slate-200 py-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Journey Map (Mermaid)</h2>
            <p className="mt-1 text-sm text-slate-600">docs/swarmops/journey-map.md</p>
          </div>
          {!mermaidCode ? (
            <ReportPlaceholder>Mermaid コードブロックが見つかりません</ReportPlaceholder>
          ) : mermaidSvg ? (
            <div
              className="overflow-x-auto border border-slate-300 bg-slate-50 p-4"
              dangerouslySetInnerHTML={{ __html: mermaidSvg }}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
              <pre className="overflow-x-auto border border-slate-300 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                {mermaidCode}
              </pre>
              <ReportPlaceholder>{mermaidError ?? 'Mermaid をレンダリングしています'}</ReportPlaceholder>
            </div>
          )}
        </section>

        <section className="py-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Journey Reports</h2>
              <p className="mt-1 text-sm text-slate-600">
                {visibleReports.length} report row(s) shown
              </p>
            </div>
          </div>
          {visibleReports.length === 0 ? (
            <ReportPlaceholder>recorder 出力未生成</ReportPlaceholder>
          ) : (
            <ReportsTable reports={visibleReports} personas={personas} />
          )}
        </section>
      </div>
    </main>
  )
}

function ManifestTable({ nodes, personas }: { nodes: JourneyNode[]; personas: JourneyPersona[] }) {
  if (nodes.length === 0) {
    return <ReportPlaceholder>選択中の persona に属する node はありません</ReportPlaceholder>
  }

  return (
    <div className="overflow-x-auto border border-slate-300">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
          <tr>
            <th className="px-3 py-2 font-semibold">id</th>
            <th className="px-3 py-2 font-semibold">describe</th>
            <th className="px-3 py-2 font-semibold">spec_file</th>
            <th className="px-3 py-2 font-semibold">status</th>
            <th className="px-3 py-2 font-semibold">critical_path</th>
            <th className="px-3 py-2 font-semibold">persona</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              className={cx(
                'border-t border-slate-200',
                node.critical_path ? 'border-l-4 border-l-slate-950' : 'border-l-4 border-l-transparent',
              )}
            >
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold">{node.id}</td>
              <td className="max-w-[28rem] px-3 py-2">{node.describe ?? node.label ?? '-'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{node.spec_file ?? '-'}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <span
                  className={cx(
                    'inline-flex border px-2 py-0.5 text-xs font-medium',
                    STATUS_STYLES[node.status ?? ''] ?? 'border-slate-200 bg-white text-slate-700',
                  )}
                >
                  {node.status ?? 'unknown'}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2">{node.critical_path ? 'true' : 'false'}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {node.persona ? getPersonaLabel(personas, node.persona) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportsTable({
  reports,
  personas,
}: {
  reports: DashboardJourneyReport[]
  personas: JourneyPersona[]
}) {
  return (
    <div className="overflow-x-auto border border-slate-300">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
          <tr>
            <th className="px-3 py-2 font-semibold">persona</th>
            <th className="px-3 py-2 font-semibold">project</th>
            <th className="px-3 py-2 font-semibold">spec</th>
            <th className="px-3 py-2 text-right font-semibold">steps</th>
            <th className="px-3 py-2 text-right font-semibold">duration</th>
            <th className="px-3 py-2 text-right font-semibold">ai friction</th>
            <th className="px-3 py-2 font-semibold">criteria violations</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report, index) => (
            <tr
              key={`${report.source}-${report.spec}-${index}`}
              className={cx(
                'border-t border-slate-200',
                report.criteriaViolations.length > 0 ? 'bg-rose-50' : null,
              )}
            >
              <td className="whitespace-nowrap px-3 py-2">
                {report.personaName ?? getPersonaLabel(personas, report.personaId)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{report.project ?? '-'}</td>
              <td className="max-w-[30rem] px-3 py-2">{report.spec}</td>
              <td className="px-3 py-2 text-right tabular-nums">{report.steps}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDuration(report.durationMs)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{report.aiFrictionEvents}</td>
              <td className="px-3 py-2">
                {report.criteriaViolations.length > 0
                  ? report.criteriaViolations.join(', ')
                  : 'none'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
