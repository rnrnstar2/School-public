import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NextQuestionCard } from './next-question-card'

describe('NextQuestionCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the first question when no SSR initialQuestion is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            nextQuestion: {
              question: '今、何に迷っていますか？',
              choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    render(<NextQuestionCard goalId="goal-1" />)

    expect(await screen.findByText('今、何に迷っていますか？')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/goals/goal-1/next-question',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('retries refresh after a load error and shows the loading state again', async () => {
    let resolveSecondResponse: ((value: Response) => void) | null = null
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecondResponse = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              message: '次の問いの取得に失敗しました。',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
        .mockImplementationOnce(() => secondResponse),
    )

    render(<NextQuestionCard goalId="goal-1" />)

    expect(await screen.findByRole('status')).toHaveTextContent('次の問いの取得に失敗しました。')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '再生成' }))

    expect(screen.getByText('次の問いを考えています…')).toBeInTheDocument()

    if (!resolveSecondResponse) {
      throw new Error('expected deferred response resolver')
    }
    const resolvePendingSecondResponse = resolveSecondResponse as (value: Response) => void
    resolvePendingSecondResponse(
      new Response(
        JSON.stringify({
          ok: true,
          nextQuestion: {
            question: '次はどこから再開しますか？',
            choices: ['構成から', '実装から', '調査から'],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    expect(await screen.findByText('次はどこから再開しますか？')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clears stale selected answers when the initial question changes', async () => {
    const { rerender } = render(
      <NextQuestionCard
        goalId="goal-1"
        initialQuestion={{
          question: '今、何に迷っていますか？',
          choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
          freeform_hint: '補足があれば書いてください。',
        }}
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '手順が不明' }))
    expect(screen.getByRole('button', { name: '回答して進む' })).toBeEnabled()

    rerender(
      <NextQuestionCard
        goalId="goal-1"
        initialQuestion={{
          question: '次はどこから整理しますか？',
          choices: ['優先順位', '必要な情報', '最初の一歩'],
          freeform_hint: '補足があれば書いてください。',
        }}
      />,
    )

    expect(screen.getByRole('button', { name: '回答して進む' })).toBeDisabled()
  })

  it('disables submit while saving and advances to the next question', async () => {
    let resolveResponse: ((value: Response) => void) | null = null
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => pendingResponse),
    )

    render(
      <NextQuestionCard
        goalId="goal-1"
        initialQuestion={{
          question: '今、何に迷っていますか？',
          choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
          freeform_hint: '補足があれば書いてください。',
        }}
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '手順が不明' }))
    await user.click(screen.getByRole('button', { name: '回答して進む' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: '手順が不明' })).toBeDisabled()

    if (!resolveResponse) {
      throw new Error('expected deferred response resolver')
    }
    const resolvePendingResponse = resolveResponse as (value: Response) => void

    resolvePendingResponse(
      new Response(
        JSON.stringify({
          ok: true,
          contextId: 'ctx-1',
          nextQuestion: {
            question: 'その答えを踏まえて、次にどこを整理したいですか？',
            choices: ['優先順位を決めたい', '次の手順を知りたい', 'ツール選びを固めたい', '自由入力'],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    expect(
      await screen.findByText('その答えを踏まえて、次にどこを整理したいですか？'),
    ).toBeInTheDocument()
  })
})
