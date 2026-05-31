'use client'

import { useMemo, useState } from 'react'

// ── Types ──

interface ContentGap {
  goalPattern: string
  requestCount: number
  domain: string
  existingLessonCount: number
  coverageScore: number // 0-100
  suggestedTopics: string[]
}

interface ContentGapDashboardProps {
  gaps: ContentGap[]
  domains: { slug: string; label: string }[]
}

// ── Component ──

export function ContentGapDashboard({ gaps, domains }: ContentGapDashboardProps) {
  const [domainFilter, setDomainFilter] = useState('')
  const [sortKey, setSortKey] = useState<'requestCount' | 'coverageScore'>('requestCount')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = useMemo(() => {
    let result = gaps
    if (domainFilter) {
      result = result.filter((g) => g.domain === domainFilter)
    }
    return [...result].sort((a, b) => {
      const cmp = a[sortKey] - b[sortKey]
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [gaps, domainFilter, sortKey, sortDir])

  const toggleSort = (key: 'requestCount' | 'coverageScore') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Summary stats
  const stats = useMemo(() => {
    const critical = gaps.filter((g) => g.coverageScore < 30).length
    const moderate = gaps.filter((g) => g.coverageScore >= 30 && g.coverageScore < 70).length
    const good = gaps.filter((g) => g.coverageScore >= 70).length
    const totalRequests = gaps.reduce((sum, g) => sum + g.requestCount, 0)
    return { critical, moderate, good, totalRequests }
  }, [gaps])

  const inputClass =
    'rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100'

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          需要はあるが教材が足りない領域
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          学習者のゴールパターンと既存レッスンのカバレッジを比較し、コンテンツギャップを可視化します。
        </p>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="要改善（赤）" value={stats.critical} color="text-red-700 bg-red-50 border-red-200" />
        <SummaryCard label="注意（黄）" value={stats.moderate} color="text-amber-700 bg-amber-50 border-amber-200" />
        <SummaryCard label="良好（緑）" value={stats.good} color="text-emerald-700 bg-emerald-50 border-emerald-200" />
        <SummaryCard label="総リクエスト数" value={stats.totalRequests} color="text-slate-700 bg-slate-50 border-slate-200" />
      </div>

      {/* ── Filter ── */}
      <div className="flex items-center gap-3">
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">すべてのドメイン</option>
          {domains.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} / {gaps.length} 件
        </span>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">コンテンツギャップが見つかりません</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            フィルター条件を変更するか、データを確認してください。
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    ゴールパターン
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    ドメイン
                  </th>
                  <th
                    onClick={() => toggleSort('requestCount')}
                    className="cursor-pointer select-none px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
                  >
                    リクエスト数
                    {sortKey === 'requestCount' && (
                      <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    既存レッスン数
                  </th>
                  <th
                    onClick={() => toggleSort('coverageScore')}
                    className="cursor-pointer select-none px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
                  >
                    カバレッジ
                    {sortKey === 'coverageScore' && (
                      <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    提案トピック
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((gap, idx) => (
                  <tr key={idx} className="align-top hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-slate-900">{gap.goalPattern}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-cyan-700">
                        {domains.find((d) => d.slug === gap.domain)?.label ?? gap.domain}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      {gap.requestCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">{gap.existingLessonCount}</td>
                    <td className="px-5 py-4">
                      <CoverageBar score={gap.coverageScore} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {gap.suggestedTopics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
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

// ── Sub-Components ──

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  )
}

function CoverageBar({ score }: { score: number }) {
  let barColor: string
  let textColor: string
  let label: string

  if (score < 30) {
    barColor = 'bg-red-500'
    textColor = 'text-red-700'
    label = '不足'
  } else if (score < 70) {
    barColor = 'bg-amber-500'
    textColor = 'text-amber-700'
    label = '注意'
  } else {
    barColor = 'bg-emerald-500'
    textColor = 'text-emerald-700'
    label = '良好'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${textColor}`}>{score}%</span>
      </div>
      <span className={`text-xs ${textColor}`}>{label}</span>
    </div>
  )
}
