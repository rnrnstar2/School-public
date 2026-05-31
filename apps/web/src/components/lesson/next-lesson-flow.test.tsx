import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { recommendBranch } from '@/lib/lessons/branch-recommender'
import { NextLessonFlow } from './next-lesson-flow'

vi.mock('@/lib/lessons/branch-recommender', () => ({
  recommendBranch: vi.fn(({ branches, profile }: {
    branches: Array<{ lessonId: string; branchLabel?: string }>
    profile?: { operating_system?: string | null } | null
  }) => {
    const operatingSystem = profile?.operating_system?.toLowerCase() ?? ''
    const recommended =
      branches.find((branch) => branch.branchLabel?.toLowerCase().includes(operatingSystem)) ??
      branches[0] ??
      null

    return {
      recommendedLessonId: recommended?.lessonId ?? null,
      reason: recommended ? `${profile?.operating_system ?? 'この環境'} 向け` : null,
    }
  }),
}))

const recommendBranchMock = vi.mocked(recommendBranch)

describe('NextLessonFlow', () => {
  it('renders the hero CTA and secondary actions for a single next lesson', () => {
    render(
      <NextLessonFlow
        flow={{
          isBranch: false,
          nextLessons: [
            {
              lessonId: 'atom.web-builder.create-next-app',
              title: 'Next.js の初期アプリを作る',
              summary: '開発を始めるためのベースを作ります。',
              estimatedMinutes: 25,
              flowType: 'linear',
            },
          ],
          isTrackEnd: false,
        }}
      />,
    )

    const heroCta = document.querySelector('[data-next-flow-hero-cta="true"]')
    expect(heroCta).toHaveTextContent('次のレッスンへ: Next.js の初期アプリを作る')
    expect(heroCta).toHaveAttribute(
      'href',
      '/lessons/atom.web-builder.create-next-app',
    )
    expect(screen.getByText('完了レッスン一覧')).toBeInTheDocument()
    expect(screen.getByText('プランに戻る')).toBeInTheDocument()
  })

  it('collapses related lessons behind details in branch mode', () => {
    render(
      <NextLessonFlow
        flow={{
          isBranch: true,
          nextLessons: [
            {
              lessonId: 'atom.web-builder.install-codex-cli-and-verify',
              title: 'Codex CLI を入れて確認する',
              summary: 'Windows 向けの最短ルートです。',
              estimatedMinutes: 15,
              flowType: 'branch',
              branchLabel: 'Windows',
            },
            {
              lessonId: 'atom.web-builder.install-claude-code-and-verify',
              title: 'Claude Code を入れて確認する',
              summary: 'macOS 向けの最短ルートです。',
              estimatedMinutes: 15,
              flowType: 'branch',
              branchLabel: 'macOS',
            },
          ],
          mergePointId: 'merge-1',
          isTrackEnd: false,
        }}
        learnerProfile={{ operating_system: 'Windows 11', cli_familiarity: 'comfortable' } as never}
      />,
    )

    const heroCta = document.querySelector('[data-next-flow-hero-cta="true"]')
    expect(heroCta).toHaveTextContent('次のレッスンへ: Codex CLI を入れて確認する')

    const details = screen.getByText(/関連レッスンをみる/).closest('details')
    expect(details).toBeInTheDocument()
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('Claude Code を入れて確認する')).toBeInTheDocument()
  })

  it('falls back to the plan hero CTA when no next lesson exists', () => {
    render(
      <NextLessonFlow
        flow={{
          isBranch: false,
          nextLessons: [],
          isTrackEnd: true,
        }}
      />,
    )

    expect(screen.getByText('すべてのレッスンを完了しました。')).toBeInTheDocument()
    expect(document.querySelector('[data-next-flow-hero-cta="true"]')).toHaveAttribute('href', '/plan')
  })

  it('falls back to the plan hero CTA when branch recommendation is unavailable', () => {
    recommendBranchMock.mockReturnValueOnce({
      recommendedLessonId: null,
      reason: null,
    })

    render(
      <NextLessonFlow
        flow={{
          isBranch: true,
          nextLessons: [
            {
              lessonId: 'atom.web-builder.install-codex-cli-and-verify',
              title: 'Codex CLI を入れて確認する',
              summary: 'Windows 向けの最短ルートです。',
              estimatedMinutes: 15,
              flowType: 'branch',
              branchLabel: 'Windows',
            },
            {
              lessonId: 'atom.web-builder.install-claude-code-and-verify',
              title: 'Claude Code を入れて確認する',
              summary: 'macOS 向けの最短ルートです。',
              estimatedMinutes: 15,
              flowType: 'branch',
              branchLabel: 'macOS',
            },
          ],
          mergePointId: 'merge-1',
          isTrackEnd: false,
        }}
        learnerProfile={{ operating_system: 'Linux', cli_familiarity: 'comfortable' } as never}
      />,
    )

    const heroCta = document.querySelector('[data-next-flow-hero-cta="true"]')
    const relatedLessons = document.querySelector('[data-next-flow-related-lessons="true"]')

    expect(heroCta).toHaveTextContent('プランに戻る')
    expect(heroCta).toHaveAttribute('href', '/plan')
    expect(relatedLessons).toBeInTheDocument()
    expect(screen.getByText('Codex CLI を入れて確認する')).toBeInTheDocument()
    expect(screen.getByText('Claude Code を入れて確認する')).toBeInTheDocument()
  })
})
