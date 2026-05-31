import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLessonChatSystemPrompt } from './chat-prompts'

test('buildLessonChatSystemPrompt embeds lesson context and core directives', () => {
  const prompt = buildLessonChatSystemPrompt({
    lessonContext: 'レッスンタイトル: テストレッスン\n概要: テスト用',
  })

  assert.match(prompt, /あなたはレッスン内の学習サポート AI です。/)
  assert.match(prompt, /## レッスン情報\nレッスンタイトル: テストレッスン\n概要: テスト用/)
  assert.match(prompt, /## 回答ガイドライン/)
  assert.match(prompt, /## メンターアクション/)
  assert.match(prompt, /## Structured output/)
  assert.match(prompt, /`reply`, `phase`, `actions`, `decisions`, `open_questions`, `next_question`, `next_action`/)
  assert.match(prompt, /\[MENTOR_ACTION\]\{"type":"change_next_lesson"/)
  assert.match(prompt, /\[MENTOR_ACTION\]\{"type":"skip_lesson"/)
  assert.match(prompt, /\[MENTOR_ACTION\]\{"type":"add_lesson"/)
  assert.match(prompt, /\[MENTOR_ACTION\]\{"type":"reorder_schedule"/)
})

test('buildLessonChatSystemPrompt appends personalization block when provided', () => {
  const prompt = buildLessonChatSystemPrompt({
    lessonContext: 'レッスンタイトル: T\n概要: S',
    personalizationBlock: '## 学習者の理解\n弱点: A',
  })

  assert.ok(prompt.includes('## 学習者の理解\n弱点: A'))
})

test('buildLessonChatSystemPrompt omits personalization block when null', () => {
  const prompt = buildLessonChatSystemPrompt({
    lessonContext: 'レッスンタイトル: T\n概要: S',
    personalizationBlock: null,
  })

  assert.ok(!prompt.includes('## 学習者の理解'))
})
