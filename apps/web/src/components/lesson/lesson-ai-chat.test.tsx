import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LessonAiChat } from './lesson-ai-chat'

const { useSpeak2ActionCompileMock } = vi.hoisted(() => ({
  useSpeak2ActionCompileMock: vi.fn(),
}))

vi.mock('@school/ui/network-status', () => ({
  classifyError: () => 'server_error',
  getErrorMessage: () => '一時的に AI 応答の取得に失敗しました',
}))

vi.mock('@school/ui/ai-error-banner', () => ({
  AiErrorBanner: ({
    message,
    onRetry,
    retryLabel = 'もう一度送信',
  }: {
    message: string
    onRetry?: (() => void) | undefined
    retryLabel?: string
  }) => (
    <div>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock('@/components/chat/ai-response-feedback', () => ({
  AiResponseFeedback: () => null,
}))

vi.mock('@/components/chat/use-speak2action-compile', () => ({
  useSpeak2ActionCompile: useSpeak2ActionCompileMock,
}))

vi.mock('@/components/chat/mentor-action-card', () => ({
  MentorActionCard: ({ action }: { action: { type: string; reason: string } }) => (
    <div data-testid="mentor-action-card">
      {action.type}:{action.reason}
    </div>
  ),
}))

vi.mock('@/components/chat/streaming-message-bubble', () => ({
  StreamingMessageBubble: ({
    active,
    text,
  }: {
    active: boolean
    text: string | null
  }) => (active ? <div>{text ?? '考え中...'}</div> : null),
  StructuredOutputSections: ({
    structuredOutput,
  }: {
    structuredOutput?: {
      decisions?: string[]
      next_action?: string | null
    }
  }) => (
    structuredOutput ? (
      <div>
        {structuredOutput.decisions?.map((item) => (
          <div key={item}>{item}</div>
        ))}
        {structuredOutput.next_action ? <div>{structuredOutput.next_action}</div> : null}
      </div>
    ) : null
  ),
}))

vi.mock('@school/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

function createSseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')

  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    }),
  }
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

async function openLessonChatAndSendQuestion(question = 'Next.js とは何ですか？') {
  const user = userEvent.setup()

  render(
    <LessonAiChat
      lessonId="lesson-1"
      lessonTitle="Next.js の基本"
    />,
  )

  await user.click(screen.getByRole('button', { name: /レッスン内容について質問する/ }))
  fireEvent.change(screen.getByLabelText('質問を入力'), {
    target: { value: question },
  })
  await user.click(screen.getByRole('button', { name: '質問を送信' }))

  return user
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

describe('LessonAiChat', () => {
  it('preserves mentor actions when the SSE result is action-only', async () => {
    mockLessonChatFetch(() => createSseResponse([
      { event: 'actions', data: { actions: [{ type: 'recompile_plan', reason: '今の進捗に合わせて更新する' }] } },
      {
        event: 'done',
        data: {
          structuredOutput: {
            reply: '',
            decisions: [],
            open_questions: [],
            next_question: null,
            next_action: null,
          },
        },
      },
    ]).response)

    await openLessonChatAndSendQuestion('次の一手を提案して')

    await waitFor(() => {
      expect(screen.getByTestId('mentor-action-card')).toHaveTextContent(
        'recompile_plan:今の進捗に合わせて更新する',
      )
    })
    expect(screen.queryByText('応答を表示できませんでした。')).not.toBeInTheDocument()
  })

  it('renders the reply when the SSE result includes reply text', async () => {
    mockLessonChatFetch(() => createSseResponse([
      {
        event: 'done',
        data: {
          structuredOutput: {
            reply: 'Next.js は React ベースのフレームワークです。',
            decisions: [],
            open_questions: [],
            next_question: null,
            next_action: null,
          },
        },
      },
    ]).response)

    await openLessonChatAndSendQuestion()

    await waitFor(() => {
      expect(screen.getByText('Next.js は React ベースのフレームワークです。')).toBeInTheDocument()
    })
    expect(screen.queryByText('応答を表示できませんでした。')).not.toBeInTheDocument()
  })

  it('renders the placeholder when reply and actions are both empty', async () => {
    mockLessonChatFetch(() => createSseResponse([
      {
        event: 'done',
        data: {
          structuredOutput: {
            reply: '',
            decisions: [],
            open_questions: [],
            next_question: null,
            next_action: null,
          },
        },
      },
    ]).response)

    await openLessonChatAndSendQuestion()

    await waitFor(() => {
      expect(screen.getByText('応答を表示できませんでした。')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('mentor-action-card')).not.toBeInTheDocument()
  })
})
