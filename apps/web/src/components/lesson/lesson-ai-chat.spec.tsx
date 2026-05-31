/**
 * LessonAiChat — W16-C BudgetCapBanner wiring spec.
 *
 * `/api/mentor/session` SSE が `event: error` で `mentor_budget_cap_exceeded`
 * を返したとき、BudgetCapBanner を render することを保証する。既存
 * `lesson-ai-chat.test.tsx` には触らず、追加の banner 表示条件のみ検証する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useSpeak2ActionCompileMock } = vi.hoisted(() => ({
  useSpeak2ActionCompileMock: vi.fn(),
}))

vi.mock('@school/ui/network-status', () => ({
  classifyError: () => 'server_error',
  getErrorMessage: () => '一時的に AI 応答の取得に失敗しました',
}))

vi.mock('@school/ui/ai-error-banner', () => ({
  AiErrorBanner: () => null,
}))

vi.mock('@/components/chat/ai-response-feedback', () => ({
  AiResponseFeedback: () => null,
}))

vi.mock('@/components/chat/use-speak2action-compile', () => ({
  useSpeak2ActionCompile: useSpeak2ActionCompileMock,
}))

vi.mock('@/components/chat/mentor-action-card', () => ({
  MentorActionCard: () => <div data-testid="mentor-action-card" />,
}))

vi.mock('@/components/chat/streaming-message-bubble', () => ({
  StreamingMessageBubble: () => null,
  StructuredOutputSections: () => null,
}))

vi.mock('@school/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

import { LessonAiChat } from './lesson-ai-chat'

function createSseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

function mockLessonChatFetch(chatResponseFactory: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/mentor/session?goal=')) {
      return Promise.resolve(new Response(
        JSON.stringify({ session: null }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ))
    }

    if (url === '/api/mentor/session') {
      return Promise.resolve(chatResponseFactory())
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))
}

beforeEach(() => {
  useSpeak2ActionCompileMock.mockReset()
  useSpeak2ActionCompileMock.mockReturnValue({
    toast: null,
    resetRound: vi.fn(),
    compileStructuredOutput: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LessonAiChat — BudgetCapBanner wiring (W16-C)', () => {
  it('does not render the BudgetCapBanner before any cap event arrives', async () => {
    const user = userEvent.setup()
    render(<LessonAiChat lessonId="lesson-1" lessonTitle="Next.js の基本" />)

    await user.click(
      screen.getByRole('button', { name: /レッスン内容について質問する/ }),
    )

    expect(screen.queryByTestId('mentor-budget-cap-banner')).not.toBeInTheDocument()
  })

  it('renders the BudgetCapBanner when SSE error is mentor_budget_cap_exceeded', async () => {
    mockLessonChatFetch(() =>
      createSseResponse([
        {
          event: 'error',
          data: {
            error: 'mentor_budget_cap_exceeded',
            message: '今月のメンター利用上限に達しました。',
            cap: {
              userId: 'user-1',
              currentUsd: 4.83,
              capUsd: 5,
              estimateUsd: 0.4,
            },
          },
        },
      ]),
    )

    const user = userEvent.setup()
    render(<LessonAiChat lessonId="lesson-1" lessonTitle="Next.js の基本" />)

    await user.click(
      screen.getByRole('button', { name: /レッスン内容について質問する/ }),
    )
    fireEvent.change(screen.getByLabelText('質問を入力'), {
      target: { value: 'Next.js とは何ですか？' },
    })
    await user.click(screen.getByRole('button', { name: '質問を送信' }))

    await waitFor(() => {
      expect(screen.getByTestId('mentor-budget-cap-banner')).toBeInTheDocument()
    })
    expect(screen.getByTestId('cap-cap')).toHaveTextContent('$5.00')
    expect(screen.getByTestId('cap-used')).toHaveTextContent('$4.83')
  })
})
