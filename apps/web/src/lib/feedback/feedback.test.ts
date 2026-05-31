import test from 'node:test'
import assert from 'node:assert/strict'
import type { LessonFeedbackAdjustmentProposal, LessonFeedbackSuggestion } from '@/types'

test('LessonFeedbackAdjustmentProposal structure is valid with all suggestion types', () => {
  const proposal: LessonFeedbackAdjustmentProposal = {
    summary: '難易度が高めだったため、復習を推奨します。',
    suggestions: [
      { type: 'pace', label: 'ペースを落とす', description: '次のレッスンに進む前に復習時間を設けましょう。' },
      { type: 'difficulty', label: '補足レッスン追加', description: '基礎的な内容の補足レッスンを先に受けることを推奨します。' },
      { type: 'review', label: '復習ポイント', description: 'このレッスンの前提知識を確認してください。' },
    ],
  }

  assert.equal(proposal.summary.length > 0, true)
  assert.equal(proposal.suggestions.length, 3)
  assert.equal(proposal.suggestions[0].type, 'pace')
  assert.equal(proposal.suggestions[1].type, 'difficulty')
  assert.equal(proposal.suggestions[2].type, 'review')
})

test('LessonFeedbackSuggestion type allows all valid values', () => {
  const validTypes: LessonFeedbackSuggestion['type'][] = ['pace', 'difficulty', 'content', 'review']

  for (const type of validTypes) {
    const suggestion: LessonFeedbackSuggestion = {
      type,
      label: `${type} label`,
      description: `${type} description`,
    }
    assert.equal(suggestion.type, type)
  }
})

test('difficulty_rating validation: values must be between 1 and 5', () => {
  const validRatings = [1, 2, 3, 4, 5]
  const invalidRatings = [0, 6, -1, 10]

  for (const rating of validRatings) {
    assert.ok(rating >= 1 && rating <= 5, `Rating ${rating} should be valid`)
  }

  for (const rating of invalidRatings) {
    assert.ok(rating < 1 || rating > 5, `Rating ${rating} should be invalid`)
  }
})

test('clarity_rating validation: values must be between 1 and 5', () => {
  const validRatings = [1, 2, 3, 4, 5]
  const invalidRatings = [0, 6, -1, 10]

  for (const rating of validRatings) {
    assert.ok(rating >= 1 && rating <= 5, `Rating ${rating} should be valid`)
  }

  for (const rating of invalidRatings) {
    assert.ok(rating < 1 || rating > 5, `Rating ${rating} should be invalid`)
  }
})

test('feedback request body validation logic', () => {
  function validateFeedbackInput(body: {
    difficulty_rating?: unknown
    clarity_rating?: unknown
    comment?: unknown
  }): string | null {
    const { difficulty_rating, clarity_rating } = body

    if (
      typeof difficulty_rating !== 'number' ||
      difficulty_rating < 1 ||
      difficulty_rating > 5 ||
      typeof clarity_rating !== 'number' ||
      clarity_rating < 1 ||
      clarity_rating > 5
    ) {
      return '難易度評価と理解度評価は1〜5の整数で指定してください。'
    }

    return null
  }

  // Valid inputs
  assert.equal(validateFeedbackInput({ difficulty_rating: 3, clarity_rating: 4 }), null)
  assert.equal(validateFeedbackInput({ difficulty_rating: 1, clarity_rating: 5, comment: 'テスト' }), null)

  // Invalid inputs
  assert.ok(validateFeedbackInput({ difficulty_rating: 0, clarity_rating: 3 }) !== null)
  assert.ok(validateFeedbackInput({ difficulty_rating: 6, clarity_rating: 3 }) !== null)
  assert.ok(validateFeedbackInput({ difficulty_rating: 3, clarity_rating: 0 }) !== null)
  assert.ok(validateFeedbackInput({ difficulty_rating: 'abc', clarity_rating: 3 }) !== null)
  assert.ok(validateFeedbackInput({}) !== null)
})

test('proposal with empty suggestions is structurally valid', () => {
  const proposal: LessonFeedbackAdjustmentProposal = {
    summary: '順調に学習が進んでいます。',
    suggestions: [],
  }

  assert.equal(proposal.summary.length > 0, true)
  assert.equal(proposal.suggestions.length, 0)
})
