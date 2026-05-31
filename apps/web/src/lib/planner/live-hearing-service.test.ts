import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceHearingSession,
  advanceHearingSessionStream,
  applyHeuristicHearingExtraction,
  inferGoalCategory,
  isVagueGoal,
  probeZaiHearingHealth,
} from '@/lib/planner/live-hearing-service'
import type {
  PlannerConversationMessage,
  PlannerHearingAnswers,
  PlannerHearingInsights,
  PlannerHearingSession,
} from '@/lib/planner/types'

type FetchBody = {
  stream?: boolean
  messages?: Array<{ role?: string; content?: string }>
}

type HealthCheckRequestBody = {
  max_tokens?: number
  response_format?: { type?: string }
  messages?: Array<{ content?: string }>
}

const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']

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

function createJsonResponse(payload: unknown, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json')

  return new Response(JSON.stringify(payload), {
    headers: responseHeaders,
  })
}

function clearPlannerEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function withPlannerEnv<T>(fn: () => T | Promise<T>) {
  const originalValues: Array<[string, string | undefined]> = ENV_KEYS.map((key) => [key, process.env[key]])

  clearPlannerEnv()

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of originalValues) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test('advanceHearingSessionStream sends open-ended chat messages and parses new hearing structured output', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requests: FetchBody[] = []
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '採用担当向けのポートフォリオですね。使う PC の OS と、今使える AI ツールがあれば教えてください。',
              completed: true,
              answers: {
                purpose: '採用担当向けのポートフォリオを 2 週間で公開したい',
                siteBehavior: '文章・画像中心の静的ページでよい',
                experience: 'ブログを少し触ったことがある',
                operatingSystem: 'Mac',
                aiTools: 'Claude Code',
              },
              insights: {
                audience: '採用担当',
                deadline: '2週間',
                preferences: ['AIを使って実装を進めたい'],
              },
              summaryKeyPoints: [
                '採用担当向けのポートフォリオを 2 週間で公開したい',
                'Mac と Claude Code を使える',
              ],
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

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream('ポートフォリオサイトを作りたい', null, null, () => undefined)

    assert.equal(result.session.transport.status, 'live')
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.stream, true)
    assert.equal(requests[0]?.messages?.[0]?.role, 'system')
    assert.equal(requests[0]?.messages?.[1]?.role, 'user')
    assert.match(requests[0]?.messages?.[0]?.content ?? '', /固定順の質問は禁止/)
    assert.equal(result.completed, true)
    assert.equal(result.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
	    assert.deepEqual(result.session.answers, {
	      experience: 'ブログを少し触ったことがある',
	      purpose: '採用担当向けのポートフォリオを 2 週間で公開したい',
	      siteBehavior: '文章・画像中心の静的ページでよい',
	      operatingSystem: 'Mac',
	      aiTools: 'Claude Code',
	    })
    const summaryKeyPoints = (result.session as PlannerHearingSession & { summaryKeyPoints?: string[] }).summaryKeyPoints ?? []
    assert.equal(summaryKeyPoints.includes('採用担当向けのポートフォリオを 2 週間で公開したい'), true)
    assert.equal(summaryKeyPoints.includes('Mac と Claude Code を使える'), true)
    assert.equal(summaryKeyPoints.includes('目的: 採用担当向けのポートフォリオを 2 週間で公開したい'), true)
    assert.equal(summaryKeyPoints.includes('期限: 2週間'), true)
    assert.deepEqual(result.structuredOutput, {
      reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
      phase: 'coaching',
      actions: [],
      decisions: ['hearing の前提整理が完了した'],
      open_questions: [],
      next_question: null,
      next_action: 'ヒアリング内容を確認してプランを作成する',
    })
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream uses fast intake without live fetch when requested', async () => {
  const originalFetch = globalThis.fetch
  const originalFastIntakeFlag = process.env.MENTOR_FAST_INTAKE_FALLBACK
  try {
    let fetchCalls = 0
    const events: Array<{ type: string; text?: string }> = []

    globalThis.fetch = (() => {
      fetchCalls += 1
      throw new Error('fast intake should not call live fetch')
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'
    process.env.MENTOR_FAST_INTAKE_FALLBACK = '1'

    const first = await advanceHearingSessionStream(
      '自分のWebアプリを作りたい',
      null,
      null,
      (event) => {
        events.push(event)
      },
      null,
      { allowFallback: false, preferFastIntake: true },
    )

    assert.equal(fetchCalls, 0)
    assert.equal(first.completed, false)
    assert.equal(first.session.transport.status, 'live')
    assert.equal(first.session.transport.label, 'AIメンター')
    assert.equal(first.session.lastQuestionId, 'purpose')
    assert.match(first.session.messages.at(-1)?.content ?? '', /機能/)
    assert.doesNotMatch(first.session.messages.at(-1)?.content ?? '', /誰に見てもらう|期限/)
    assert.equal(events.some((event) => event.type === 'transport'), true)
    assert.equal(events.some((event) => event.type === 'text-delta'), true)

    const second = await advanceHearingSessionStream(
      '自分のWebアプリを作りたい',
      first.session,
      'タスク管理機能を作りたい',
      undefined,
      null,
      { allowFallback: false, preferFastIntake: true },
    )

    assert.equal(second.completed, true)
    assert.equal(second.session.lastQuestionId, null)
    assert.equal(second.session.answers.purpose, 'タスク管理機能を作りたい')
    assert.equal(second.session.answers.siteBehavior, 'Webアプリとして動かしたい')
    assert.equal(second.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
    if (originalFastIntakeFlag === undefined) {
      delete process.env.MENTOR_FAST_INTAKE_FALLBACK
    } else {
      process.env.MENTOR_FAST_INTAKE_FALLBACK = originalFastIntakeFlag
    }
  }
})

test('fast intake hydrates answers from previous live-style hearing messages', async () => {
  const originalFetch = globalThis.fetch
  const originalFastIntakeFlag = process.env.MENTOR_FAST_INTAKE_FALLBACK
  try {
    let fetchCalls = 0

    globalThis.fetch = (() => {
      fetchCalls += 1
      throw new Error('fast intake should not call live fetch')
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'
    process.env.MENTOR_FAST_INTAKE_FALLBACK = '1'

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
        { id: 'goal', role: 'user', content: '目標: AIでポートフォリオやホームページを作りたい' },
        { id: 'assistant-1', role: 'assistant', content: '誰に見てもらう予定ですか？' },
        { id: 'user-1', role: 'user', content: '銀行などの取引先に見てもらう予定です。' },
        { id: 'assistant-2', role: 'assistant', content: 'いつまでに公開したいですか？' },
        { id: 'user-2', role: 'user', content: '特に期限はありません。' },
      ],
      lastQuestionId: null,
      transport: { status: 'live', label: 'ZAI coding plan', message: 'live' },
      completedAt: null,
    }

    const result = await advanceHearingSessionStream(
      'AIでポートフォリオやホームページを作りたい',
      priorSession,
      '初めてです。Mac で作業します。',
      undefined,
      null,
      { allowFallback: false, preferFastIntake: true },
    )

    assert.equal(fetchCalls, 0)
    assert.equal(result.completed, true)
    assert.equal(result.session.lastQuestionId, null)
    assert.equal(result.session.answers.purpose, '銀行などの取引先に見てもらう予定です。')
    assert.equal(result.session.answers.operatingSystem, 'Mac')
    assert.equal(result.session.answers.experience, '全くの初めてで、パソコンで何かを作った経験はほとんどない')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
    if (originalFastIntakeFlag === undefined) {
      delete process.env.MENTOR_FAST_INTAKE_FALLBACK
    } else {
      process.env.MENTOR_FAST_INTAKE_FALLBACK = originalFastIntakeFlag
    }
  }
})

test('advanceHearingSessionStream ignores preferFastIntake when MENTOR_FAST_INTAKE_FALLBACK env is not set (TQ-210 default)', async () => {
  const originalFetch = globalThis.fetch
  const originalFastIntakeFlag = process.env.MENTOR_FAST_INTAKE_FALLBACK
  try {
    delete process.env.MENTOR_FAST_INTAKE_FALLBACK

    const requests: FetchBody[] = []
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: 'ありがとうございます。最初に動かしたい機能を教えてください。',
              completed: false,
              answers: { purpose: '自分のWebアプリ' },
              insights: {},
              summaryKeyPoints: ['Webアプリ作成'],
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

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      '自分のWebアプリを作りたい',
      null,
      null,
      () => undefined,
      null,
      { allowFallback: false, preferFastIntake: true },
    )

    // Live AI was actually invoked even though preferFastIntake was passed.
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.stream, true)
    assert.equal(requests[0]?.messages?.[0]?.role, 'system')
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.session.transport.label, 'ZAI coding plan')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
    if (originalFastIntakeFlag === undefined) {
      delete process.env.MENTOR_FAST_INTAKE_FALLBACK
    } else {
      process.env.MENTOR_FAST_INTAKE_FALLBACK = originalFastIntakeFlag
    }
  }
})

