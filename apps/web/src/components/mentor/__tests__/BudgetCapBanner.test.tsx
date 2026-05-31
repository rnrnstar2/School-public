/**
 * BudgetCapBanner — W69 (Audit B4 #2) UI tests.
 *
 * 構造化 cap fields (used / cap / projected / reset_at) を表示し、
 * `/settings/api-keys` への deep link button が動作することを保証する。
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BudgetCapBanner, type BudgetCapBannerProps } from '../BudgetCapBanner'

function buildProps(overrides?: Partial<BudgetCapBannerProps>): BudgetCapBannerProps {
  return {
    usedUsd: 4.83,
    capUsd: 5,
    projectedUsd: 5.08,
    resetAtIso: '2026-06-01T00:00:00.000Z',
    message: '今月のメンター利用上限に達しました。来月またご利用ください。',
    ...overrides,
  }
}

describe('BudgetCapBanner', () => {
  it('renders structured cap, used, projected and reset date', () => {
    render(<BudgetCapBanner {...buildProps()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('今月のメンター利用上限に達しました')).toBeInTheDocument()
    expect(screen.getByTestId('cap-used')).toHaveTextContent('$4.83')
    expect(screen.getByTestId('cap-projected')).toHaveTextContent('$5.08')
    expect(screen.getByTestId('cap-cap')).toHaveTextContent('$5.00')
    // 2026-06-01 in ja-JP locale (loose match — Intl emits 2026/6/1).
    expect(screen.getByTestId('cap-reset-at').textContent).toMatch(/2026/)
    expect(screen.getByTestId('cap-reset-at').textContent).toMatch(/6/)
  })

  it('shows -- placeholder when projectedUsd is null (legacy payload)', () => {
    render(<BudgetCapBanner {...buildProps({ projectedUsd: null })} />)
    expect(screen.getByTestId('cap-projected')).toHaveTextContent('--')
  })

  it('renders settings deep link with default href and label', () => {
    render(<BudgetCapBanner {...buildProps()} />)

    const link = screen.getByTestId('cap-settings-link')
    expect(link).toHaveAttribute('href', '/settings/api-keys')
    expect(link).toHaveTextContent('設定で API キーを切替える')
  })

  it('honors custom settingsHref / label override', () => {
    render(
      <BudgetCapBanner
        {...buildProps({
          settingsHref: '/settings/usage',
          settingsLinkLabel: '利用状況を確認',
        })}
      />,
    )

    const link = screen.getByTestId('cap-settings-link')
    expect(link).toHaveAttribute('href', '/settings/usage')
    expect(link).toHaveTextContent('利用状況を確認')
  })

  it('shows server message inside the banner', () => {
    render(
      <BudgetCapBanner
        {...buildProps({
          message: 'カスタムメッセージ',
        })}
      />,
    )
    expect(screen.getByText('カスタムメッセージ')).toBeInTheDocument()
  })

  it('renders dismiss button only when onDismiss is supplied', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<BudgetCapBanner {...buildProps()} />)
    expect(screen.queryByLabelText('バナーを閉じる')).not.toBeInTheDocument()

    rerender(<BudgetCapBanner {...buildProps({ onDismiss })} />)
    const closeBtn = screen.getByLabelText('バナーを閉じる')
    fireEvent.click(closeBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('falls back to the raw ISO string when reset date is unparseable', () => {
    render(<BudgetCapBanner {...buildProps({ resetAtIso: 'not-a-date' })} />)
    expect(screen.getByTestId('cap-reset-at')).toHaveTextContent('not-a-date')
  })
})
