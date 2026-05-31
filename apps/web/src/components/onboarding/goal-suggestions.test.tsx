import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GoalSuggestions, GOAL_SUGGESTIONS } from './goal-suggestions'

describe('GoalSuggestions (W49 salvage of TQ-207)', () => {
  it('renders マーケター beta chips (顧客管理 / LPコピー / SNS運用) added in W49', () => {
    const onSelect = vi.fn()
    render(<GoalSuggestions onSelect={onSelect} />)

    expect(screen.getByText('顧客管理')).toBeInTheDocument()
    expect(screen.getByText('LPコピー')).toBeInTheDocument()
    expect(screen.getByText('SNS運用')).toBeInTheDocument()
  })

  it('exposes the marketer chips in GOAL_SUGGESTIONS const without comingSoon flag', () => {
    const labels = GOAL_SUGGESTIONS.filter((s) => !s.comingSoon).map((s) => s.label)
    expect(labels).toContain('顧客管理')
    expect(labels).toContain('LPコピー')
    expect(labels).toContain('SNS運用')
  })

  it('clicking 顧客管理 chip surfaces the CRM goal text to onSelect', () => {
    const onSelect = vi.fn()
    render(<GoalSuggestions onSelect={onSelect} />)

    fireEvent.click(screen.getByText('顧客管理'))
    expect(onSelect).toHaveBeenCalledWith(
      '顧客管理・フォローアップ web app を作りたい',
    )
  })

  it('clicking LPコピー chip surfaces the LP copy goal text to onSelect', () => {
    const onSelect = vi.fn()
    render(<GoalSuggestions onSelect={onSelect} />)

    fireEvent.click(screen.getByText('LPコピー'))
    expect(onSelect).toHaveBeenCalledWith(
      'LP コピーを AI で量産して A/B テストに使いたい',
    )
  })

  it('clicking SNS運用 chip surfaces the SNS batch goal text to onSelect', () => {
    const onSelect = vi.fn()
    render(<GoalSuggestions onSelect={onSelect} />)

    fireEvent.click(screen.getByText('SNS運用'))
    expect(onSelect).toHaveBeenCalledWith(
      'Instagram 投稿バッチを週次で AI 生成したい',
    )
  })

  it('preserves Web制作 chip and does not regress aria-label', () => {
    render(<GoalSuggestions onSelect={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'ゴールの候補' })).toBeInTheDocument()
    expect(screen.getByText('Web制作')).toBeInTheDocument()
  })
})
