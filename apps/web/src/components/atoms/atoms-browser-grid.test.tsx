import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AtomListViewModel } from '@/lib/atoms/atom-view-model'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

import { AtomsBrowserGrid } from './atoms-browser-grid'
import { AtomsFilterProvider } from './atoms-browser-context'

function renderWithProvider(node: React.ReactElement) {
  return render(<AtomsFilterProvider>{node}</AtomsFilterProvider>)
}

describe('AtomsBrowserGrid empty state (W62 / G3 #2)', () => {
  it('shows DB-empty CTA when both atoms and unfilteredCount are zero', () => {
    renderWithProvider(<AtomsBrowserGrid atoms={[]} unfilteredCount={0} />)

    expect(
      screen.getByText(/まだレッスンがありません。プランを作成すると/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'プランを作成する' })).toHaveAttribute(
      'href',
      '/plan',
    )
    // Filter-empty CTA must NOT appear in the DB-empty branch.
    expect(screen.queryByText(/フィルタを変えてみてください/)).not.toBeInTheDocument()
  })

  it('shows filter-empty CTA when atoms is empty but unfilteredCount > 0', () => {
    // Reproduces the bug audited in audit-g3.md §4.3: server-side
    // `applyAtomListFilters` already trimmed `atoms` to 0, but the DB
    // actually has 576 rows. Without `unfilteredCount`, the page mistakenly
    // showed "まだレッスンがありません" + "プランを作成する" CTA.
    renderWithProvider(<AtomsBrowserGrid atoms={[]} unfilteredCount={576} />)

    expect(
      screen.getByText('条件に一致するレッスンはありません。フィルタを変えてみてください。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'フィルタをリセット' })).toHaveAttribute(
      'href',
      '/lessons',
    )
    // DB-empty CTA must NOT appear when DB has rows.
    expect(screen.queryByText(/まだレッスンがありません/)).not.toBeInTheDocument()
  })

  it('falls back to atoms.length when unfilteredCount prop is omitted', () => {
    // The legacy `AtomsBrowser` wrapper passes the full atom set to grid
    // and does not (yet) thread unfilteredCount. We keep the old behavior
    // so non-SSR callers still see DB-empty when atoms is genuinely empty.
    renderWithProvider(<AtomsBrowserGrid atoms={[]} />)

    expect(screen.getByText(/まだレッスンがありません/)).toBeInTheDocument()
  })

  it('renders atom cards when filter slice is non-empty', () => {
    const atoms: AtomListViewModel[] = [
      {
        atomId: 'atom.example',
        title: '例のレッスン',
        summary: '要約',
        personaTags: ['web-builder'],
        goalTags: ['website-launch'],
        capabilityOutputs: ['goal-ready'],
        hardPrerequisites: [],
        softPrerequisites: [],
        estimatedMinutes: 10,
        status: 'draft',
        deliverable: { type: 'note', validation: 'manual' },
        evidence: [],
        mediaSlots: ['diagram'],
      },
    ]

    renderWithProvider(<AtomsBrowserGrid atoms={atoms} unfilteredCount={576} />)

    expect(screen.getByText('例のレッスン')).toBeInTheDocument()
    // Neither empty-state CTA should render.
    expect(screen.queryByText(/まだレッスンがありません/)).not.toBeInTheDocument()
    expect(screen.queryByText(/フィルタをリセット/)).not.toBeInTheDocument()
  })
})
