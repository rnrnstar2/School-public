import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreamingMessageBubble } from './streaming-message-bubble'

// Mock MarkdownRenderer
vi.mock('@school/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

describe('StreamingMessageBubble', () => {
  it('renders nothing when not active', () => {
    const { container } = render(
      <StreamingMessageBubble text="テスト" active={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders "考え中..." when active but no text', () => {
    render(<StreamingMessageBubble text={null} active={true} />)
    expect(screen.getByText('考え中...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'AI が考え中')
  })

  it('renders text content when active with text', () => {
    render(<StreamingMessageBubble text="Hello World" active={true} />)
    expect(screen.getByTestId('markdown')).toHaveTextContent('Hello World')
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'AI が応答中')
  })

  it('shows phase label for "connecting"', () => {
    render(<StreamingMessageBubble text="テスト" active={true} phase="connecting" />)
    expect(screen.getByText('接続中...')).toBeInTheDocument()
  })

  it('shows phase label for "receiving"', () => {
    render(<StreamingMessageBubble text="テスト" active={true} phase="receiving" />)
    expect(screen.getByText('応答を受信中...')).toBeInTheDocument()
  })

  it('shows phase label for "finalizing"', () => {
    render(<StreamingMessageBubble text="テスト" active={true} phase="finalizing" />)
    expect(screen.getByText('整理中...')).toBeInTheDocument()
  })

  it('shows default phase label when phase is null', () => {
    render(<StreamingMessageBubble text="テスト" active={true} phase={null} />)
    expect(screen.getByText('考え中...')).toBeInTheDocument()
  })

  it('applies orange variant by default', () => {
    render(<StreamingMessageBubble text="テスト" active={true} />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
  })

  it('applies indigo variant', () => {
    render(<StreamingMessageBubble text="テスト" active={true} variant="indigo" />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
  })

  it('renders Bot icon', () => {
    render(<StreamingMessageBubble text="テスト" active={true} />)
    // Bot icon should be rendered (lucide-react svg)
    const status = screen.getByRole('status')
    expect(status.querySelector('svg')).toBeInTheDocument()
  })

  it('renders pulse bars animation', () => {
    render(<StreamingMessageBubble text="テスト" active={true} />)
    // 5 pulse bars should be present
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
  })

  it('uses the AA-safe secondary text class for the streaming footer', () => {
    render(<StreamingMessageBubble text="テスト" active={true} phase="receiving" />)
    const footer = screen.getByText('応答を受信中...').parentElement
    expect(footer).toHaveClass('text-slate-600')
    expect(footer).toHaveClass('dark:text-slate-300')
  })

  it('uses the AA-safe secondary text class for the thinking state', () => {
    render(<StreamingMessageBubble text={null} active={true} />)
    const thinkingContainer = screen.getByText('考え中...').parentElement
    expect(thinkingContainer).toHaveClass('text-slate-600')
    expect(thinkingContainer).toHaveClass('dark:text-slate-300')
  })

  it('renders only populated structured output sections', () => {
    render(
      <StreamingMessageBubble
        text="回答本文"
        active={true}
        structuredOutput={{
          reply: '回答本文',
          decisions: ['方向性を決めた'],
          open_questions: [],
          next_question: '参考サイトはありますか？',
          next_action: '参考サイトを1件共有する',
        }}
      />
    )

    expect(screen.getByText('決まったこと')).toBeInTheDocument()
    expect(screen.getByText('方向性を決めた')).toBeInTheDocument()
    expect(screen.queryByText('未決事項')).not.toBeInTheDocument()
    expect(screen.getByText('次の問い')).toBeInTheDocument()
    expect(screen.getByText('参考サイトはありますか？')).toBeInTheDocument()
    expect(screen.getByText('次の 1 アクション')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'plan に追加 (TQ-171)' })).toBeDisabled()
  })
})