test('advanceHearingSessionStream retries with non-stream request when streaming chunk is unparsable', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requests: FetchBody[] = []
    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)

      if (body.stream) {
        return Promise.resolve(createStreamingResponse(['this-is-not-json-stream']))
      }

      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
                  completed: false,
                  answers: {
                    purpose: 'まだ未定',
                  },
                  insights: {
                    planningFocus: ['scope'],
                  },
                  summaryKeyPoints: ['まだ目的の詳細が未定'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream('予約フォームを作りたい', null, null, () => undefined)

    assert.equal(requests.length, 2)
    assert.equal(requests[0]?.stream, true)
    assert.equal(requests[1]?.stream, false)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.completed, true)
    assert.equal(result.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
    assert.deepEqual(result.structuredOutput, {
      reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
      phase: 'coaching',
      actions: [],
      decisions: ['hearing の前提整理が完了した'],
      open_questions: [],
      next_question: null,
      next_action: 'ヒアリング内容を確認してプランを作成する',
    })
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream retries a failed live turn up to twice before succeeding', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  try {
    const requests: FetchBody[] = []
    const warnings: unknown[][] = []
    let attempts = 0
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
              completed: true,
              answers: {
                purpose: '採用担当向けのポートフォリオを 2 週間で公開したい',
                siteBehavior: '文章・画像中心の静的ページでよい',
                experience: 'ブログを少し触ったことがある',
                operatingSystem: 'Mac',
                aiTools: 'Claude Code',
              },
              insights: {
                audience: '採用担当',
                deadline: '2週間',
              },
              summaryKeyPoints: ['採用担当向けのポートフォリオを 2 週間で公開したい'],
            }),
          },
        },
      ],
    })

    console.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof console.warn

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)
      attempts += 1

      if (attempts <= 2) {
        return Promise.reject(new Error(`temporary live failure ${attempts}`))
      }

      return Promise.resolve(createStreamingResponse([streamChunk]))
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream('ポートフォリオサイトを作りたい', null, null, () => undefined)

    assert.equal(requests.length, 3)
    assert.equal(requests[0]?.stream, true)
    assert.equal(requests[1]?.stream, true)
    assert.equal(requests[2]?.stream, true)
    const retryWarnings = warnings.filter((entry) => entry?.[0] === '[hearing] live turn retry')
    assert.equal(retryWarnings.length, 2)
    const firstWarningMeta = retryWarnings[0]?.[1] as { error: Error; attempt: number }
    const secondWarningMeta = retryWarnings[1]?.[1] as { error: Error; attempt: number }
    assert.equal(firstWarningMeta.error.message, 'temporary live failure 1')
    assert.equal(firstWarningMeta.attempt, 1)
    assert.equal(secondWarningMeta.error.message, 'temporary live failure 2')
    assert.equal(secondWarningMeta.attempt, 2)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.completed, true)
    assert.equal(result.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream falls back after exhausting three attempts', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  try {
    const requests: FetchBody[] = []
    const warnings: unknown[][] = []
    let attempts = 0

    console.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof console.warn

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)
      attempts += 1

      return Promise.reject(new Error(`transient failure ${attempts}`))
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream('自分のWebアプリを作りたい', null, null, () => undefined)

    assert.equal(requests.length, 3)
    for (const request of requests) {
      assert.equal(request?.stream, true)
    }
    const retryWarnings = warnings.filter((entry) => entry?.[0] === '[hearing] live turn retry')
    assert.equal(retryWarnings.length, 3)
    const firstWarningMeta = retryWarnings[0]?.[1] as { error: Error; attempt: number }
    assert.equal(firstWarningMeta.error.message, 'transient failure 1')
    assert.equal(firstWarningMeta.attempt, 1)
    assert.equal(result.session.transport.status, 'fallback')
    assert.equal(result.session.transport.message, 'transient failure 3')
    assert.equal(result.completed, false)
    assert.equal(result.session.lastQuestionId, 'purpose')
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSession salvages answer patch when JSON parse fails via text-mode fallback', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requests: FetchBody[] = []
    let calls = 0
    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody & {
        response_format?: { type?: string }
      }
      requests.push(body)
      calls += 1

      if (calls === 1) {
        return Promise.resolve(
          createJsonResponse({
            choices: [
              {
                message: {
                  content: 'まったくJSONではない前置きテキストのみ',
                },
              },
            ],
          })
        )
      }

      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: 'なるほど、採用担当向けのポートフォリオなのですね。OS を教えてください。',
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSession(
      'ポートフォリオサイトを作りたい',
      null,
      '採用担当向けのポートフォリオを Mac で作りたい',
    )

    assert.equal(requests.length, 2)
    assert.equal(requests[0]?.stream, false)
    assert.equal(requests[1]?.stream, false)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(
      result.session.answers.purpose,
      '採用担当向けのポートフォリオを Mac で作りたい',
    )
    assert.equal(result.session.answers.operatingSystem, 'Mac')
    assert.equal(result.completed, true)
    assert.equal(result.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
    assert.ok(result.session.messages.at(-1)?.content)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSession throws when non-streaming upstream returns valid JSON without assistant content (error envelope), triggering retry + fallback', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  try {
    const requests: FetchBody[] = []
    const warnings: unknown[][] = []

    console.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof console.warn

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)

      // Simulate upstream returning a valid JSON error envelope with no
      // assistant content. Previously the service would fall back to
      // `responseText.trim()` and treat the error string as the model's raw
      // text, which let parseModelResponse / salvage consume it as a success.
      return Promise.resolve(
        createJsonResponse({
          error: 'upstream provider transient failure',
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSession(
      'ポートフォリオサイトを作りたい',
      null,
      '採用担当向けのポートフォリオを Mac で作りたい',
    )

    // 3 outer attempts x 1 primary non-streaming fetch = 3 fetches. Primary
    // `readNonStreamingModelResponse` throws before the text-mode fallback
    // branch is reached (the text-mode fallback's try/catch only covers the
    // fallback request itself), so each attempt makes a single fetch and then
    // bubbles out to the outer retry loop.
    assert.equal(requests.length, 3)
    for (const body of requests) {
      assert.equal(body.stream, false)
    }

    const retryWarnings = warnings.filter((entry) => entry?.[0] === '[hearing] live turn retry')
    assert.equal(retryWarnings.length, 3)
    const firstRetry = retryWarnings[0]?.[1] as { error: Error; attempt: number }
    assert.match(firstRetry.error.message, /did not include assistant content/)

    // All attempts exhausted -> outer catch flips transport to fallback; the
    // local answer is not enough until static/dynamic requirements are known.
    assert.equal(result.session.transport.status, 'fallback')
    assert.equal(result.completed, true)
    assert.equal(result.session.lastQuestionId, null)
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSession still succeeds on non-streaming path when assistant content is present', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requests: FetchBody[] = []
    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)

      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '採用担当向けのポートフォリオですね。使う PC の OS を教えてください。',
                  completed: false,
                  answers: {
                    purpose: '採用担当向けのポートフォリオ',
                  },
                  insights: {},
                  summaryKeyPoints: [],
                }),
              },
            },
          ],
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSession(
      'ポートフォリオサイトを作りたい',
      null,
      '採用担当向けのポートフォリオを Mac で作りたい',
    )

    // Only one primary non-streaming fetch — the assistant content is valid
    // so we return immediately without invoking the text-mode fallback.
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.stream, false)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.session.answers.purpose, '採用担当向けのポートフォリオ')
    assert.ok(result.session.messages.at(-1)?.content)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream throws when both streaming and text-mode fallback yield empty text, avoiding fabricated salvage', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  try {
    const requests: FetchBody[] = []
    const warnings: unknown[][] = []

    console.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof console.warn

    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? '{}')) as FetchBody
      requests.push(body)

      if (body.stream) {
        // Stream yields no chunks → primaryRawText becomes ''.
        return Promise.resolve(createStreamingResponse([]))
      }

      // Text-mode fallback: empty body → readNonStreamingModelResponse throws,
      // textRawText stays '' and the try/catch swallows the error.
      return Promise.resolve(new Response('', {}))
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      'ポートフォリオサイトを作りたい',
      null,
      '採用担当向けのポートフォリオを Mac で作りたい',
      () => undefined,
    )

    // 3 outer attempts x (1 stream primary + 1 text fallback) = 6 fetches.
    assert.equal(requests.length, 6)
    const retryWarnings = warnings.filter((entry) => entry?.[0] === '[hearing] live turn retry')
    assert.equal(retryWarnings.length, 3)
    const firstRetry = retryWarnings[0]?.[1] as { error: Error; attempt: number }
    assert.match(firstRetry.error.message, /no usable model text/)
    // All attempts exhausted -> outer catch flips transport to fallback; the
    // local answer is not enough until static/dynamic requirements are known.
    assert.equal(result.session.transport.status, 'fallback')
    assert.equal(result.completed, true)
    assert.equal(result.session.lastQuestionId, null)
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream falls back to unavailable transport when live config is not set', async () => {
  await withPlannerEnv(async () => {
    const result = await advanceHearingSessionStream('自分のWebアプリを作りたい', null, null, () => undefined)

    assert.equal(result.session.transport.status, 'unavailable')
    assert.equal(result.session.transport.label, 'ZAI live 未利用')
    assert.equal(result.session.transport.message.includes('未設定'), true)
    assert.equal(result.completed, false)
    assert.equal(result.session.lastQuestionId, 'purpose')
    assert.equal(result.session.messages.at(-1)?.content.includes('機能'), true)
    assert.equal(result.session.messages.at(-1)?.content.includes('期限'), false)
  })
})

