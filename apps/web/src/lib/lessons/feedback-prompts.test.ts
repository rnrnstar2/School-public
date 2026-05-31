import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLessonFeedbackAdjustmentPrompt } from './feedback-prompts'

test('buildLessonFeedbackAdjustmentPrompt interpolates feedback context', () => {
  const prompt = buildLessonFeedbackAdjustmentPrompt({
    lessonTitle: 'Next.jsの基礎',
    difficultyRating: 4,
    clarityRating: 2,
    comment: '前提知識が足りなかった',
  })

  assert.match(prompt, /あなたは学習プラン調整アドバイザーです。/)
  assert.match(prompt, /## フィードバック内容/)
  assert.match(prompt, /レッスン: Next\.jsの基礎/)
  assert.match(prompt, /難易度評価: 4\/5/)
  assert.match(prompt, /理解度評価: 2\/5/)
  assert.match(prompt, /コメント: 前提知識が足りなかった/)
  assert.match(prompt, /## 回答フォーマット/)
  assert.match(prompt, /```json/)
})

test('buildLessonFeedbackAdjustmentPrompt drops comment line when null', () => {
  const prompt = buildLessonFeedbackAdjustmentPrompt({
    lessonTitle: 'T',
    difficultyRating: 3,
    clarityRating: 4,
    comment: null,
  })

  assert.ok(!prompt.includes('コメント:'))
})

test('buildLessonFeedbackAdjustmentPrompt embeds personalization block', () => {
  const prompt = buildLessonFeedbackAdjustmentPrompt({
    lessonTitle: 'T',
    difficultyRating: 3,
    clarityRating: 3,
    comment: null,
    personalizationBlock: '## 学習者プロファイル\nレベル: 初級',
  })

  assert.ok(prompt.includes('## 学習者プロファイル\nレベル: 初級'))
})
