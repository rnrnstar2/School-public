import assert from 'node:assert/strict'
import test from 'node:test'

import { runZaiSnapshot, type ZaiSnapshotEntry } from './zai-snapshot'

const allowedKeys = ['latencyMs', 'mode', 'parsed', 'requestId', 'status', 'zaiRequestId'].sort()

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

test('runZaiSnapshot captures the three debug modes in order', async () => {
  const calls: string[] = []
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input)
    calls.push(url)

    if (url.includes('stream=1')) {
      return jsonResponse({
        status: 200,
        latencyMs: 345,
        parsed: true,
        requestId: 'app-stream',
        zaiRequestId: 'zai-stream',
      })
    }

    if (url.includes('response_format=text')) {
      return jsonResponse({
        status: 200,
        latencyMs: 234,
        parsed: true,
        requestId: 'app-text',
        zaiRequestId: 'zai-text',
      })
    }

    return jsonResponse({
      status: 200,
      latencyMs: 123,
      parsed: true,
      requestId: 'app-json',
      zaiRequestId: 'zai-json',
    })
  }

  const entries = await runZaiSnapshot({
    baseUrl: 'https://school.example.test',
    fetch: fetchMock,
  })

  assert.deepEqual(
    calls.map((url) => new URL(url).pathname + new URL(url).search),
    [
      '/api/debug/zai-health?response_format=json_object',
      '/api/debug/zai-health?response_format=text',
      '/api/debug/zai-health?response_format=json_object&stream=1',
    ],
  )
  assert.deepEqual(
    entries.map((entry) => entry.mode),
    ['json_object', 'text', 'json_object_stream'],
  )
})

test('runZaiSnapshot emits only the allowed snapshot fields and drops placeholders', async () => {
  const fetchMock: typeof fetch = async () =>
    jsonResponse(
      {
        status: 403,
        latencyMs: 99,
        parsed: false,
        requestId: 'app-redacted-ok',
        zaiRequestId: 'zai-redacted-ok',
        bodySnippet: 'secret body placeholder must not leave the debug route',
        apiKey: 'zai-secret-placeholder',
        goalText: 'user goal placeholder',
        email: 'learner@example.test',
      },
      502,
    )

  const entries = await runZaiSnapshot({
    baseUrl: 'https://school.example.test/',
    fetch: fetchMock,
  })

  for (const entry of entries) {
    assertSnapshotSchema(entry)
    assert.equal(JSON.stringify(entry).includes('secret'), false)
    assert.equal(JSON.stringify(entry).includes('goal placeholder'), false)
    assert.equal(JSON.stringify(entry).includes('learner@example.test'), false)
  }

  assert.deepEqual(entries[0], {
    mode: 'json_object',
    status: 403,
    latencyMs: 99,
    parsed: false,
    requestId: 'app-redacted-ok',
    zaiRequestId: 'zai-redacted-ok',
  })
})

function assertSnapshotSchema(entry: ZaiSnapshotEntry) {
  assert.deepEqual(Object.keys(entry).sort(), allowedKeys)
}
