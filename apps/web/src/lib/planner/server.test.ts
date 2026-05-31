import test from 'node:test'
import assert from 'node:assert/strict'
import { generatePlan, generatePlanStream } from '@/lib/planner/server'

type FetchConfig = {
  stream?: boolean
}
const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']

function createJsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function createStreamingResponse(payload: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })

  return new Response(stream)
}

function isZaiRequest(input: RequestInfo | URL) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  return url.includes('/chat/completions')
}

function createFallbackSupabaseResponse(input: RequestInfo | URL) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  if (url.includes('/rest/v1/')) {
    return createJsonResponse([])
  }

  throw new Error(`Unexpected fetch in planner server test: ${url}`)
}

function withPlannerEnv<T>(fn: () => T | Promise<T>) {
  const originalValues: Array<[string, string | undefined]> = ENV_KEYS.map((key) => [key, process.env[key]])

  for (const key of ENV_KEYS) {
    delete process.env[key]
  }

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

const fallbackResponsePayload = {
  choices: [
    {
      message: {
        content: '会話の前提だけは取れましたが、出力は構造化して返せていません。',
      },
    },
  ],
}

test('generatePlan returns fallback adapter when ZAI response is not structured JSON', async () => {
  const originalFetch = globalThis.fetch
  try {
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    globalThis.fetch = ((input) => {
      if (isZaiRequest(input)) {
        return Promise.resolve(createJsonResponse(fallbackResponsePayload))
      }

      return Promise.resolve(createFallbackSupabaseResponse(input))
    }) as typeof fetch

    const result = await generatePlan({
      goal: 'ポートフォリオサイトを作りたい',
    })

    assert.equal(result.adapter.status, 'fallback')
    assert.equal(result.adapter.message.includes('ローカル補正表示'), true)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('generatePlanStream emits text delta and returns fallback adapter when stream cannot be parsed', async () => {
  const originalFetch = globalThis.fetch
  const events: string[] = []
  try {
    process.env.ZAI_PLANNER_API_KEY = 'test-key'
    const requestBodyCalls: FetchConfig[] = []

    globalThis.fetch = ((input, init) => {
      if (!isZaiRequest(input)) {
        return Promise.resolve(createFallbackSupabaseResponse(input))
      }

      const body = init?.body ? (JSON.parse(String(init.body)) as { stream?: boolean }) : undefined
      requestBodyCalls.push({ stream: body?.stream })

      if (body?.stream) {
        const rawChunk = JSON.stringify({
          choices: [
            {
              delta: {
                content: fallbackResponsePayload.choices[0].message.content,
              },
            },
          ],
        })
        return Promise.resolve(createStreamingResponse(`data: ${rawChunk}\n\ndata: [DONE]\n\n`))
      }

      return Promise.resolve(createJsonResponse(fallbackResponsePayload))
    }) as typeof fetch

    const result = await generatePlanStream({ goal: '予約フォーム付きサイトを作りたい' }, (event) => {
      if (event.type === 'text-delta') {
        events.push(event.text)
      }
    })

    assert.equal(result.adapter.status, 'fallback')
    assert.equal(requestBodyCalls.length > 0, true)
    assert.equal(events.length, 0)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('generatePlanStream ignores malformed streaming JSON frames and still parses valid JSON frames', async () => {
  const originalFetch = globalThis.fetch
  const events: string[] = []
  const requestBodyCalls: FetchConfig[] = []

  try {
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    globalThis.fetch = ((input, init) => {
      if (!isZaiRequest(input)) {
        return Promise.resolve(createFallbackSupabaseResponse(input))
      }

      const body = init?.body ? (JSON.parse(String(init.body)) as { stream?: boolean }) : undefined
      requestBodyCalls.push({ stream: body?.stream })

      if (body?.stream) {
        const malformed = 'not-json'
        const valid = JSON.stringify({
          choices: [
            {
              delta: {
                content:
                  '{"supportMessage":"ライブ解析で順番を確認中です","status":"supported","title":"テストタイトル","summary":"確認します","detail":"詳細を整理しました","nextActionLabel":"次へ","continuationMode":"inline-plan","lessonPlan":{"strategySummary":"戦略要約","reasoning":"理由","learnerProfileFocus":[],"learnerStateFocus":[]}}',
              },
            },
          ],
        })
        return Promise.resolve(createStreamingResponse(`data: ${malformed}\n\ndata: ${valid}\n\ndata: [DONE]\n\n`))
      }

      return Promise.resolve(createJsonResponse(fallbackResponsePayload))
    }) as typeof fetch

    const result = await generatePlanStream({ goal: '予約フォーム付きサイトを作りたい' }, (event) => {
      if (event.type === 'text-delta') {
        events.push(event.text)
      }
    })

    assert.equal(result.adapter.status, 'live')
    assert.equal(requestBodyCalls[0]?.stream, true)
    assert.equal(events.length > 0, true)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('generatePlanStream handles malformed and valid JSON lines in the same SSE event', async () => {
  const originalFetch = globalThis.fetch
  const events: string[] = []
  const requestBodyCalls: FetchConfig[] = []

  try {
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    globalThis.fetch = ((input, init) => {
      if (!isZaiRequest(input)) {
        return Promise.resolve(createFallbackSupabaseResponse(input))
      }

      const body = init?.body ? (JSON.parse(String(init.body)) as { stream?: boolean }) : undefined
      requestBodyCalls.push({ stream: body?.stream })

      if (body?.stream) {
        const malformed = 'not-json'
        const valid = JSON.stringify({
          choices: [
            {
              delta: {
                content:
                  '{"supportMessage":"イベント内混在でも対応中","status":"supported","title":"イベントタイトル","summary":"検証します","detail":"イベント内の混在行を無視して有効行を処理","nextActionLabel":"次へ","continuationMode":"inline-plan","lessonPlan":{"strategySummary":"混在要約","reasoning":"混在を除外","learnerProfileFocus":[],"learnerStateFocus":[]}}',
              },
            },
          ],
        })
        return Promise.resolve(createStreamingResponse(`data: ${malformed}\ndata: ${valid}\n\ndata: [DONE]\n\n`))
      }

      return Promise.resolve(createJsonResponse(fallbackResponsePayload))
    }) as typeof fetch

    const result = await generatePlanStream({ goal: '予約フォーム付きサイトを作りたい' }, (event) => {
      if (event.type === 'text-delta') {
        events.push(event.text)
      }
    })

    assert.equal(result.adapter.status, 'live')
    assert.equal(requestBodyCalls[0]?.stream, true)
    assert.equal(events.length > 0, true)
    assert.equal(events.join('').includes('イベント内混在でも対応中'), true)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.ZAI_PLANNER_API_KEY
  }
})

test('generatePlan returns unavailable status when live config is missing', async () => {
  const result = await withPlannerEnv(() => {
    return generatePlan({
      goal: '予約フォームを作るサイトを作りたい',
    })
  })

  assert.equal(result.adapter.status, 'unavailable')
  assert.equal(result.adapter.message.includes('API キー'), true)
  assert.equal(result.adapter.label, 'ローカル簡易プランナー')
})

test('generatePlanStream returns unavailable status without external fetch when env is missing and emits fallback message once', async () => {
  const events: string[] = []

  const result = await withPlannerEnv(() =>
    generatePlanStream({ goal: 'ポートフォリオサイトを公開する' }, (event) => {
      if (event.type === 'text-delta') {
        events.push(event.text)
      }
    }))

  assert.equal(result.adapter.status, 'unavailable')
  assert.equal(result.recommendation.status, 'supported')
  assert.equal(events.length, 1)
})
