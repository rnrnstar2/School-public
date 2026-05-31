'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { BookOpen, Clock3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@school/ui/card'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { describeCapability } from '@/lib/atoms/capability-glossary'
import type { AtomListViewModel } from '@/lib/atoms/atom-view-model'
import { useAtomsFilterContext, type AtomsBrowserMeta } from './atoms-browser-context'

const STATUS_LABELS: Record<AtomListViewModel['status'], string> = {
  draft: '下書き',
  reviewed: 'レビュー済み',
  experimental: '試験運用',
  stable: '安定',
  archived: '停止中',
}

const STATUS_BADGE_STYLES: Record<AtomListViewModel['status'], string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  reviewed: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  experimental: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200',
  stable: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  archived: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
}

function difficultyLabel(atom: AtomListViewModel) {
  const prerequisiteCount = atom.hardPrerequisites.length + atom.softPrerequisites.length

  if (prerequisiteCount === 0) {
    return '前提なし'
  }

  if (prerequisiteCount === 1) {
    return '前提 1 件'
  }

  return `前提 ${prerequisiteCount} 件`
}

function matchesSearch(atom: AtomListViewModel, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return true
  }

  const haystack = [
    atom.atomId,
    atom.title,
    atom.summary,
    atom.personaTags.join(' '),
    atom.goalTags.join(' '),
    atom.capabilityOutputs.join(' '),
  ]
    .join(' ')
    .toLowerCase()

  return tokens.every((token) => haystack.includes(token))
}

function buildFilterOptions(atoms: AtomListViewModel[], key: 'personaTags' | 'goalTags') {
  return Array.from(new Set(atoms.flatMap((atom) => atom[key]))).sort((left, right) =>
    left.localeCompare(right, 'ja'),
  )
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function hasSameBrowserMeta(left: AtomsBrowserMeta, right: AtomsBrowserMeta) {
  return (
    left.totalCount === right.totalCount &&
    left.filteredCount === right.filteredCount &&
    areStringArraysEqual(left.personaOptions, right.personaOptions) &&
    areStringArraysEqual(left.goalOptions, right.goalOptions)
  )
}

export function buildAtomsBrowserMeta(
  atoms: AtomListViewModel[],
  filteredCount = atoms.length,
): AtomsBrowserMeta {
  return {
    personaOptions: buildFilterOptions(atoms, 'personaTags'),
    goalOptions: buildFilterOptions(atoms, 'goalTags'),
    totalCount: atoms.length,
    filteredCount,
  }
}

export function AtomsBrowserGrid({
  atoms,
  unfilteredCount,
}: {
  atoms: AtomListViewModel[]
  /**
   * Total atom count BEFORE any filter (server-side or client-side) ran.
   * When omitted (e.g. unit tests / `AtomsBrowser` wrapper that already
   * received the full set), falls back to `atoms.length`.
   *
   * W62 / G3 #2: `/lessons` page passes the full DB count here so that the
   * empty-state UI can tell apart "DB has zero atoms" (offer plan
   * creation) from "filter matched zero rows" (offer filter reset).
   */
  unfilteredCount?: number
}) {
  const {
    deferredSearchQuery,
    personaTag,
    goalTag,
    status,
    contentType,
    setBrowserMeta,
  } = useAtomsFilterContext()

  const baseMeta = useMemo(() => buildAtomsBrowserMeta(atoms), [atoms])
  const filteredAtoms = useMemo(
    () =>
      atoms.filter((atom) => {
        if (personaTag !== 'all' && !atom.personaTags.includes(personaTag)) {
          return false
        }

        if (goalTag !== 'all' && !atom.goalTags.includes(goalTag)) {
          return false
        }

        if (status !== 'all' && atom.status !== status) {
          return false
        }

        // W62 / G3 #3: contentType selector exposes only DB-real values
        // (`diagram / screen_capture / icon`). Substring match is kept for
        // parity with the SSR `applyAtomListFilters` helper.
        if (contentType !== 'all') {
          const haystack = [...atom.mediaSlots, ...atom.evidence, atom.deliverable.type]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(contentType.toLowerCase())) {
            return false
          }
        }

        return matchesSearch(atom, deferredSearchQuery)
      }),
    [atoms, contentType, deferredSearchQuery, goalTag, personaTag, status],
  )

  useEffect(() => {
    const nextMeta = {
      ...baseMeta,
      filteredCount: filteredAtoms.length,
    }
    setBrowserMeta((currentMeta) => (hasSameBrowserMeta(currentMeta, nextMeta) ? currentMeta : nextMeta))
  }, [baseMeta, filteredAtoms.length, setBrowserMeta])

  if (filteredAtoms.length === 0) {
    // W62 / G3 #2: distinguish DB-empty from filter-empty. `atoms` is the
    // post-server-filter slice, so it can be 0 even when 576 atoms exist.
    // `unfilteredCount` (when provided by the SSR page) reflects the DB
    // count before any filter ran, which is the only signal that survives
    // the SSR filter pipeline.
    const totalAvailable = unfilteredCount ?? atoms.length
    const isDbEmpty = totalAvailable === 0

    return (
      <Card className="mt-6 border-dashed border-slate-300 bg-white/70 dark:border-slate-700 dark:bg-slate-950/60">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center text-sm text-slate-600 dark:text-slate-300">
          {isDbEmpty ? (
            <>
              <BookOpen className="h-10 w-10 text-slate-400 dark:text-slate-500" />
              <p>まだレッスンがありません。プランを作成すると、おすすめのレッスンが表示されます。</p>
              <Link
                href="/plan"
                className="inline-flex items-center rounded-md bg-orange-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                プランを作成する
              </Link>
            </>
          ) : (
            <>
              <p>条件に一致するレッスンはありません。フィルタを変えてみてください。</p>
              <Link
                href="/lessons"
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-orange-300 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
              >
                フィルタをリセット
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {filteredAtoms.map((atom) => (
        <article
          key={atom.atomId}
          data-atom-card={atom.atomId}
          className="text-left cursor-pointer"
        >
          <Card className="h-full border-slate-200/80 bg-white/90 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-orange-400/40">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{atom.atomId}</p>
                  <CardTitle className="text-xl leading-7">
                    <Link
                      href={`/lessons/${atom.atomId}`}
                      className="transition-colors hover:text-orange-700 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {atom.title}
                    </Link>
                  </CardTitle>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES[atom.status]}`}
                >
                  {STATUS_LABELS[atom.status]}
                </span>
              </div>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{atom.summary}</p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {atom.capabilityOutputs.length > 0
                  ? atom.capabilityOutputs.map((output) => {
                      const entry = describeCapability(output)
                      return (
                        <span
                          key={`${atom.atomId}-${output}`}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {output}
                          <InfoTooltip
                            ariaLabel={`${output} の説明を表示`}
                            heading={entry.term}
                            description={entry.description}
                          />
                        </span>
                      )
                    })
                  : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      出力タグ未設定
                    </span>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  {atom.estimatedMinutes ? `${atom.estimatedMinutes} 分` : '時間未設定'}
                </span>
                <span>{difficultyLabel(atom)}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {atom.personaTags.map((tag) => (
                  <span
                    key={`${atom.atomId}-persona-${tag}`}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    ペルソナ:{tag}
                  </span>
                ))}
                {atom.goalTags.map((tag) => (
                  <span
                    key={`${atom.atomId}-goal-${tag}`}
                    className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700 dark:bg-orange-500/10 dark:text-orange-200"
                  >
                    目標:{tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </article>
      ))}
    </div>
  )
}