test('advanceHearingSessionStream uses the lean fallback flow', async () => {
  await withPlannerEnv(async () => {
    const first = await advanceHearingSessionStream('自分のWebアプリを作りたい', null, null, () => undefined)
    assert.equal(first.completed, false)
    assert.equal(first.session.lastQuestionId, 'purpose')
    assert.equal(first.session.messages.at(-1)?.content.includes('機能'), true)

    const second = await advanceHearingSessionStream(
      '自分のWebアプリを作りたい',
      first.session,
      'タスク管理機能を作りたい',
      () => undefined,
    )
    assert.equal(second.completed, true)
    assert.equal(second.session.lastQuestionId, null)
    assert.equal(second.session.transport.status, 'unavailable')
    assert.equal(second.session.answers.purpose, 'タスク管理機能を作りたい')
    assert.equal(second.session.answers.siteBehavior, 'Webアプリとして動かしたい')
    assert.equal(second.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
  })
})

test('advanceHearingSessionStream forces completion when MAX_ASSISTANT_TURNS budget is exhausted (TQ-225 lowered to 6)', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '他に制約はありますか？',
                  completed: false,
                  is_goal_clear: false,
                  confidence: 'low',
                  next_question: '他に制約はありますか？',
                  answers: {},
                  insights: {},
                  summaryKeyPoints: ['ポートフォリオを作りたい', 'Windows を使う'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    // TQ-225: MAX_ASSISTANT_TURNS was lowered from 8 to 6. The 6th turn must
    // force completion regardless of whether the model still wants to ask
    // more. The history below already has 5 prior assistant turns; the next
    // turn (this attempt) becomes the 6th and must be forced to completion.
    const longSession: PlannerHearingSession = {
      answers: {
        purpose: '採用担当に見せるポートフォリオを作りたい',
        experience: 'HTML/CSS を少し触ったことがある',
        operatingSystem: 'Windows',
      },
      insights: {
        buildGoal: null,
        audience: '採用担当',
        deadline: null,
        projectType: null,
        constraints: [],
        preferences: [],
        mustHaveFeatures: [],
        planningFocus: [],
      },
      messages: [
        { id: 'goal', role: 'user', content: '目標: ポートフォリオサイトを作りたい' },
        { id: 'assistant-1', role: 'assistant', content: 'どんなサイトにしたいですか？' },
        { id: 'user-1', role: 'user', content: '採用担当に見せるポートフォリオです。' },
        { id: 'assistant-2', role: 'assistant', content: '誰向けですか？' },
        { id: 'user-2', role: 'user', content: '採用担当です。' },
        { id: 'assistant-3', role: 'assistant', content: '期限はありますか？' },
        { id: 'user-3', role: 'user', content: '今月中です。' },
        { id: 'assistant-4', role: 'assistant', content: '既存素材はありますか？' },
        { id: 'user-4', role: 'user', content: 'まだありません。' },
        { id: 'assistant-5', role: 'assistant', content: '経験はどれくらいですか？' },
        { id: 'user-5', role: 'user', content: '少しだけです。' },
      ],
      lastQuestionId: null,
      transport: { status: 'live', label: 'ZAI coding plan', message: 'live' },
      completedAt: null,
    }

    const result = await advanceHearingSessionStream(
      'ポートフォリオサイトを作りたい',
      longSession,
      'OS は Windows、AI ツールはまだありません。',
      () => undefined,
    )

    assert.equal(result.completed, true)
    assert.equal(Boolean(result.session.completedAt), true)
    assert.equal(result.session.messages.at(-1)?.content, '必要な前提が揃いました。ここまでの内容でプランを作成します。')
    assert.deepEqual(result.structuredOutput, {
      reply: '必要な前提が揃いました。ここまでの内容でプランを作成します。',
      phase: 'coaching',
      actions: [],
      decisions: ['hearing の前提整理が完了した'],
      open_questions: [],
      next_question: null,
      next_action: 'ヒアリング内容を確認してプランを作成する',
    })
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream early-ends when AI signals is_goal_clear=true with high confidence (TQ-225)', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  // The model itself returns `completed: false` but signals
                  // `is_goal_clear: true` + high confidence — TQ-225 lets the
                  // host treat that as an early-end without further turns.
                  reply: 'なるほど、AI で記事制作を月 10 本ですね。ここまでの内容で plan に進みます。',
                  completed: false,
                  is_goal_clear: true,
                  confidence: 'high',
                  next_question: null,
                  answers: {
                    purpose: 'AIで記事を月10本書きたい',
                  },
                  insights: {
                    audience: 'BtoB SaaS のオウンドメディア',
                  },
                  summaryKeyPoints: ['AI で記事制作を月10本'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    // Prior session already has 2 assistant turns; this turn becomes the 3rd
    // assistant turn — the early-end floor (>= 2) is satisfied, so the
    // is_goal_clear=high signal can trigger termination at 3 questions.
    // Goal/purpose contain none of the implicit-siteBehavior keywords, so
    // `hasMinimumCompletionFields` cannot complete this on its own — the
    // early-end branch is the only path to completion. This isolates the
    // TQ-225 behavior under test.
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
        { id: 'goal', role: 'user', content: '目標: AIで業務を楽にしたい' },
        { id: 'assistant-1', role: 'assistant', content: 'どんな業務を楽にしたいですか？' },
        { id: 'user-1', role: 'user', content: 'AI で記事制作を量産したい。' },
        { id: 'assistant-2', role: 'assistant', content: 'どれくらいのペースで作りたいですか？' },
      ],
      lastQuestionId: null,
      transport: { status: 'live', label: 'ZAI coding plan', message: 'live' },
      completedAt: null,
    }

    const result = await advanceHearingSessionStream(
      'AIで業務を楽にしたい',
      priorSession,
      '月 10 本くらい書きたい。',
      () => undefined,
    )

    assert.equal(result.completed, true)
    assert.equal(Boolean(result.session.completedAt), true)
    // Last message is either the AI's natural completion sentence (preserved
    // when it is not question-like) or the canonical completion fallback.
    // What matters is `completed=true`, not the exact text.
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream does NOT early-end when confidence is low even if is_goal_clear=true (TQ-225)', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'もう少し詳しく教えてください。最初に出したい画面は何ですか？',
                  completed: false,
                  is_goal_clear: true,
                  confidence: 'low',
                  next_question: '最初に出したい画面は何ですか？',
                  answers: { purpose: '何か作りたい' },
                  insights: {},
                  summaryKeyPoints: ['まだ目的が固まっていない'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      '何か作りたい',
      null,
      '何か作りたい',
      () => undefined,
    )

    // Low confidence early-end signal must be ignored. The hearing must
    // continue (completed=false) so the loop has more chances to ask.
    assert.equal(result.completed, false)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream does NOT early-end before MIN_ASSISTANT_TURNS_BEFORE_EARLY_END floor (TQ-225)', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'なるほど。次に何を確認すれば良いか考えますね。',
                  completed: false,
                  is_goal_clear: true,
                  confidence: 'high',
                  next_question: null,
                  // Intentionally minimal: no purpose, no insights — so
                  // `hasEarlyEndCompletionFields` (which requires a purpose)
                  // also fails. This isolates the floor-only branch.
                  answers: {},
                  insights: {},
                  summaryKeyPoints: ['会話開始'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    // First call from a null session — assistantTurnsAfterThis=1, below the
    // floor of 2. Even with confidence=high we should NOT early-end.
    const result = await advanceHearingSessionStream(
      '何か作りたい',
      null,
      null,
      () => undefined,
    )

    assert.equal(result.completed, false)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream completes when audience insight is known even without tools/constraints', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。ここまでの内容でプランを作成します。',
                  completed: false,
	                  answers: {
	                    purpose: '採用担当向けポートフォリオを作りたい',
	                    siteBehavior: '文章・画像中心の静的ページでよい',
	                    experience: 'HTML/CSS を少し触ったことがある',
	                    operatingSystem: 'Mac',
                  },
                  insights: {
                    audience: '採用担当',
                  },
                  summaryKeyPoints: ['採用担当向けポートフォリオ'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      'ポートフォリオサイトを作りたい',
      null,
      '採用担当向けにポートフォリオを作りたい',
      () => undefined,
    )

    assert.equal(result.completed, true)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.session.insights?.audience, '採用担当')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream completes when deadline insight is known even without tools/constraints', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。ここまでの内容でプランを作成します。',
                  completed: false,
	                  answers: {
	                    purpose: 'ポートフォリオを公開したい',
	                    siteBehavior: '文章・画像中心の静的ページでよい',
	                    experience: 'HTML/CSS を少し触ったことがある',
	                    operatingSystem: 'Mac',
                  },
                  insights: {
                    deadline: '2週間',
                  },
                  summaryKeyPoints: ['2週間でポートフォリオ公開'],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      'ポートフォリオサイトを作りたい',
      null,
      '2週間でポートフォリオを公開したいです。',
      () => undefined,
    )

    assert.equal(result.completed, true)
    assert.equal(result.session.transport.status, 'live')
    assert.equal(result.session.insights?.deadline, '2週間')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream system prompt prioritizes static versus dynamic branching', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requests: FetchBody[] = []
    const streamChunk = JSON.stringify({
      choices: [
        {
          delta: {
            content: JSON.stringify({
              reply: '最初に動かしたい機能を1つ教えてください。',
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

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    await advanceHearingSessionStream('自分のWebアプリを作りたい', null, null, () => undefined)

    const systemPrompt = requests[0]?.messages?.[0]?.content ?? ''
    assert.match(systemPrompt, /質問してよいのは/)
    assert.match(systemPrompt, /対象者や期限はユーザーが自分から言った場合だけ/)
    assert.match(systemPrompt, /Webアプリ goal では「誰に見てもらうか」ではなく/)
    assert.match(systemPrompt, /静的ページで足りるのか/)
    assert.match(systemPrompt, /フォーム\/予約\/ログイン\/DB/)
    assert.match(systemPrompt, /Next\.js \/ Supabase/)
    assert.match(systemPrompt, /HTML\/CSS \+ Codex CLI or Claude Code/)
    assert.doesNotMatch(systemPrompt, /必ずはっきり尋ねて/)
    assert.doesNotMatch(systemPrompt, /いつまでに仕上げたいか/)
    assert.match(systemPrompt, /定型の相槌や過度な賞賛で始めない/)
    assert.match(systemPrompt, /例示を並べて誘導するのは避けてください/)
    // TQ-225: prompt must instruct the model to emit the dynamic early-end
    // signal (is_goal_clear / confidence / next_question) so the host can
    // terminate the loop before MAX_ASSISTANT_TURNS.
    assert.match(systemPrompt, /is_goal_clear/)
    assert.match(systemPrompt, /confidence/)
    assert.match(systemPrompt, /next_question/)
    assert.match(systemPrompt, /high \/ medium \/ low/)
    // The MAX_ASSISTANT_TURNS budget must reflect the TQ-225 lowered ceiling.
    assert.match(systemPrompt, /assistant ターンは今回を含めて最大 6 回/)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream returns unavailable transport with custom reason when only endpoint is set', async () => {
  const result = await withPlannerEnv(() => {
    process.env.ZAI_PLANNER_API_URL = 'https://api.z.ai/api/coding/paas/v4'

    return advanceHearingSessionStream('予約受付ページを作りたい', null, null, () => undefined)
  })

  assert.equal(result.session.transport.status, 'unavailable')
  assert.equal(result.session.transport.message.includes('API キー'), true)
})

test('advanceHearingSessionStream preserves prior personaIds when AI returns empty array', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。次は、対象者を教えてください。',
                  completed: false,
                  answers: {
                    purpose: 'ポートフォリオを作りたい',
                  },
                  insights: {},
                  summaryKeyPoints: ['ポートフォリオ'],
                  personaIds: [],
                }),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const priorSession: PlannerHearingSession & { personaIds?: string[] } = {
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
        { id: 'goal', role: 'user', content: '目標: ポートフォリオ' },
      ],
      lastQuestionId: null,
      transport: { status: 'live', label: 'ZAI coding plan', message: 'live' },
      completedAt: null,
      personaIds: ['persona.web-builder'],
    }

    const result = await advanceHearingSessionStream(
      'ポートフォリオを作りたい',
      priorSession,
      'ポートフォリオを作りたい',
      () => undefined,
    )

    const personaIds = (result.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(personaIds, ['persona.web-builder'])
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream persists personaIds across consecutive turns', async () => {
  const originalFetch = globalThis.fetch
  try {
    let currentPayload = {
      reply: '分かりました。次は OS を教えてください。',
      completed: false,
      answers: { purpose: 'ポートフォリオ作成', experience: 'HTML/CSS 少し' },
      insights: { audience: '採用担当' },
      summaryKeyPoints: ['採用担当向けポートフォリオ'],
      personaIds: ['persona.web-builder'],
    } as Record<string, unknown>

    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify(currentPayload),
              },
            },
          ],
        })
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const first = await advanceHearingSessionStream(
      'ポートフォリオを作りたい',
      null,
      '採用担当向けポートフォリオを作りたい',
      undefined,
    )
    const firstPersonaIds = (first.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(firstPersonaIds, ['persona.web-builder'])

    // 2nd turn: AI omits personaIds entirely — should preserve from prior session
    currentPayload = {
      reply: 'ありがとうございます。続いて AI ツールを教えてください。',
      completed: false,
      answers: { operatingSystem: 'Mac' },
      insights: {},
      summaryKeyPoints: ['Mac'],
    }

    const second = await advanceHearingSessionStream(
      'ポートフォリオを作りたい',
      first.session,
      'Mac を使います。',
      undefined,
    )
    const secondPersonaIds = (second.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(secondPersonaIds, ['persona.web-builder'])
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('probeZaiHearingHealth uses a larger token budget and succeeds in json mode', async () => {
  const originalFetch = globalThis.fetch
  try {
    let requestBody: HealthCheckRequestBody | null = null
    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body ?? '{}')) as HealthCheckRequestBody

      return Promise.resolve(
        createJsonResponse(
          {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    reply: 'pong',
                  }),
                },
              },
            ],
          },
          { 'x-request-id': 'zai-health-json-1' },
        ),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await probeZaiHearingHealth()

    assert.ok(requestBody)
    const jsonRequestBody = requestBody as HealthCheckRequestBody
    assert.equal(jsonRequestBody.max_tokens, 512)
    assert.deepEqual(jsonRequestBody.response_format, { type: 'json_object' })
    assert.match(
      String(jsonRequestBody.messages?.[0]?.content ?? ''),
      /"reply" string field set to "pong"/,
    )
    assert.equal(result.ok, true)
    assert.equal(result.available, true)
    assert.equal(result.responseFormat, 'json_object')
    assert.equal(result.zaiRequestId, 'zai-health-json-1')
    assert.equal(result.parsed, true)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('probeZaiHearingHealth uses a format-specific text prompt', async () => {
  const originalFetch = globalThis.fetch
  try {
    let requestBody: HealthCheckRequestBody | null = null
    globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body ?? '{}')) as HealthCheckRequestBody

      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'pong',
              },
            },
          ],
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await probeZaiHearingHealth({
      responseFormat: 'text',
    })

    assert.ok(requestBody)
    const textRequestBody = requestBody as HealthCheckRequestBody
    assert.equal(textRequestBody.max_tokens, 512)
    assert.deepEqual(textRequestBody.response_format, { type: 'text' })
    assert.match(
      String(textRequestBody.messages?.[0]?.content ?? ''),
      /Reply with exactly pong/,
    )
    assert.equal(result.ok, true)
    assert.equal(result.available, true)
    assert.equal(result.responseFormat, 'text')
    assert.equal(result.parsed, true)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

