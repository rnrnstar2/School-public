import { describe, expect, it } from 'vitest'

import {
  buildAsk2ActionPromptMessages,
  buildFallbackNextQuestion,
} from './ask2action'

describe('ask2action prompts', () => {
  it('documents the single-question JSON contract with learner context', () => {
    const messages = buildAsk2ActionPromptMessages({
      goalTitle: 'ポートフォリオサイトを公開する',
      goalDescription: 'まずはトップページを出したい',
      nodes: [
        {
          label: 'トップページの情報設計を決める',
          status: 'in_progress',
          ownerType: 'user',
          nodeType: 'task',
        },
      ],
      learnerState: {
        targetOutcome: '公開 URL を出す',
        skillLevel: 'beginner',
        blockers: ['手順が不明'],
      },
      mentorMemories: [
        {
          title: 'hero を先に決める',
          bullets: ['ファーストビューの訴求から固める'],
        },
      ],
      contextSnippets: [
        {
          sourceType: 'doc',
          content: '完成形は 1 ページの LP',
        },
      ],
      lastAnswer: '手順が不明',
    })

    expect(messages.system).toContain('JSON オブジェクトのみ')
    expect(messages.system).toContain('`question`, `choices`, `freeform_hint`')
    expect(messages.user).toContain('Goal: ポートフォリオサイトを公開する')
    expect(messages.user).toContain('Blockers: 手順が不明')
    expect(messages.user).toContain('Last answer: 手順が不明')
    expect(messages.user).toContain('トップページの情報設計を決める')
  })

  it('builds deterministic fallback questions for first turn and follow-up', () => {
    expect(buildFallbackNextQuestion()).toMatchObject({
      question: '今、何に迷っていますか？',
      choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
    })

    expect(buildFallbackNextQuestion('手順が不明')).toMatchObject({
      question: 'その答えを踏まえて、次にどこを整理したいですか？',
      choices: ['優先順位を決めたい', '次の手順を知りたい', 'ツール選びを固めたい', '自由入力'],
    })
  })
})
