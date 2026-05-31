import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OwnerTypeBadge } from './owner-type-badge'

describe('OwnerTypeBadge', () => {
  it.each([
    ['user', '🧑 あなた'],
    ['ai', '🤖 AI'],
    ['both', '🧑🤖 協働'],
    ['external', '🏢 外部'],
    ['blocked', '⛔ ブロック'],
  ] as const)('renders %s badge copy', (ownerType, label) => {
    render(<OwnerTypeBadge ownerType={ownerType} />)

    expect(screen.getByTestId(`owner-type-badge-${ownerType}`)).toHaveTextContent(label)
  })

  it('shows the AI delegatable icon for ai and both owners', () => {
    const { rerender } = render(
      <OwnerTypeBadge ownerType="ai" showAiDelegatable />,
    )

    expect(screen.getByLabelText('AI 委譲可')).toBeInTheDocument()

    rerender(<OwnerTypeBadge ownerType="both" showAiDelegatable />)
    expect(screen.getByLabelText('AI 委譲可')).toBeInTheDocument()
  })

  it('hides the AI delegatable icon for non-AI owners', () => {
    render(<OwnerTypeBadge ownerType="user" showAiDelegatable />)

    expect(screen.queryByLabelText('AI 委譲可')).not.toBeInTheDocument()
  })
})
