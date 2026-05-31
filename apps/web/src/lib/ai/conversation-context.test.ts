import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConversationContext,
  fallbackSummarize,
  type ConversationMessage,
} from '@/lib/ai/conversation-context'

function makeMessages(count: number): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `メッセージ ${i + 1}`,
  }))
}

test('buildConversationContext returns recent messages without summarization when under threshold', async () => {
  const messages = makeMessages(10)
  const result = await buildConversationContext(messages, { systemPrompt: 'テストシステム' })

  assert.equal(result.wasSummarized, false)
  assert.equal(result.summaryText, null)
  // system prompt + 10 messages
  assert.equal(result.messages.length, 11)
  assert.equal(result.messages[0].role, 'system')
  assert.equal(result.messages[0].content, 'テストシステム')
})

test('buildConversationContext triggers summarization when messages exceed threshold', async () => {
  // Clear ZAI env vars to force fallback summarization
  const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']
  const origValues = ENV_KEYS.map((k) => [k, process.env[k]] as const)
  for (const k of ENV_KEYS) delete process.env[k]

  try {
    const messages = makeMessages(25)
    const result = await buildConversationContext(messages, {
      systemPrompt: 'システム',
      recentMessageCount: 10,
      summarizationThreshold: 20,
    })

    assert.equal(result.wasSummarized, true)
    assert.ok(result.summaryText !== null)
    assert.ok(result.summaryText!.length > 0)

    // system + summary (as system message) + 10 recent messages = 12
    assert.equal(result.messages.length, 12)
    assert.equal(result.messages[0].role, 'system')
    // The second message should be the summary context
    assert.equal(result.messages[1].role, 'system')
    assert.ok(result.messages[1].content.includes('会話要約'))
  } finally {
    for (const [k, v] of origValues) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('buildConversationContext respects custom recentMessageCount', async () => {
  const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']
  const origValues = ENV_KEYS.map((k) => [k, process.env[k]] as const)
  for (const k of ENV_KEYS) delete process.env[k]

  try {
    const messages = makeMessages(25)
    const result = await buildConversationContext(messages, {
      recentMessageCount: 5,
      summarizationThreshold: 20,
    })

    assert.equal(result.wasSummarized, true)
    // No system prompt: summary message + 5 recent = 6
    assert.equal(result.messages.length, 6)
  } finally {
    for (const [k, v] of origValues) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('buildConversationContext filters out system messages from input', async () => {
  const messages: ConversationMessage[] = [
    { role: 'system', content: 'should be filtered' },
    { role: 'user', content: 'こんにちは' },
    { role: 'assistant', content: 'はい' },
  ]

  const result = await buildConversationContext(messages)

  // Only user and assistant messages should be in the result (no system prompt specified)
  assert.equal(result.messages.length, 2)
  assert.ok(result.messages.every((m) => m.role !== 'system' || false))
})

test('buildConversationContext includes additionalContext in system prompt', async () => {
  const messages = makeMessages(5)
  const result = await buildConversationContext(messages, {
    systemPrompt: 'メインプロンプト',
    additionalContext: ['追加コンテキスト1', '追加コンテキスト2'],
  })

  assert.equal(result.messages[0].role, 'system')
  assert.ok(result.messages[0].content.includes('メインプロンプト'))
  assert.ok(result.messages[0].content.includes('追加コンテキスト1'))
  assert.ok(result.messages[0].content.includes('追加コンテキスト2'))
})

test('fallbackSummarize extracts key points from messages', () => {
  const messages: ConversationMessage[] = [
    { role: 'user', content: 'CSSのflexboxについて教えてください' },
    { role: 'assistant', content: 'Flexboxはレイアウトモデルです。display: flexを指定することで有効になります。' },
    { role: 'user', content: 'justify-contentの使い方は？' },
    { role: 'assistant', content: 'justify-contentは主軸方向の配置を制御します。center, space-between等が使えます。' },
  ]

  const result = fallbackSummarize(messages)

  assert.ok(result.includes('flexbox'))
  assert.ok(result.includes('Flexbox'))
  assert.ok(result.includes('justify-content'))
})

test('fallbackSummarize limits output to 15 points', () => {
  const messages = makeMessages(40)
  const result = fallbackSummarize(messages)
  const lines = result.split('\n').filter(Boolean)

  assert.ok(lines.length <= 15, `Expected <= 15 lines, got ${lines.length}`)
})

test('buildConversationContext handles empty messages', async () => {
  const result = await buildConversationContext([], { systemPrompt: 'テスト' })

  assert.equal(result.wasSummarized, false)
  assert.equal(result.messages.length, 1) // Just the system prompt
  assert.equal(result.messages[0].content, 'テスト')
})

test('buildConversationContext works without systemPrompt', async () => {
  const messages = makeMessages(3)
  const result = await buildConversationContext(messages)

  assert.equal(result.messages.length, 3)
  assert.equal(result.messages[0].role, 'user')
})
