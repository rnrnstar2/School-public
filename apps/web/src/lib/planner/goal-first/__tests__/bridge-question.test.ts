import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attachBridgeQuestionToNextAction, buildBridgeQuestion } from '../bridge-question'

describe('buildBridgeQuestion', () => {
  it('builds the canonical lesson bridge question', () => {
    expect(
      buildBridgeQuestion({
        goalText: 'ポートフォリオサイトを公開したい',
        lessonTitle: 'HTML基礎',
      }),
    ).toBe(
      '「ポートフォリオサイトを公開したい」を達成するために、「HTML基礎」ではどんな問いが解けますか?',
    )
  })

  it('returns undefined when goalText or lessonTitle is empty', () => {
    expect(
      buildBridgeQuestion({
        goalText: '',
        lessonTitle: 'HTML基礎',
      }),
    ).toBeUndefined()

    expect(
      buildBridgeQuestion({
        goalText: 'ポートフォリオサイトを公開したい',
        lessonTitle: '   ',
      }),
    ).toBeUndefined()
  })
})

describe('attachBridgeQuestionToNextAction', () => {
  it('attaches bridgeQuestion only for lesson next actions', () => {
    expect(
      attachBridgeQuestionToNextAction(
        {
          type: 'lesson',
          lessonId: 'lesson-001',
          nodeId: 'node-001',
          message: 'HTML基礎',
        },
        { goalText: 'ポートフォリオサイトを公開したい' },
      ),
    ).toMatchObject({
      type: 'lesson',
      bridgeQuestion:
        '「ポートフォリオサイトを公開したい」を達成するために、「HTML基礎」ではどんな問いが解けますか?',
    })

    expect(
      attachBridgeQuestionToNextAction(
        {
          type: 'blocked',
          message: 'まず前提レッスンを完了してください',
        },
        { goalText: 'ポートフォリオサイトを公開したい' },
      ),
    ).toEqual({
      type: 'blocked',
      message: 'まず前提レッスンを完了してください',
    })
  })

  it('does not introduce LLM or network calls in the bridge helper source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/planner/goal-first/bridge-question.ts'),
      'utf8',
    )

    expect(source).not.toMatch(
      /openai|anthropic|@ai-sdk|fetch\(|generateText|streamText|responses\.create/i,
    )
  })
})
