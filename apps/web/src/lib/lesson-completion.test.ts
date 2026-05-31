import assert from 'node:assert/strict'
import test from 'node:test'
import { filterIncompleteLessons, resolveRecommendedLessonId } from './lesson-completion'

const lessons = [
  { lessonId: 'lesson-1', title: 'Lesson 1' },
  { lessonId: 'lesson-2', title: 'Lesson 2' },
  { lessonId: 'lesson-3', title: 'Lesson 3' },
]

test('filterIncompleteLessons excludes completed lesson ids', () => {
  const completedLessonIds = new Set(['lesson-1', 'lesson-3'])

  assert.deepEqual(filterIncompleteLessons(lessons, completedLessonIds), [
    { lessonId: 'lesson-2', title: 'Lesson 2' },
  ])
})

test('resolveRecommendedLessonId falls back to the next incomplete lesson', () => {
  const completedLessonIds = new Set(['lesson-1'])

  assert.equal(
    resolveRecommendedLessonId('lesson-1', lessons.slice(0, 2), lessons, completedLessonIds),
    'lesson-2'
  )
})

test('resolveRecommendedLessonId returns null when every candidate is completed', () => {
  const completedLessonIds = new Set(['lesson-1', 'lesson-2', 'lesson-3'])

  assert.equal(resolveRecommendedLessonId('lesson-1', lessons.slice(0, 2), lessons, completedLessonIds), null)
})
