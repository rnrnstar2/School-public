import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GoalTreeGoal, GoalTreeNode } from '@/types/goal-tree'

import { useSpeak2ActionCompile } from './use-speak2action-compile'

function createNode(overrides: Partial<GoalTreeNode> = {}): GoalTreeNode {
  return {
    id: 'node-1',
    parent_node_id: null,
    label: 'Task',
    node_type: 'task',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    selected_lesson: null,
    ...overrides,
  }
}

function createGoal(overrides: Partial<GoalTreeGoal> = {}): GoalTreeGoal {
  return {
    id: 'goal-1',
    title: 'Goal',
    status: 'active',
    created_at: '2026-04-19T00:00:00.000Z',
    deadline: null,
    nodes: [],
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const structuredOutput = {
  reply: '整理しました',
  decisions: ['まず課題を分解する'],
  open_questions: [],
  next_question: null,
  next_action: '課題一覧をメモに書き出す',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useSpeak2ActionCompile', () => {
  it('keeps mentor chat targeting on the active goal by default', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/goals/me') {
        return Promise.resolve(jsonResponse({
          goals: [
            createGoal({
              id: 'goal-active',
              status: 'active',
              nodes: [createNode({ id: 'active-task' })],
            }),
            createGoal({
              id: 'goal-paused',
              status: 'paused',
              nodes: [createNode({ id: 'paused-task' })],
            }),
          ],
        }))
      }

      if (url === '/api/goals/goal-active/chat/compile') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toMatchObject({
          chatContext: {
            nodeId: 'active-task',
            source: 'mentor_chat:/',
          },
          structuredOutput,
        })

        return Promise.resolve(jsonResponse({
          ok: true,
          inserted: {
            decisions: 1,
            openQuestions: 0,
            taskNodeId: 'task-1',
          },
          error: [],
        }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSpeak2ActionCompile({
      sourceKind: 'mentor_chat',
    }))

    let payload: Awaited<ReturnType<typeof result.current.compileStructuredOutput>> = null
    await act(async () => {
      payload = await result.current.compileStructuredOutput(structuredOutput)
    })

    expect(payload).toMatchObject({
      ok: true,
      inserted: {
        decisions: 1,
        openQuestions: 0,
        taskNodeId: 'task-1',
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/goals/goal-paused/chat/compile', expect.anything())
  })

  it('resolves lesson chat target goal and node from the lesson mapping', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/goals/me') {
        return Promise.resolve(jsonResponse({
          goals: [
            createGoal({
              id: 'goal-active',
              status: 'active',
              nodes: [createNode({ id: 'active-task' })],
            }),
            createGoal({
              id: 'goal-lesson',
              status: 'paused',
              nodes: [
                createNode({
                  id: 'lesson-node',
                  selected_lesson: {
                    lesson_id: 'lesson-42',
                    score: 0.9,
                    rationale: null,
                  },
                }),
              ],
            }),
          ],
        }))
      }

      if (url === '/api/goals/goal-lesson/chat/compile') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toMatchObject({
          chatContext: {
            nodeId: 'lesson-node',
            source: 'lesson_chat:/lessons/lesson-42',
          },
          structuredOutput,
        })

        return Promise.resolve(jsonResponse({
          ok: true,
          inserted: {
            decisions: 1,
            openQuestions: 0,
            taskNodeId: 'task-1',
          },
          error: [],
        }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSpeak2ActionCompile({
      sourceKind: 'lesson_chat',
      lessonId: 'lesson-42',
    }))

    let payload: Awaited<ReturnType<typeof result.current.compileStructuredOutput>> = null
    await act(async () => {
      payload = await result.current.compileStructuredOutput(structuredOutput)
    })

    expect(payload).toMatchObject({
      ok: true,
      inserted: {
        decisions: 1,
        openQuestions: 0,
        taskNodeId: 'task-1',
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/goals/goal-active/chat/compile', expect.anything())
  })

  it('shows a warning and skips compile when no lesson mapping can be resolved', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/goals/me') {
        return Promise.resolve(jsonResponse({
          goals: [
            createGoal({
              id: 'goal-active',
              nodes: [createNode({ id: 'active-task' })],
            }),
          ],
        }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSpeak2ActionCompile({
      sourceKind: 'lesson_chat',
      lessonId: 'lesson-missing',
    }))

    await act(async () => {
      await result.current.compileStructuredOutput(structuredOutput)
    })

    await waitFor(() => {
      expect(result.current.toast).toEqual({
        tone: 'warning',
        message: '関連する goal が見つかりませんでした。',
      })
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('allows retry after goal lookup cannot resolve', async () => {
    let goalFetchCount = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/goals/me') {
        goalFetchCount += 1

        if (goalFetchCount === 1) {
          return Promise.resolve(new Response(null, { status: 500 }))
        }

        return Promise.resolve(jsonResponse({
          goals: [
            createGoal({
              id: 'goal-lesson',
              nodes: [
                createNode({
                  id: 'lesson-node',
                  selected_lesson: {
                    lesson_id: 'lesson-42',
                    score: 0.9,
                    rationale: null,
                  },
                }),
              ],
            }),
          ],
        }))
      }

      if (url === '/api/goals/goal-lesson/chat/compile') {
        return Promise.resolve(jsonResponse({
          ok: true,
          inserted: {
            decisions: 1,
            openQuestions: 0,
          },
          error: [],
        }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSpeak2ActionCompile({
      sourceKind: 'lesson_chat',
      lessonId: 'lesson-42',
    }))

    await act(async () => {
      await result.current.compileStructuredOutput(structuredOutput)
    })
    await act(async () => {
      await result.current.compileStructuredOutput(structuredOutput)
    })

    expect(goalFetchCount).toBe(2)
    expect(fetchMock).toHaveBeenCalledWith('/api/goals/goal-lesson/chat/compile', expect.anything())
  })

  it('dedupes duplicate compile fires while a round is already in flight', async () => {
    const goalsResponse = createDeferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/goals/me') {
        return goalsResponse.promise
      }

      if (url === '/api/goals/goal-lesson/chat/compile') {
        return Promise.resolve(jsonResponse({
          ok: true,
          inserted: {
            decisions: 1,
            openQuestions: 0,
          },
          error: [],
        }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSpeak2ActionCompile({
      sourceKind: 'lesson_chat',
      lessonId: 'lesson-42',
    }))

    const firstCall = result.current.compileStructuredOutput(structuredOutput)
    const secondCall = result.current.compileStructuredOutput(structuredOutput)

    expect(fetchMock).toHaveBeenCalledTimes(1)

    goalsResponse.resolve(jsonResponse({
      goals: [
        createGoal({
          id: 'goal-lesson',
          nodes: [
            createNode({
              id: 'lesson-node',
              selected_lesson: {
                lesson_id: 'lesson-42',
                score: 0.9,
                rationale: null,
              },
            }),
          ],
        }),
      ],
    }))

    await act(async () => {
      await Promise.all([firstCall, secondCall])
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