// =============================================================================
// W49 (2026-05-09) salvaged from TQ-203 / TQ-209: persona id expansion +
// goalCategory inference + heuristic extraction + vague-goal detection.
// =============================================================================

function emptyInsights(): PlannerHearingInsights {
  return {
    buildGoal: null,
    audience: null,
    deadline: null,
    projectType: null,
    constraints: [],
    preferences: [],
    mustHaveFeatures: [],
    planningFocus: [],
  }
}

test('inferGoalCategory: SNS keywords win over marketer-app overlap (W49 / TQ-209)', () => {
  assert.equal(
    inferGoalCategory('Instagram 投稿バッチを週次で AI 生成したい'),
    'sns-batch',
  )
  assert.equal(
    inferGoalCategory('TikTok のショート動画ハッシュタグ運用'),
    'sns-batch',
  )
})

test('inferGoalCategory: LP / コピー keywords classify as lp-copy (W49 / TQ-209)', () => {
  assert.equal(
    inferGoalCategory('LP コピーを AI で量産して A/B テストに使いたい'),
    'lp-copy',
  )
  assert.equal(
    inferGoalCategory('セールスコピーをキャッチで強化したい'),
    'lp-copy',
  )
})

test('inferGoalCategory: 顧客 / CRM keywords classify as marketer-app (W49 / TQ-209)', () => {
  assert.equal(
    inferGoalCategory('顧客管理・フォローアップ web app を作りたい'),
    'marketer-app',
  )
  assert.equal(
    inferGoalCategory('CRM で営業案件を管理したい'),
    'marketer-app',
  )
})

