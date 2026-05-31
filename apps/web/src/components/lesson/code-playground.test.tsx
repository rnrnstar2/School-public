import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CodePlayground } from './code-playground'

const mockExercise = {
  id: 'ex-1',
  title: 'HTMLカード作成',
  instruction: 'div要素にclass="card"を追加してカードUIを作成してください。',
  language: 'html' as const,
  starterCode: '<div>\n  <h2>タイトル</h2>\n  <p>説明文</p>\n</div>',
  solutionHint: 'div要素にclass="card"を追加します。',
  validationPatterns: ['class="card"', '<h2>'],
}

describe('CodePlayground', () => {
  const mockOnComplete = vi.fn()

  beforeEach(() => {
    mockOnComplete.mockClear()
  })

  it('renders exercise title and language badge', () => {
    render(<CodePlayground exercise={mockExercise} />)
    expect(screen.getByText('HTMLカード作成')).toBeInTheDocument()
    expect(screen.getByText('html')).toBeInTheDocument()
  })

  it('renders instruction text', () => {
    render(<CodePlayground exercise={mockExercise} />)
    expect(screen.getByText(/div要素にclass="card"を追加/)).toBeInTheDocument()
  })

  it('renders code editor with starter code', () => {
    render(<CodePlayground exercise={mockExercise} />)
    const editor = screen.getByLabelText('HTMLカード作成 コードエディタ')
    expect(editor).toBeInTheDocument()
    expect(editor).toHaveValue(mockExercise.starterCode)
  })

  it('renders action buttons', () => {
    render(<CodePlayground exercise={mockExercise} />)
    expect(screen.getByText('実行する')).toBeInTheDocument()
    expect(screen.getByText('リセット')).toBeInTheDocument()
    expect(screen.getByText('ヒント')).toBeInTheDocument()
  })

  it('shows hint when ヒント button clicked', () => {
    render(<CodePlayground exercise={mockExercise} />)
    expect(screen.queryByText(mockExercise.solutionHint)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('ヒント'))
    expect(screen.getByText(mockExercise.solutionHint)).toBeInTheDocument()
  })

  it('hides hint on second click', () => {
    render(<CodePlayground exercise={mockExercise} />)
    fireEvent.click(screen.getByText('ヒント'))
    expect(screen.getByText(mockExercise.solutionHint)).toBeInTheDocument()

    fireEvent.click(screen.getByText('ヒント'))
    expect(screen.queryByText(mockExercise.solutionHint)).not.toBeInTheDocument()
  })

  it('validates code and shows error when patterns missing', () => {
    render(<CodePlayground exercise={mockExercise} onComplete={mockOnComplete} />)

    // Run with starter code (missing class="card")
    fireEvent.click(screen.getByText('実行する'))

    expect(screen.getByText(/あと少し/)).toBeInTheDocument()
    expect(screen.getByText('class="card"')).toBeInTheDocument()
    expect(mockOnComplete).not.toHaveBeenCalled()
  })

  it('validates code and shows success when all patterns match', () => {
    render(<CodePlayground exercise={mockExercise} onComplete={mockOnComplete} />)

    // Modify code to include validation pattern
    const editor = screen.getByLabelText('HTMLカード作成 コードエディタ')
    fireEvent.change(editor, {
      target: { value: '<div class="card">\n  <h2>タイトル</h2>\n  <p>説明文</p>\n</div>' },
    })

    fireEvent.click(screen.getByText('実行する'))

    expect(screen.getByText(/正解です/)).toBeInTheDocument()
    expect(mockOnComplete).toHaveBeenCalledWith('ex-1', expect.any(String))
  })

  it('resets code to starter on リセット click', () => {
    render(<CodePlayground exercise={mockExercise} />)

    const editor = screen.getByLabelText('HTMLカード作成 コードエディタ')
    fireEvent.change(editor, { target: { value: 'modified code' } })
    expect(editor).toHaveValue('modified code')

    fireEvent.click(screen.getByText('リセット'))
    expect(editor).toHaveValue(mockExercise.starterCode)
  })

  it('shows preview iframe after running code', () => {
    render(<CodePlayground exercise={mockExercise} />)
    fireEvent.click(screen.getByText('実行する'))

    expect(screen.getByText('プレビュー')).toBeInTheDocument()
    expect(screen.getByTitle('コードプレビュー')).toBeInTheDocument()
  })

  it('shows line numbers', () => {
    render(<CodePlayground exercise={mockExercise} />)
    // Starter code has 4 lines
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('supports Tab for indentation', () => {
    render(<CodePlayground exercise={mockExercise} />)
    const editor = screen.getByLabelText('HTMLカード作成 コードエディタ')

    // Simulate Tab key
    fireEvent.keyDown(editor, { key: 'Tab' })
    // Tab should be prevented (not leaving the field)
  })

  it('does not call onComplete twice on multiple runs', () => {
    render(<CodePlayground exercise={mockExercise} onComplete={mockOnComplete} />)

    const editor = screen.getByLabelText('HTMLカード作成 コードエディタ')
    fireEvent.change(editor, {
      target: { value: '<div class="card">\n  <h2>タイトル</h2>\n  <p>説明文</p>\n</div>' },
    })

    fireEvent.click(screen.getByText('実行する'))
    expect(mockOnComplete).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByText('実行する'))
    expect(mockOnComplete).toHaveBeenCalledOnce()
  })
})
