'use client'

import { useMemo, useState } from 'react'

// ── Types ──

interface LessonListItem {
  id: string
  slug: string
  title: string
  domains: string[]
  latestVersion: {
    id: string
    version: number
    status: string
    published_at?: string
  }
  blockCount: number
  objectiveCount: number
}

interface LessonListV2Props {
  lessons: LessonListItem[]
  onEdit: (lessonId: string) => void
  onPublish: (lessonId: string, versionId: string) => void
  onArchive: (lessonId: string, versionId: string) => void
}

// ── Constants ──

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: '下書き' },
  review: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'レビュー中' },
  published: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '公開中' },
  archived: { bg: 'bg-red-100', text: 'text-red-700', label: 'アーカイブ' },
}

const STATUS_OPTIONS = [
  { value: '', label: 'すべてのステータス' },
  { value: 'draft', label: '下書き' },
  { value: 'review', label: 'レビュー中' },
  { value: 'published', label: '公開中' },
  { value: 'archived', label: 'アーカイブ' },
]

type SortKey = 'title' | 'domain' | 'status' | 'version' | 'updated'
type SortDir = 'asc' | 'desc'

// ── Component ──

export function LessonListV2({ lessons, onEdit, onPublish, onArchive }: LessonListV2Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [domainFilter, setDomainFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Extract unique domains
  const allDomains = useMemo(() => {
    const set = new Set<string>()
    lessons.forEach((l) => l.domains.forEach((d) => set.add(d)))
    return Array.from(set).sort()
  }, [lessons])

  // Filter
  const filtered = useMemo(() => {
    let result = lessons

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (l) => l.title.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q),
      )
    }

    if (statusFilter) {
      result = result.filter((l) => l.latestVersion.status === statusFilter)
    }

    if (domainFilter) {
      result = result.filter((l) => l.domains.includes(domainFilter))
    }

    return result
  }, [lessons, search, statusFilter, domainFilter])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title, 'ja')
          break
        case 'domain':
          cmp = (a.domains[0] ?? '').localeCompare(b.domains[0] ?? '', 'ja')
          break
        case 'status':
          cmp = a.latestVersion.status.localeCompare(b.latestVersion.status)
          break
        case 'version':
          cmp = a.latestVersion.version - b.latestVersion.version
          break
        case 'updated':
          cmp = (a.latestVersion.published_at ?? '').localeCompare(
            b.latestVersion.published_at ?? '',
          )
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map((l) => l.id)))
    }
  }

  const handleBatchPublish = () => {
    sorted
      .filter((l) => selected.has(l.id) && l.latestVersion.status === 'review')
      .forEach((l) => onPublish(l.id, l.latestVersion.id))
    setSelected(new Set())
  }

  const handleBatchArchive = () => {
    sorted
      .filter((l) => selected.has(l.id) && l.latestVersion.status === 'published')
      .forEach((l) => onArchive(l.id, l.latestVersion.id))
    setSelected(new Set())
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="ml-1 text-slate-300">&#x2195;</span>
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  const inputClass =
    'rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100'

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="タイトル・スラッグで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-64`}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">すべてのドメイン</option>
          {allDomains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-slate-500">
          {sorted.length} / {lessons.length} 件
        </span>
      </div>

      {/* ── Batch Actions ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">{selected.size} 件選択中</span>
          <button
            type="button"
            onClick={handleBatchPublish}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            一括公開
          </button>
          <button
            type="button"
            onClick={handleBatchArchive}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            一括アーカイブ
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
          >
            選択解除
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {sorted.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">レッスンが見つかりません</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            フィルター条件を変更してください。
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selected.size === sorted.length && sorted.length > 0}
                      onChange={toggleAll}
                      className="accent-emerald-600"
                    />
                  </th>
                  {(
                    [
                      ['title', 'タイトル'],
                      ['domain', 'ドメイン'],
                      ['status', 'ステータス'],
                      ['version', 'バージョン'],
                      ['updated', '更新日'],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="cursor-pointer select-none px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
                    >
                      {label}
                      <SortIcon column={key} />
                    </th>
                  ))}
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    ブロック数
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((lesson) => {
                  const badge = STATUS_BADGE[lesson.latestVersion.status] ?? STATUS_BADGE.draft
                  return (
                    <tr key={lesson.id} className="align-top hover:bg-slate-50/50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selected.has(lesson.id)}
                          onChange={() => toggleSelect(lesson.id)}
                          className="accent-emerald-600"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-900">{lesson.title}</p>
                          <p className="text-xs text-slate-400">{lesson.slug}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {lesson.domains.map((d) => (
                            <span
                              key={d}
                              className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-cyan-700"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        v{lesson.latestVersion.version}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {lesson.latestVersion.published_at
                          ? new Date(lesson.latestVersion.published_at).toLocaleDateString('ja-JP')
                          : '-'}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{lesson.blockCount}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => onEdit(lesson.id)}
                            className="inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                          >
                            編集
                          </button>
                          {lesson.latestVersion.status === 'review' && (
                            <button
                              type="button"
                              onClick={() => onPublish(lesson.id, lesson.latestVersion.id)}
                              className="inline-flex rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                            >
                              公開
                            </button>
                          )}
                          {lesson.latestVersion.status === 'published' && (
                            <button
                              type="button"
                              onClick={() => onArchive(lesson.id, lesson.latestVersion.id)}
                              className="inline-flex rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-200"
                            >
                              アーカイブ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
