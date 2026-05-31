import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLessonPreferenceDirective } from './lesson-preference-policy'

test('buildLessonPreferenceDirective includes lesson references and rules', () => {
  const directive = buildLessonPreferenceDirective(
    [
      { id: 'lesson-1', title: 'Claude Code セットアップ', summary: 'インストール手順' },
      { id: 'lesson-2', title: '環境変数の設定', summary: 'PATH と API キー' },
    ],
    'Claude Code のインストール',
  )

  assert.match(directive, /既存レッスン優先ポリシー/)
  assert.match(directive, /lesson-1/)
  assert.match(directive, /Claude Code セットアップ/)
  assert.match(directive, /インストール手順/)
  assert.match(directive, /長文の解説を自前で生成する前に/)
})
