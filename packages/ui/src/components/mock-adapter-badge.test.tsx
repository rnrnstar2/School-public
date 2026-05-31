import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MockAdapterBadge } from './mock-adapter-badge'

describe('MockAdapterBadge', () => {
  it('renders nothing when mode=external and status=live', () => {
    const { container } = render(<MockAdapterBadge mode="external" status="live" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders mock label when mode=mock', () => {
    render(<MockAdapterBadge mode="mock" status="fallback" />)
    expect(screen.getByText('ローカル応答（AI非使用）')).toBeInTheDocument()
    expect(screen.getByText(/この応答はAIではなくローカルロジックで生成/)).toBeInTheDocument()
  })

  it('renders fallback label when mode=external and status=fallback', () => {
    render(<MockAdapterBadge mode="external" status="fallback" />)
    expect(screen.getByText('フォールバック応答')).toBeInTheDocument()
    expect(screen.getByText(/AI APIが利用できないため/)).toBeInTheDocument()
  })

  it('renders unavailable label when mode=external and status=unavailable', () => {
    render(<MockAdapterBadge mode="external" status="unavailable" />)
    expect(screen.getByText('AI 未接続')).toBeInTheDocument()
    expect(screen.getByText('AI APIが設定されていません。')).toBeInTheDocument()
  })

  it('has correct role=status for accessibility', () => {
    render(<MockAdapterBadge mode="mock" status="fallback" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has correct aria-label', () => {
    render(<MockAdapterBadge mode="mock" status="fallback" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'ローカル応答（AI非使用）')
  })

  it('applies custom className', () => {
    render(<MockAdapterBadge mode="mock" status="fallback" className="custom-class" />)
    expect(screen.getByRole('status').className).toContain('custom-class')
  })
})
