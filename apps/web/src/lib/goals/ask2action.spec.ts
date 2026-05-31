import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  fetchWithRetryMock: vi.fn(),
  withAiMetricsMock: vi.fn(),
  getExternalPlannerConfigMock: vi.fn(),
  linkContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: mocks.fetchWithRetryMock,
}))

vi.mock('@/lib/observability/ai-metrics', () => ({
  withAiMetrics: mocks.withAiMetricsMock,
}))

vi.mock('@/lib/planner/zai', () => ({
  getExternalPlannerConfig: mocks.getExternalPlannerConfigMock,
}))

vi.mock('@/lib/supabase/decision-ledger', () => ({
  linkContext: mocks.linkContextMock,
}))

const {
  generateAsk2ActionNextQuestion,
  resolveAsk2ActionGoalId,
  saveAsk2ActionAnswer,
} = await import('./ask2action')

function makeServiceClient(options?: {
  goals?: Array<{
    id: string
    user_id: string
    title: string
    description: string | null
    metadata: Record<string, unknown>
  }>
}) {
  const goal = {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'ポートフォリオサイトを公開する',
    description: 'トップページを形にする',
    metadata: {},
  }
  const goals = options?.goals ?? [goal]
  const nodes = [
    {
      id: 'node-1',
      goal_id: 'goal-1',
      label: 'トップページの構成を決める',
      node_type: 'task',
      status: 'in_progress',
      owner_type: 'user',
      sort_order: 1,
      created_at: '2026-04-19T00:00:00.000Z',
    },
  ]
  const goalContexts = [
    {
      id: 'ctx-1',
      goal_id: 'goal-1',
      node_id: null,
      source_type: 'doc',
      source_uri: null,
      content: '完成形は LP 1 枚にする',
      metadata: {},
      freshness_at: null,
      created_at: '2026-04-19T00:00:00.000Z',
    },
  ]
  const learnerState = {
    user_id: 'user-1',
    target_outcome: '公開 URL を出す',
    skill_level: 'beginner',
    blockers: ['手順が不明'],
  }
  const mentorMemories = [
    {
      id: 'memory-1',
      user_id: 'user-1',
      title: 'hero を先に決める',
      bullets: ['ファーストビューから固める'],
      created_at: '2026-04-19T00:00:00.000Z',
    },
  ]

  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'goals') {
          const filters = new Map<string, unknown>()
          const resolveGoalsResult = () => ({
            data:
              typeof filters.get('user_id') === 'string'
                ? goals.filter((candidate) => candidate.user_id === filters.get('user_id'))
                : goals,
            error: null,
          })
          const builder = {
            select: () => builder,
            eq: (column: string, value: unknown) => {
              filters.set(column, value)
              return builder
            },
            order: () => builder,
            limit: () => builder,
            maybeSingle: async () => ({
              data: goals.find((candidate) => candidate.id === filters.get('id')) ?? null,
              error: null,
            }),
            then: <TResult1 = ReturnType<typeof resolveGoalsResult>, TResult2 = never>(
              onFulfilled?: ((value: ReturnType<typeof resolveGoalsResult>) => TResult1 | PromiseLike<TResult1>) | null,
              onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) => Promise.resolve(resolveGoalsResult()).then(onFulfilled, onRejected),
          }

          return {
            select: () => builder,
          }
        }

        if (table === 'goal_nodes') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: async () => ({
                    data: nodes,
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'goal_contexts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: goalContexts,
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        throw new Error(`unexpected ledger table ${table}`)
      },
    }),
    from: (table: string) => {
      if (table === 'learner_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: learnerState,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'mentor_memory') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: mentorMemories,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`unexpected public table ${table}`)
    },
  }
}

describe('ask2action goal service', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.createServiceClientMock.mockReturnValue(makeServiceClient())
    mocks.withAiMetricsMock.mockImplementation(async (_options, fn) => fn())
    mocks.linkContextMock.mockResolvedValue({
      data: { id: 'ask2action-context-1' },
      error: null,
    })
  })

  it('returns an AI-generated next question when the response matches the schema', async () => {
    mocks.getExternalPlannerConfigMock.mockReturnValue({
      available: true,
      endpoint: 'https://example.test/ai',
      apiKey: 'test-key',
      model: 'glm-test',
    })
    mocks.fetchWithRetryMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: 'どこから進めると一番ラクですか？',
                choices: ['構成を決める', '実装を始める', '参考を集める'],
                freeform_hint: '選択肢にない迷いがあれば 1 文で書いてください。',
              }),
            },
          },
        ],
      }),
    })

    const result = await generateAsk2ActionNextQuestion({
      userId: 'user-1',
      goalId: 'goal-1',
    })

    expect(result).toEqual({
      kind: 'ok',
      nextQuestion: {
        question: 'どこから進めると一番ラクですか？',
        choices: ['構成を決める', '実装を始める', '参考を集める'],
        freeform_hint: '選択肢にない迷いがあれば 1 文で書いてください。',
      },
      usedFallback: false,
    })
    expect(mocks.fetchWithRetryMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default question when AI output is invalid', async () => {
    mocks.getExternalPlannerConfigMock.mockReturnValue({
      available: true,
      endpoint: 'https://example.test/ai',
      apiKey: 'test-key',
      model: 'glm-test',
    })
    mocks.fetchWithRetryMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not-json' } }],
      }),
    })

    const result = await generateAsk2ActionNextQuestion({
      userId: 'user-1',
      goalId: 'goal-1',
    })

    expect(result).toEqual({
      kind: 'ok',
      nextQuestion: {
        question: '今、何に迷っていますか？',
        choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
        freeform_hint: '選択肢にない場合は、今止まっている理由をそのまま書いてください。',
      },
      usedFallback: true,
    })
  })

  it('returns null when plan id and normalized goal text both miss', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      makeServiceClient({
        goals: [
          {
            id: 'goal-latest',
            user_id: 'user-1',
            title: '古い目標',
            description: null,
            metadata: {
              plan_id: 'plan-old',
            },
          },
          {
            id: 'goal-older',
            user_id: 'user-1',
            title: 'さらに古い目標',
            description: null,
            metadata: {},
          },
        ],
      }),
    )

    const result = await resolveAsk2ActionGoalId({
      userId: 'user-1',
      planId: 'plan-missing',
      goalText: '一致しない新しい目標',
    })

    expect(result).toBeNull()
  })

  it('stores ask2action answers in goal_contexts and returns the follow-up question', async () => {
    mocks.getExternalPlannerConfigMock.mockReturnValue({
      available: false,
      reason: 'missing key',
    })

    const result = await saveAsk2ActionAnswer({
      userId: 'user-1',
      goalId: 'goal-1',
      questionText: '今、何に迷っていますか？',
      answer: '手順が不明',
      answerKind: 'choice',
    })

    expect(result).toMatchObject({
      kind: 'ok',
      contextId: 'ask2action-context-1',
      nextQuestion: {
        question: 'その答えを踏まえて、次にどこを整理したいですか？',
      },
      usedFallback: true,
    })
    expect(mocks.linkContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_id: 'goal-1',
        source_type: 'ask2action_answer',
        content: JSON.stringify({
          question: '今、何に迷っていますか？',
          answer: '手順が不明',
        }),
        metadata: expect.objectContaining({
          choice: '手順が不明',
        }),
      }),
    )
  })
})
