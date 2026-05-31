import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildSuggestedQuestions,
  TEST_ONLY,
} from '@/lib/mentor/suggested-questions'

describe('buildSuggestedQuestions', () => {
  it('returns lesson-aware questions when lesson context is present', () => {
    const questions = buildSuggestedQuestions({
      lessonContext: {
        id: 'atom.web-builder.forms',
        title: 'フォーム送信を実装する',
      },
      blockers: ['fetch のエラー処理が整理できない'],
      memoryBullets: ['フォーム送信後の状態管理で迷っていた'],
      goalText: '問い合わせフォームを仕上げたい',
    })

    expect(questions).toHaveLength(3)
    expect(questions[0]).toContain('フォーム送信を実装する')
    expect(questions[0]).toContain('fetch のエラー処理が整理できない')
    expect(questions[1]).toContain('フォーム送信後の状態管理で迷っていた')
    expect(questions[2]).toContain('問い合わせフォームを仕上げたい')
  })

  it('returns lesson-focused questions even when blockers are absent', () => {
    const questions = buildSuggestedQuestions({
      lessonContext: {
        id: 'atom.web-builder.auth',
        title: 'ログイン画面を作る',
      },
      blockers: [],
      memoryBullets: [],
      goalText: 'ログイン導線を完成させたい',
    })

    expect(questions).toHaveLength(3)
    expect(questions[0]).toContain('ログイン画面を作る')
    expect(questions[0]).toContain('ログイン導線を完成させたい')
    expect(questions[1]).toContain('ログイン画面を作る')
    expect(questions.join('\n')).not.toContain('つまずいた')
  })

  it('falls back to the generic three questions when context is absent', () => {
    const questions = buildSuggestedQuestions({
      lessonContext: null,
      blockers: [],
      memoryBullets: [],
      goalText: '',
    })

    expect(questions).toEqual([...TEST_ONLY.FALLBACK_SUGGESTED_QUESTIONS])
  })

  it('is deterministic for identical input', () => {
    const input = {
      lessonContext: {
        id: 'atom.web-builder.deploy',
        title: 'サイトを公開する',
      },
      blockers: ['環境変数の切り分けが不安'],
      memoryBullets: ['デプロイ前の確認項目を整理したい'],
      goalText: '公開まで進めたい',
    }

    expect(buildSuggestedQuestions(input)).toEqual(buildSuggestedQuestions(input))
  })

  it('does not reference LLM completion helpers in the new source files', () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../../',
    )
    const files = [
      path.join(repoRoot, 'apps/web/src/lib/mentor/suggested-questions.ts'),
      path.join(repoRoot, 'apps/web/src/app/api/planner/mentor-chat/suggested-questions/route.ts'),
    ]

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/streamCompletion|anthropic/iu)
    }
  })
})
