import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtomViewModel } from '@/lib/atoms/atom-view-model'

const { lessonCompleteButtonMock, useCompletedLessonIdsMock } = vi.hoisted(() => ({
  lessonCompleteButtonMock: vi.fn(),
  useCompletedLessonIdsMock: vi.fn<(lessonIds: string[]) => string[]>(),
}))

vi.mock('@/hooks/use-completed-lesson-ids', () => ({
  useCompletedLessonIds: (lessonIds: string[]) => useCompletedLessonIdsMock(lessonIds),
}))

vi.mock('@/components/lesson/lesson-complete-button', () => ({
  LessonCompleteButton: ({
    lessonId,
    learnerProfile,
  }: {
    lessonId: string
    learnerProfile?: { operating_system?: string | null } | null
  }) => {
    lessonCompleteButtonMock({ lessonId, learnerProfile })
    return (
      <div>
        <div>{`complete:${lessonId}`}</div>
        <div>{`complete-profile:${learnerProfile?.operating_system ?? ''}`}</div>
      </div>
    )
  },
}))

import { AtomDetailView } from './atom-detail-view'

const atom: AtomViewModel = {
  atomId: 'atom.web-builder.create-next-app',
  title: 'Next.js の初期アプリを作る',
  summary: '雛形アプリを作って開発を始められる状態にします。',
  personaTags: ['web-builder'],
  goalTags: ['build-ui'],
  capabilityOutputs: ['next-app-ready'],
  hardPrerequisites: ['atom.web-builder.choose-project-goal'],
  softPrerequisites: ['atom.web-builder.missing-lesson'],
  estimatedMinutes: 25,
  status: 'draft',
  deliverable: { type: 'config_file', validation: 'basic_manual_check_v1' },
  evidence: ['code_diff'],
  mediaSlots: ['screen_capture'],
  bodyMarkdown: '本文',
  sections: [
    { id: 'why', title: 'なぜこのレッスンか', markdown: '理由を説明します。' },
    { id: 'how', title: '手順', markdown: '1. コマンドを実行します。' },
  ],
}

const prerequisites: AtomViewModel[] = [
  {
    atomId: 'atom.web-builder.choose-project-goal',
    title: '作りたいサイトの目的を決める',
    summary: '目的を定義します。',
    personaTags: ['web-builder'],
    goalTags: ['website-launch'],
    capabilityOutputs: [],
    hardPrerequisites: [],
    softPrerequisites: [],
    estimatedMinutes: 15,
    status: 'draft',
    deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
    evidence: ['screenshot'],
    mediaSlots: ['screen_capture'],
    bodyMarkdown: '本文',
    sections: [{ id: 'other', title: 'レッスン本文', markdown: '本文' }],
  },
]