test('inferGoalCategory: ペルソナ系 / Web 系は general を返す (W49 / TQ-209)', () => {
  assert.equal(
    inferGoalCategory('AIでポートフォリオやホームページを作りたい'),
    'general',
  )
  assert.equal(inferGoalCategory(''), 'general')
  assert.equal(inferGoalCategory(null), 'general')
})

test('inferGoalCategory: insights.mustHaveFeatures からも判定する (W49 / TQ-209)', () => {
  assert.equal(
    inferGoalCategory(
      'AI で売上アップ',
      {},
      { ...emptyInsights(), mustHaveFeatures: ['Instagram バッチ投稿'] },
    ),
    'sns-batch',
  )
})

test('isVagueGoal: 16 字未満かつ vague keyword 含むときに true (W49 / TQ-209)', () => {
  assert.equal(isVagueGoal('数字を伸ばしたい'), true)
  assert.equal(isVagueGoal('マーケを改善したい'), true)
  assert.equal(isVagueGoal('SNS 運用をなんとかしたい'), true)
})

test('isVagueGoal: 16 字以上 / vague keyword なしは false (W49 / TQ-209)', () => {
  // 17 文字あり vague keyword 含むが length が境界以上のため false
  assert.equal(isVagueGoal('マーケティングをよりよく改善する戦略'), false)
  assert.equal(isVagueGoal('LP を作りたい'), false)
  assert.equal(isVagueGoal(''), false)
  assert.equal(isVagueGoal(null), false)
})

