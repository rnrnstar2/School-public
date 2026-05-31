import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AtomsBrowserGrid } from '@/components/atoms/atoms-browser-grid'
import { AtomsBrowserShell } from '@/components/atoms/atoms-browser-shell'
import { LessonsGridSkeleton } from '@/components/lesson/lessons-grid-skeleton'
import {
  applyAtomListFilters,
  fetchCurrentAtoms,
  parseAtomListSearchParams,
  type AtomListFilterSpec,
} from '@/lib/atoms/atom-repository'
import { toAtomListViewModel } from '@/lib/atoms/atom-view-model'

export const dynamic = 'force-dynamic'

/**
 * SSR cap (W56). With ~570 atoms, an unfiltered `/lessons` previously
 * shipped ~2.1 MB of HTML. The default 50-row cap brings the unfiltered
 * page well under 200 KB; callers can override with `?limit=N` (capped at
 * 1000 by `parseAtomListSearchParams`).
 */
const DEFAULT_LIST_LIMIT = 50

/**
 * DB-side fetch ceiling (W62 / W12-NEW-3). The repo previously loaded all
 * 570 atoms regardless of `?limit`. We now push `.limit(N)` into the
 * Supabase query — but because `applyAtomListFilters` runs after the
 * fetch, we still need a buffer so persona / track / contentType filter
 * dropouts don't starve the post-filter slice. A 4x multiplier on
 * `filter.limit` covers typical persona/track filters; the absolute cap
 * keeps the worst case bounded even when callers pass `?limit=1000`.
 */
const FETCH_LIMIT_BUFFER = 4
const FETCH_LIMIT_MAX = 1000

function computeFetchLimit(filterLimit: number | undefined): number {
  const base = typeof filterLimit === 'number' && filterLimit > 0 ? filterLimit : DEFAULT_LIST_LIMIT
  return Math.min(base * FETCH_LIMIT_BUFFER, FETCH_LIMIT_MAX)
}

export const metadata: Metadata = {
  title: 'レッスン一覧',
  description:
    '目標やスキルに合ったレッスンを探せる一覧ページです。',
  openGraph: {
    title: 'レッスン一覧 | School',
    description:
      '目標やスキルに合ったレッスンを探せる一覧ページです。',
    type: 'website',
    locale: 'ja_JP',
    siteName: 'School',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'レッスン一覧 | School',
    description:
      '目標やスキルに合ったレッスンを探せる一覧ページです。',
  },
}

async function AtomsGridLoader({ filter }: { filter: AtomListFilterSpec }) {
  // W62 / W12-NEW-3: push `.limit(N)` into the Supabase query so the DB
  // doesn't materialize all 570 atoms when the page only renders 50.
  const fetchLimit = computeFetchLimit(filter.limit)
  const atoms = await fetchCurrentAtoms({
    minStatus: 'draft',
    includeBody: false,
    limit: fetchLimit,
  })

  // Build the list view models once, then drive the SSR filter with the
  // user-facing summary so `?q=` matches what the learner sees.
  const viewModelsByAtomId = new Map(
    atoms.map((atom) => [atom.atomId, toAtomListViewModel(atom)]),
  )
  const filteredAtoms = applyAtomListFilters(atoms, filter, (atom) => {
    return viewModelsByAtomId.get(atom.atomId)?.summary ?? ''
  })

  const atomViewModels = filteredAtoms
    .map((atom) => viewModelsByAtomId.get(atom.atomId))
    .filter((vm): vm is NonNullable<typeof vm> => vm !== undefined)
    .sort((left, right) => left.title.localeCompare(right.title, 'ja'))

  // W62 / G3 #2: pass the unfiltered atom count so the empty-state UI can
  // distinguish "DB has zero atoms" (offer plan creation) from "filter
  // matched zero rows" (offer filter reset). Without this, learners hit
  // the misleading "まだレッスンがありません" CTA when the DB has 576 rows
  // but `?contentType=video` returns 0.
  return <AtomsBrowserGrid atoms={atomViewModels} unfilteredCount={atoms.length} />
}

export default async function LessonsPage({
  searchParams,
}: {
  // Next.js 16: searchParams is async.
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = (await searchParams) ?? {}
  const filter = parseAtomListSearchParams(resolved, { limit: DEFAULT_LIST_LIMIT })

  return (
    <AtomsBrowserShell>
      <Suspense fallback={<LessonsGridSkeleton />}>
        <AtomsGridLoader filter={filter} />
      </Suspense>
    </AtomsBrowserShell>
  )
}
