import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AiToolLaunchCard } from './ai-tool-launch-card'

describe('AiToolLaunchCard', () => {
  it('renders the empty-state fallback when no tools are passed', () => {
    render(<AiToolLaunchCard tools={[]} />)

    expect(
      screen.getByTestId('ai-tool-launch-card-empty'),
    ).toBeInTheDocument()
    expect(screen.getByText('使う AI ツールを選びましょう')).toBeInTheDocument()
    expect(screen.getByText(/まだツールを選んでいません/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /設定で追加/ })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('renders the claude command for a single claude-code selection', () => {
    render(<AiToolLaunchCard tools={['claude-code']} />)

    expect(screen.getByTestId('ai-tool-launch-card')).toBeInTheDocument()
    expect(screen.getByText('AI ツールで始めよう')).toBeInTheDocument()
    // Primary tool label + command
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
    // No secondary section when only one tool is selected
    expect(screen.queryByText('ほかのツール')).not.toBeInTheDocument()
  })

  it('renders primary + secondary tools in the order given', async () => {
    render(<AiToolLaunchCard tools={['claude-code', 'cursor']} />)
    const user = userEvent.setup()

    // First tool is primary — Claude Code label + its command visible
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()

    // Secondary tools stay collapsed until expanded.
    expect(
      screen.getByRole('button', { name: 'ほかのツール (1)' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Cursor')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ほかのツール (1)' }))
    expect(screen.getByText('Cursor')).toBeInTheDocument()
  })

  it('renders cursor as primary when listed first (order is deterministic)', async () => {
    render(<AiToolLaunchCard tools={['cursor', 'claude-code']} />)
    const user = userEvent.setup()

    // Cursor is now primary — its first step should be visible
    expect(screen.getByText('Cursor')).toBeInTheDocument()
    expect(screen.getByText('Cursor アプリを起動する')).toBeInTheDocument()

    // claude-code is relegated to secondary list
    expect(screen.getByRole('button', { name: 'ほかのツール (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ほかのツール (1)' }))
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('silently skips unknown tool ids but keeps known ones', () => {
    render(<AiToolLaunchCard tools={['bogus-tool', 'v0']} />)

    // Unknown dropped → v0 becomes primary, not the empty fallback
    expect(screen.getByTestId('ai-tool-launch-card')).toBeInTheDocument()
    expect(screen.getByText('v0')).toBeInTheDocument()
    expect(
      screen.queryByTestId('ai-tool-launch-card-empty'),
    ).not.toBeInTheDocument()
  })

  it('falls back to empty state when all provided ids are unknown', () => {
    render(<AiToolLaunchCard tools={['bogus-tool', 'another-unknown']} />)

    expect(
      screen.getByTestId('ai-tool-launch-card-empty'),
    ).toBeInTheDocument()
  })
})
