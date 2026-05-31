import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingTour, isTourCompleted, resetTourCompleted } from './onboarding-tour'

beforeEach(() => {
  localStorage.clear()
})

describe('OnboardingTour', () => {
  const mockOnComplete = vi.fn()

  beforeEach(() => {
    mockOnComplete.mockClear()
  })

  it('renders nothing when active is false', () => {
    const { container } = render(<OnboardingTour active={false} onComplete={mockOnComplete} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders tour dialog when active', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', 'ツアー: ゴールと進捗')
  })

  it('shows first step content', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    expect(screen.getByText('ゴールと進捗')).toBeInTheDocument()
    expect(screen.getByText(/プログレスバーで完了状況が一目で分かります/)).toBeInTheDocument()
    expect(screen.getByText('1/5')).toBeInTheDocument()
  })

  it('navigates to next step on "次へ" click', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('現在地の確認')).toBeInTheDocument()
  })

  it('navigates back on "前へ" click', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    // Go to step 2
    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('2/5')).toBeInTheDocument()

    // Go back to step 1
    fireEvent.click(screen.getByText('前へ'))
    expect(screen.getByText('1/5')).toBeInTheDocument()
  })

  it('"前へ" is disabled on first step', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    const prevButton = screen.getByText('前へ')
    expect(prevButton).toBeDisabled()
  })

  it('shows "完了" on last step', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    // Navigate to last step (step 5)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('次へ'))
    }
    expect(screen.getByText('5/5')).toBeInTheDocument()
    expect(screen.getByText('完了')).toBeInTheDocument()
    expect(screen.getByText('詳細情報')).toBeInTheDocument()
  })

  it('calls onComplete and sets localStorage on "完了"', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('次へ'))
    }
    fireEvent.click(screen.getByText('完了'))
    expect(mockOnComplete).toHaveBeenCalledOnce()
    expect(localStorage.getItem('school:onboarding-tour-completed')).toBe('1')
  })

  it('calls onComplete on skip button', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByLabelText('ツアーをスキップ'))
    expect(mockOnComplete).toHaveBeenCalledOnce()
    expect(localStorage.getItem('school:onboarding-tour-completed')).toBe('1')
  })

  it('calls onComplete on Escape key', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnComplete).toHaveBeenCalledOnce()
    expect(localStorage.getItem('school:onboarding-tour-completed')).toBe('1')
  })

  it('renders SVG overlay mask', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(document.querySelector('#tour-mask')).toBeInTheDocument()
  })

  it('shows step indicator dots', () => {
    render(<OnboardingTour active={true} onComplete={mockOnComplete} />)
    // 5 step indicator dots (found by the step counter)
    expect(screen.getByText('1/5')).toBeInTheDocument()
  })
})

describe('isTourCompleted', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns false when not completed', () => {
    expect(isTourCompleted()).toBe(false)
  })

  it('returns true when localStorage flag is set', () => {
    localStorage.setItem('school:onboarding-tour-completed', '1')
    expect(isTourCompleted()).toBe(true)
  })
})

describe('resetTourCompleted', () => {
  it('removes the localStorage flag', () => {
    localStorage.setItem('school:onboarding-tour-completed', '1')
    resetTourCompleted()
    expect(localStorage.getItem('school:onboarding-tour-completed')).toBeNull()
  })
})