describe('AtomDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no soft prereqs completed; implementations can override.
    useCompletedLessonIdsMock.mockReturnValue([])
  })

  it('renders atom sections', () => {
    render(<AtomDetailView atom={atom} prerequisites={prerequisites} />)

    expect(screen.getByRole('heading', { name: 'Next.js の初期アプリを作る' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'なぜこのレッスンか' })).toBeInTheDocument()
    expect(screen.getByText('理由を説明します。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '手順' })).toBeInTheDocument()
  })

  it('renders prerequisite links and missing prerequisites', () => {
    render(<AtomDetailView atom={atom} prerequisites={prerequisites} />)

    expect(screen.getByRole('link', { name: /作りたいサイトの目的を決める/i })).toHaveAttribute(
      'href',
      '/lessons/atom.web-builder.choose-project-goal',
    )
    expect(screen.getByText('atom.web-builder.missing-lesson（未掲載）')).toBeInTheDocument()
  })

  it('distinguishes hard and soft prerequisites with 必須/おすすめ badges', () => {
    render(<AtomDetailView atom={atom} prerequisites={prerequisites} />)

    // The hard prereq link exposes strength via aria-label ("必須前提レッスン").
    expect(
      screen.getByRole('link', { name: /必須前提レッスン/ }),
    ).toHaveAttribute('href', '/lessons/atom.web-builder.choose-project-goal')
    // The soft prereq list surfaces the おすすめ badge. The entry is
    // unmapped (`atom.web-builder.missing-lesson`) so we assert on the
    // badge text rather than a link.
    expect(screen.getByText('おすすめ')).toBeInTheDocument()
  })

  it('shows an unmet soft prerequisite hint card linking to the recommended lesson', () => {
    const softPrereq: AtomViewModel = {
      atomId: 'atom.web-builder.optional-note',
      title: 'おすすめの準備ノート',
      summary: '事前にまとめておくと理解が早まります。',
      personaTags: ['web-builder'],
      goalTags: ['website-launch'],
      capabilityOutputs: [],
      hardPrerequisites: [],
      softPrerequisites: [],
      estimatedMinutes: 10,
      status: 'draft',
      deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
      evidence: [],
      mediaSlots: [],
      bodyMarkdown: '本文',
      sections: [{ id: 'other', title: 'レッスン本文', markdown: '本文' }],
    }
    const atomWithKnownSoftPrereq: AtomViewModel = {
      ...atom,
      softPrerequisites: ['atom.web-builder.optional-note'],
    }
    useCompletedLessonIdsMock.mockReturnValue([])

    render(
      <AtomDetailView
        atom={atomWithKnownSoftPrereq}
        prerequisites={[...prerequisites, softPrereq]}
      />,
    )

    // Hint card shows the Japanese copy and a link to the soft prereq.
    expect(
      screen.getByRole('note', { name: 'おすすめの前提レッスン' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('このレッスンの前に学ぶと理解しやすい関連レッスン'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'おすすめの準備ノート' }),
    ).toHaveAttribute('href', '/lessons/atom.web-builder.optional-note')
  })

  it('hides the soft prerequisite hint card when the learner has completed all soft prereqs', () => {
    const atomWithKnownSoftPrereq: AtomViewModel = {
      ...atom,
      softPrerequisites: ['atom.web-builder.optional-note'],
    }
    // Simulate the learner having already completed the soft prereq.
    useCompletedLessonIdsMock.mockReturnValue(['atom.web-builder.optional-note'])

    render(
      <AtomDetailView
        atom={atomWithKnownSoftPrereq}
        prerequisites={prerequisites}
      />,
    )

    expect(screen.queryByRole('note', { name: 'おすすめの前提レッスン' })).toBeNull()
  })

  it('renders the completion card through LessonCompleteButton', () => {
    render(<AtomDetailView atom={atom} prerequisites={prerequisites} />)

    expect(screen.getByText('complete:atom.web-builder.create-next-app')).toBeInTheDocument()
  })

  it('shows a personalized reflection prompt when learner context exists', () => {
    const reflectionAtom: AtomViewModel = {
      ...atom,
      sections: [
        ...atom.sections,
        {
          id: 'other',
          title: '振り返り',
          markdown: '- うまくいった点:\n- 次回改善したい点:',
        },
      ],
    }

    render(
      <AtomDetailView
        atom={reflectionAtom}
        prerequisites={prerequisites}
        learnerBlockers={['環境構築で止まった']}
        recentFeedback="次の一手が曖昧だった"
      />,
    )

    expect(
      screen.getAllByText(
        (_, element) =>
          element?.tagName === 'P' &&
          (element.textContent?.includes(
            '〈環境構築で止まった〉を踏まえて、今回の学びを振り返り、うまくいった点と次に改善したい点を整理してみましょう。',
          ) ??
            false),
      ),
    ).toHaveLength(1)
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.tagName === 'P' &&
          (element.textContent?.includes(
            '直近のフィードバック「次の一手が曖昧だった」も手がかりに振り返ってみましょう。',
          ) ??
            false),
      ),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument()
  })

  it('passes learnerProfile through to LessonCompleteButton', () => {
    render(
      <AtomDetailView
        atom={atom}
        prerequisites={prerequisites}
        learnerProfile={{
          user_id: 'user-1',
          display_name: 'Test User',
          locale: 'ja',
          experience_summary: null,
          operating_system: 'Windows 11',
          cli_familiarity: 'none',
          available_ai_tools: [],
          can_use_local_tools: true,
          created_at: '2026-04-18T00:00:00.000Z',
          updated_at: '2026-04-18T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('complete-profile:Windows 11')).toBeInTheDocument()
    expect(lessonCompleteButtonMock).toHaveBeenCalledWith({
      lessonId: 'atom.web-builder.create-next-app',
      learnerProfile: expect.objectContaining({
        operating_system: 'Windows 11',
      }),
    })
  })
})
