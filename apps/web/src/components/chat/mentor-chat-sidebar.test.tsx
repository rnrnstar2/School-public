import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useSpeak2ActionCompileMock } = vi.hoisted(() => ({
  useSpeak2ActionCompileMock: vi.fn(),
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      if (typeof prop !== 'string') {
        return undefined
      }

      function MockMotionComponent({
        children,
        ...props
      }: { children?: React.ReactNode; [key: string]: unknown }) {
        const filteredProps: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(props)) {
          if (!['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId'].includes(key)) {
            filteredProps[key] = value
          }
        }

        const Tag = prop as keyof React.JSX.IntrinsicElements
        return <Tag {...filteredProps}>{children}</Tag>
      }

      MockMotionComponent.displayName = `MockMotion.${prop}`
      return MockMotionComponent
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/chat/use-speak2action-compile', () => ({
  useSpeak2ActionCompile: useSpeak2ActionCompileMock,
}))

import { MentorChatSidebar } from './mentor-chat-sidebar'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('MentorChatSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    useSpeak2ActionCompileMock.mockReset()
    useSpeak2ActionCompileMock.mockReturnValue({
      toast: null,
      resetRound: vi.fn(),
      compileStructuredOutput: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ questions: [] }))))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses mentor chat compile targeting by default', () => {
    render(<MentorChatSidebar open={true} onClose={() => {}} />)

    expect(useSpeak2ActionCompileMock).toHaveBeenCalled()
    expect(useSpeak2ActionCompileMock.mock.calls[0]?.[0]).toMatchObject({
      sourceKind: 'mentor_chat',
    })
    expect(useSpeak2ActionCompileMock.mock.calls[0]?.[0]).toHaveProperty('lessonId', undefined)
  })

  it('switches compile targeting to lesson chat when lesson context is opened', async () => {
    render(<MentorChatSidebar open={true} onClose={() => {}} />)

    window.dispatchEvent(new CustomEvent('open-mentor-chat', {
      detail: {
        lesson: {
          id: 'lesson-42',
          title: 'SSR入門',
        },
      },
    }))

    await waitFor(() => {
      expect(screen.getByText('SSR入門')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        useSpeak2ActionCompileMock.mock.calls
          .map(([options]) => options)
          .some((options) => options.sourceKind === 'lesson_chat' && options.lessonId === 'lesson-42'),
      ).toBe(true)
    })
  })
})
