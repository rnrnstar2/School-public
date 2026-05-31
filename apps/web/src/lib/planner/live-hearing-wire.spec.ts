import { describe, expect, it, afterEach } from 'vitest'
import { advanceHearingSessionStream } from '@/lib/planner/live-hearing-service'
import type { PlannerHearingSession } from '@/lib/planner/types'

/**
 * W57 (TQ-209 wire) — verifies that the W49 export 関数群
 * (`applyHeuristicHearingExtraction` / `inferGoalCategory` / `isVagueGoal`)
 * are wired into the production live-hearing flow:
 *
 * 1. `applyHeuristicHearingExtraction` lifts user-utterance keywords
 *    (operatingSystem 等) into answers when the LLM omits them.
 * 2. `inferGoalCategory` injects `goal_category: <X>` into the system prompt.
 * 3. `isVagueGoal` blocks completion when the goal is vague + general 系で、
 *    具体 plan-changing signal がない場合。
 */

type FetchBody = {
  stream?: boolean
  messages?: Array<{ role?: string; content?: string }>
}

const ENV_KEYS = [
  'ZAI_CODING_PLAN_API_URL',
  'ZAI_PLANNER_API_URL',
  'ZAI_PLANNER_API_KEY',
  'ZAI_API_KEY',
] as const

function createStreamingResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream)
}

function clearPlannerEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

describe('live-hearing-service W57 wires (TQ-209)', () => {
  const originalFetch = globalThis.fetch
  const originalEnv: Array<readonly [string, string | undefined]> = ENV_KEYS.map(
    (key) => [key, process.env[key]] as const,
  )

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearPlannerEnv()
    for (const [key, value] of originalEnv) {
      if (value !== undefined) {
        process.env[key] = value
      }
    }
  })

  it('inferGoalCategory: marketer-app goal injects goal_category hint into system prompt', async () => {
    clearPlannerEnv()
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const requests: FetchBody[] = []
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '最初に動かしたい機能を教えてください。',
              completed: false,
              answers: { purpose: '顧客フォローを自動化したい' },
              insights: {},
              summaryKeyPoints: ['顧客フォロー自動化'],
            }),
          },
        },
      ],
    })

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)
      return Promise.resolve(createStreamingResponse([streamChunk]))
    }) as unknown as typeof fetch

    await advanceHearingSessionStream(
      '顧客管理 CRM のフォローアップを自動化する web app を作りたい',
      null,
      null,
      () => undefined,
    )

    expect(requests.length).toBe(1)
    const systemPrompt = requests[0]?.messages?.[0]?.content ?? ''
    // wire 確認: goal_category 行が injection されている
    expect(systemPrompt).toMatch(/goal_category:\s*marketer-app/)
  })

  it('inferGoalCategory: SNS goal injects sns-batch hint', async () => {
    clearPlannerEnv()
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const requests: FetchBody[] = []
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '投稿頻度を教えてください。',
              completed: false,
              answers: {},
              insights: {},
              summaryKeyPoints: [],
            }),
          },
        },
      ],
    })

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)
      return Promise.resolve(createStreamingResponse([streamChunk]))
    }) as unknown as typeof fetch

    await advanceHearingSessionStream(
      'Instagram 投稿バッチを週次で AI 生成したい',
      null,
      null,
      () => undefined,
    )

    const systemPrompt = requests[0]?.messages?.[0]?.content ?? ''
    expect(systemPrompt).toMatch(/goal_category:\s*sns-batch/)
  })

  it('applyHeuristicHearingExtraction: lifts operatingSystem from user utterance when LLM omits it', async () => {
    clearPlannerEnv()
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    // LLM は purpose / siteBehavior / aiTools を返すが operatingSystem は返さない。
    // session.messages の user utterance に "Mac" が含まれるので、heuristic
    // wire によって answers.operatingSystem='Mac' に lift されるはず。
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '必要な前提が揃いました。プランに進みます。',
              completed: true,
              is_goal_clear: true,
              confidence: 'high',
              answers: {
                purpose: '採用担当向けのポートフォリオを 2 週間で公開したい',
                siteBehavior: '文章・画像中心の静的ページでよい',
                experience: 'ブログを少し触ったことがある',
                aiTools: 'Claude Code',
              },
              insights: {
                audience: '採用担当',
                deadline: '2週間',
              },
              summaryKeyPoints: ['採用担当向けポートフォリオ'],
            }),
          },
        },
      ],
    })

    globalThis.fetch = (() =>
      Promise.resolve(createStreamingResponse([streamChunk]))) as unknown as typeof fetch

    const priorSession: PlannerHearingSession = {
      answers: {},
      insights: {
        buildGoal: null,
        audience: null,
        deadline: null,
        projectType: null,
        constraints: [],
        preferences: [],
        mustHaveFeatures: [],
        planningFocus: [],
      },
      messages: [
        { id: 'goal', role: 'user', content: '目標: ポートフォリオサイトを作りたい' },
        { id: 'assistant-1', role: 'assistant', content: '誰に見せますか？' },
        { id: 'user-1', role: 'user', content: '採用担当に見せたい。Mac を使っています。' },
      ],
      lastQuestionId: null,
      transport: { status: 'live', label: 'ZAI coding plan', message: 'live' },
      completedAt: null,
    }

    const result = await advanceHearingSessionStream(
      'ポートフォリオサイトを作りたい',
      priorSession,
      'Claude Code を使えます。',
      () => undefined,
    )

    // wire 確認: LLM が返さなかった operatingSystem が user utterance buffer
    // から heuristic で lift されている。
    expect(result.session.answers.operatingSystem).toBe('Mac')
    // LLM が返した値は override されない (idempotent property)
    expect(result.session.answers.aiTools).toBe('Claude Code')
    expect(result.session.answers.purpose).toBe(
      '採用担当向けのポートフォリオを 2 週間で公開したい',
    )
  })

  it('isVagueGoal: vague general goal does not auto-complete on minimum fields alone', async () => {
    clearPlannerEnv()
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    // LLM は vague goal に対して core fields (purpose + siteBehavior + aiTools)
    // を埋めるが、is_goal_clear は false / completed は false で返す。
    // hasMinimumCompletionFields は wire 前なら true 相当を返してしまうが、
    // wire 後は isVagueGoal('改善', vague) かつ general カテゴリかつ
    // projectType / mustHaveFeatures / audience が空のときに false を返すこと
    // を期待する。よって completed=false のまま fallback reply に降りる。
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: 'もう少し具体に詰めましょう。最初に動かしたい機能は何ですか？',
              completed: false,
              is_goal_clear: false,
              confidence: 'low',
              answers: {
                purpose: '改善したい',
                siteBehavior: '何か動くもの',
                aiTools: 'ChatGPT',
              },
              insights: {},
              summaryKeyPoints: [],
            }),
          },
        },
      ],
    })

    globalThis.fetch = (() =>
      Promise.resolve(createStreamingResponse([streamChunk]))) as unknown as typeof fetch

    const result = await advanceHearingSessionStream(
      '数字を伸ばしたい',
      null,
      null,
      () => undefined,
    )

    // wire 確認: vague + general + 具体 signal なし → completed=false
    expect(result.completed).toBe(false)
  })
})