test('isVagueGoal: answers.purpose の vague keyword でも true (W49 / TQ-209)', () => {
  assert.equal(
    isVagueGoal('AI 活用したい', { purpose: 'なんとか売上を伸ばしたい' }),
    true,
  )
})

test('applyHeuristicHearingExtraction: 既存値があれば override しない (W49 / TQ-209)', () => {
  const messages: PlannerConversationMessage[] = [
    { id: 'u1', role: 'user', content: 'ChatGPT を使ってます' },
    { id: 'u2', role: 'user', content: 'macOS で作業しています' },
  ]
  const answers: Partial<PlannerHearingAnswers> = {
    aiTools: 'Gemini',
    operatingSystem: 'Windows',
  }
  const insights = emptyInsights()

  const result = applyHeuristicHearingExtraction(answers, insights, messages)
  // 既存値を保持 (idempotent)。
  assert.equal(result.answers.aiTools, 'Gemini')
  assert.equal(result.answers.operatingSystem, 'Windows')
})

test('applyHeuristicHearingExtraction: 空の場合に utterance buffer から lift する (W49 / TQ-209)', () => {
  const messages: PlannerConversationMessage[] = [
    { id: 'u1', role: 'user', content: 'ChatGPT で投稿バッチを Instagram に出したい' },
    { id: 'u2', role: 'user', content: 'macOS で作業しています' },
  ]
  const answers: Partial<PlannerHearingAnswers> = {}
  const insights = emptyInsights()

  const result = applyHeuristicHearingExtraction(answers, insights, messages)
  assert.equal(result.answers.aiTools, 'ChatGPT')
  assert.equal(result.answers.operatingSystem, 'macOS')
  assert.equal(result.insights.audience, 'Instagram')
})

