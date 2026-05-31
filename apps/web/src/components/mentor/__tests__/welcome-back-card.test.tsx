import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WelcomeBackCard, type WelcomeBackCardProps } from '../welcome-back-card'

function buildProps(
  overrides?: Partial<WelcomeBackCardProps>,
): WelcomeBackCardProps {
  return {
    understanding: {
      overallLevel: 'progressing',
      completedTaskCount: 3,
      blockedTaskCount: 0,
      averageDifficulty: null,
      averageClarity: null,
      commonBlockers: [],
      strengths: [],
      weaknesses: [],
      resumeMessage: '前回の続きから進められます。',
      adjustmentHints: [],
    },
    learnerState: null,
    lastTaskTitle: '前回のタスク',
    onResume: vi.fn(),
    onDismiss: vi.fn(),
    streakDays: 2,
    streakState: 'maintaining',
    ...overrides,
  }
}

describe('WelcomeBackCard', () => {
  it('renders the three today-intent buttons when no intent is selected', () => {
    render(
      <WelcomeBackCard
        {...buildProps({
          onSelectIntent: vi.fn(),
        })}
      />,
    )

    expect(screen.getByText('今日の学習意図')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '短時間で1問だけ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'じっくり1レッスン' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'まずは復習から' })).toBeInTheDocument()
  })

  it('calls onSelectIntent synchronously when an intent button is clicked', () => {
    const onSelectIntent = vi.fn()

    render(
      <WelcomeBackCard
        {...buildProps({
          onSelectIntent,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '短時間で1問だけ' }))

    expect(onSelectIntent).toHaveBeenCalledOnce()
    expect(onSelectIntent).toHaveBeenCalledWith('quick_win')
  })

  it('shows the selected intent pill and allows re-selection', () => {
    const onSelectIntent = vi.fn()

    render(
      <WelcomeBackCard
        {...buildProps({
          todayIntent: 'review',
          onSelectIntent,
        })}
      />,
    )

    expect(screen.getByText('今日の学習意図: まずは復習から')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '短時間で1問だけ' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '変更する' }))

    expect(screen.getByRole('button', { name: 'じっくり1レッスン' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'じっくり1レッスン' }))

    expect(onSelectIntent).toHaveBeenCalledWith('deep_focus')
  })

  it('does not introduce network or LLM calls in the welcome-back sources', () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../../',
    )
    const files = [
      path.join(repoRoot, 'apps/web/src/components/mentor/welcome-back-card.tsx'),
      path.join(repoRoot, 'apps/web/src/lib/mentor/welcome-back-intents.ts'),
    ]

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/fetch\s*\(|streamCompletion|anthropic|openai/iu)
    }
  })
})
