import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPlanHref, buildLessonHref, buildLessonLibraryHref } from '@/lib/planner/task-links'

test('buildPlanHref returns the canonical plan entrypoint', () => {
  assert.equal(buildPlanHref(), '/plan')
})

test('buildLessonHref keeps goal-first lesson routing intact', () => {
  assert.equal(
    buildLessonHref('lesson-ai-auto-001', { goal: '自社の問い合わせ対応をAIで自動化したい' }),
    '/lessons/lesson-ai-auto-001?goal=%E8%87%AA%E7%A4%BE%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E5%AF%BE%E5%BF%9C%E3%82%92AI%E3%81%A7%E8%87%AA%E5%8B%95%E5%8C%96%E3%81%97%E3%81%9F%E3%81%84'
  )
})

test('buildLessonLibraryHref keeps task context query params', () => {
  assert.equal(
    buildLessonLibraryHref({ goal: '自社の問い合わせ対応をAIで自動化したい', trackId: 'automation' }),
    '/lessons?goal=%E8%87%AA%E7%A4%BE%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E5%AF%BE%E5%BF%9C%E3%82%92AI%E3%81%A7%E8%87%AA%E5%8B%95%E5%8C%96%E3%81%97%E3%81%9F%E3%81%84&trackId=automation'
  )
})
