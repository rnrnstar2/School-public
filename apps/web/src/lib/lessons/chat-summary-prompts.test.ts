import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLessonChatSummaryMessages } from './chat-summary-prompts'
import type { LessonChatMessage } from '@/types'

test('buildLessonChatSummaryMessages produces system+user pair', () => {
  const messages: LessonChatMessage[] = [
    { role: 'user', content: 'Reactとは?' },
    { role: 'assistant', content: 'UIライブラリです。' },
  ]

  const result = buildLessonChatSummaryMessages({
    chatMessages: messages,
    lessonTitle: 'React入門',
  })

  assert.equal(result.length, 2)
  assert.equal(result[0].role, 'system')
  assert.equal(result[1].role, 'user')

  assert.match(result[0].content, /あなたは学習進捗を記録するアシスタントです。/)
  assert.match(result[0].content, /key pointsを3〜5個抽出/)

  assert.ok(result[1].content.includes('レッスン「React入門」'))
  assert.ok(result[1].content.includes('学習者: Reactとは?'))
  assert.ok(result[1].content.includes('AI: UIライブラリです。'))
})