test('applyHeuristicHearingExtraction: assistant の発話は無視する (W49 / TQ-209)', () => {
  const messages: PlannerConversationMessage[] = [
    { id: 'a1', role: 'assistant', content: 'ChatGPT を使っていますか?' },
  ]
  const answers: Partial<PlannerHearingAnswers> = {}
  const insights = emptyInsights()

  const result = applyHeuristicHearingExtraction(answers, insights, messages)
  // assistant 発話の中にしか keyword がない場合は lift しない。
  assert.equal(result.answers.aiTools, undefined)
})

test('advanceHearingSessionStream accepts crm-builder / instagram-automator personaIds (W49 / TQ-203)', async () => {
  const originalFetch = globalThis.fetch
  try {
    const expectedPersonas = [
      'persona.crm-builder',
      'persona.instagram-automator',
    ] as const

    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。次は、対象顧客を教えてください。',
                  completed: false,
                  answers: {
                    purpose: '顧客フォローアップを自動化したい',
                  },
                  insights: {},
                  summaryKeyPoints: ['顧客フォローアップ自動化'],
                  // sanitizePersonaIds は SUPPORTED_PERSONA_IDS に含まれないものは
                  // 黙って除外するため、2 件すべてが含まれていることを検証する。
                  personaIds: [...expectedPersonas],
                }),
              },
            },
          ],
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      '顧客管理 web app を作りたい',
      null,
      '顧客フォローアップを自動化したい',
      () => undefined,
    )
    const personaIds = (result.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(personaIds, [...expectedPersonas])
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream accepts meal-planner / ec-operator personaIds (W49 / TQ-203)', async () => {
  const originalFetch = globalThis.fetch
  try {
    const expectedPersonas = [
      'persona.meal-planner',
      'persona.ec-operator',
    ] as const

    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。続いて期限を教えてください。',
                  completed: false,
                  answers: {
                    purpose: 'EC 運営の献立提案を作りたい',
                  },
                  insights: {},
                  summaryKeyPoints: ['EC 献立'],
                  personaIds: [...expectedPersonas],
                }),
              },
            },
          ],
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      'EC ストアの献立提案ツールを作りたい',
      null,
      'EC 運営者向けに献立提案を作りたい',
      () => undefined,
    )
    const personaIds = (result.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(personaIds, [...expectedPersonas])
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('advanceHearingSessionStream rejects unsupported personaIds while keeping supported ones (W49 / TQ-203)', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = ((_: RequestInfo | URL) => {
      return Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'ありがとうございます。',
                  completed: false,
                  answers: { purpose: 'CRM' },
                  insights: {},
                  summaryKeyPoints: ['CRM'],
                  // 1 件目はサポート外、2 件目はサポート内 → サポート内のみ残る。
                  personaIds: ['persona.unknown-foo', 'persona.crm-builder'],
                }),
              },
            },
          ],
        }),
      )
    }) as unknown as typeof fetch

    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    const result = await advanceHearingSessionStream(
      '顧客管理 web app を作りたい',
      null,
      '顧客管理 web app を作りたい',
      () => undefined,
    )
    const personaIds = (result.session as PlannerHearingSession & { personaIds?: string[] }).personaIds ?? []
    assert.deepEqual(personaIds, ['persona.crm-builder'])
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})
