import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AtomListViewModel } from '@/lib/atoms/atom-view-model'

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

import { AtomsBrowser } from './atoms-browser'

const atoms: AtomListViewModel[] = [
  {
    atomId: 'atom.web-builder.choose-project-goal',
    title: '作りたいサイトの目的を決める',
    summary: '最初にサイトの目的を固めます。',
    personaTags: ['web-builder'],
    goalTags: ['website-launch'],
    capabilityOutputs: ['goal-ready'],
    hardPrerequisites: [],
    softPrerequisites: [],
    estimatedMinutes: 15,
    status: 'draft',
    deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
    evidence: ['screenshot'],
    mediaSlots: ['screen_capture'],
  },
  {
    atomId: 'atom.web-builder.create-next-app',
    title: 'Next.js の初期アプリを作る',
    summary: 'create-next-app で雛形を作ります。',
    personaTags: ['web-builder'],
    goalTags: ['build-ui'],
    capabilityOutputs: ['next-app-ready'],
    hardPrerequisites: ['atom.web-builder.choose-project-goal'],
    softPrerequisites: [],
    estimatedMinutes: 25,
    status: 'stable',
    deliverable: { type: 'config_file', validation: 'basic_manual_check_v1' },
    evidence: ['code_diff'],
    mediaSlots: ['screen_capture'],
  },
]

describe('AtomsBrowser', () => {
  it('renders the provided atom cards', () => {
    render(<AtomsBrowser atoms={atoms} />)

    expect(screen.getByRole('heading', { name: 'レッスン一覧' })).toBeInTheDocument()
    expect(screen.getByText('作りたいサイトの目的を決める')).toBeInTheDocument()
    expect(screen.getByText('Next.js の初期アプリを作る')).toBeInTheDocument()
  })

  it('filters atoms by search text and status', async () => {
    const user = userEvent.setup()
    render(<AtomsBrowser atoms={atoms} />)

    await user.type(screen.getByLabelText('レッスンを検索'), 'Next.js')
    await waitFor(() => {
      expect(screen.queryByText('作りたいサイトの目的を決める')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Next.js の初期アプリを作る')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('レッスンを検索'))
    await user.selectOptions(screen.getByLabelText('公開状態で絞り込む'), 'draft')

    await waitFor(() => {
      expect(screen.getByText('作りたいサイトの目的を決める')).toBeInTheDocument()
      expect(screen.queryByText('Next.js の初期アプリを作る')).not.toBeInTheDocument()
    })
  })

  it('links to the atom detail page from each card', () => {
    render(<AtomsBrowser atoms={atoms} />)

    expect(screen.getByRole('link', { name: /Next\.js の初期アプリを作る/i })).toHaveAttribute(
      'href',
      '/lessons/atom.web-builder.create-next-app',
    )
  })

  it('exposes contentType selector with DB-real vocabulary only (W62 / G3 #3)', () => {
    // W62: previous iterations exposed `video / text / interactive` which
    // never matched any DB row. We replace those with the actual values
    // that exist in `media_slots`: diagram / screen_capture / icon.
    render(<AtomsBrowser atoms={atoms} />)

    const select = screen.getByLabelText('コンテンツ種別で絞り込む') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)

    expect(optionValues).toEqual(['all', 'diagram', 'screen_capture', 'icon'])
    // Defensive: ensure the legacy non-DB values are NOT silently still
    // present if someone re-adds them to the options array.
    expect(optionValues).not.toContain('video')
    expect(optionValues).not.toContain('text')
    expect(optionValues).not.toContain('interactive')
  })

  it('filters atoms by contentType (matches mediaSlots / evidence)', async () => {
    const user = userEvent.setup()
    render(<AtomsBrowser atoms={atoms} />)

    // Both fixture atoms have screen_capture in mediaSlots; pick `code_diff`
    // which only the create-next-app atom has in evidence.
    await user.selectOptions(screen.getByLabelText('コンテンツ種別で絞り込む'), 'screen_capture')
    expect(screen.getByText('作りたいサイトの目的を決める')).toBeInTheDocument()
    expect(screen.getByText('Next.js の初期アプリを作る')).toBeInTheDocument()

    // diagram does not appear in either fixture — both rows should drop
    // and the empty-state message should appear (filter-empty branch, not
    // DB-empty, because atoms.length > 0).
    await user.selectOptions(screen.getByLabelText('コンテンツ種別で絞り込む'), 'diagram')
    await waitFor(() => {
      expect(screen.queryByText('作りたいサイトの目的を決める')).not.toBeInTheDocument()
      expect(screen.queryByText('Next.js の初期アプリを作る')).not.toBeInTheDocument()
    })
    expect(
      screen.getByText('条件に一致するレッスンはありません。フィルタを変えてみてください。'),
    ).toBeInTheDocument()
    // Filter-empty branch must NOT show the DB-empty CTA.
    expect(screen.queryByText(/まだレッスンがありません/)).not.toBeInTheDocument()
  })
})
