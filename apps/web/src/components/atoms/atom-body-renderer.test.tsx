import type { ComponentProps } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { buildReflectionPromptMock } = vi.hoisted(() => ({
  buildReflectionPromptMock: vi.fn(() => 'personalized prompt'),
}))

function MockDiv({ children, ...props }: ComponentProps<'div'>) {
  return <div {...props}>{children}</div>
}

vi.mock('@school/ui/card', () => ({
  Card: MockDiv,
  CardContent: MockDiv,
  CardHeader: MockDiv,
  CardTitle: MockDiv,
}))

vi.mock('@school/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

vi.mock('@/components/ui/info-tooltip', () => ({
  InfoTooltip: () => null,
}))

vi.mock('@/components/lesson/block-renderer/reflection-block', () => ({
  ReflectionBlock: ({ personalizedPrompt }: { personalizedPrompt?: string }) => (
    <div>{personalizedPrompt}</div>
  ),
}))

vi.mock('@/lib/lessons/reflection-prompt-builder', () => ({
  buildReflectionPrompt: buildReflectionPromptMock,
}))

import { AtomBodyRenderer } from './atom-body-renderer'

const baseAtom = {
  deliverable: { type: 'config_file', validation: 'basic_manual_check_v1' },
  evidence: ['code_diff'],
  mediaSlots: ['screen_capture'],
}

describe('AtomBodyRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildReflectionPromptMock.mockReturnValue('personalized prompt')
  })

  it('passes the section prompt text into buildReflectionPrompt when the reflection section has a custom question', () => {
    render(
      <AtomBodyRenderer
        atom={{
          ...baseAtom,
          sections: [
            {
              id: 'other',
              title: '振り返り',
              markdown: '今回の学びで、次の制作タスクに持ち込める判断基準は何ですか？\n- 具体例も添えてください',
            },
          ],
        }}
        learnerBlockers={['環境構築で止まった']}
        recentFeedback="次の一手が曖昧だった"
      />,
    )

    expect(buildReflectionPromptMock).toHaveBeenCalledTimes(1)
    expect(buildReflectionPromptMock).toHaveBeenCalledWith({
      atomPrompt: '今回の学びで、次の制作タスクに持ち込める判断基準は何ですか？',
      blockers: ['環境構築で止まった'],
      recentFeedback: '次の一手が曖昧だった',
    })
  })

  it('falls back to the generic prompt when the reflection section does not contain a clear prompt', () => {
    render(
      <AtomBodyRenderer
        atom={{
          ...baseAtom,
          sections: [
            {
              id: 'other',
              title: '振り返り',
              markdown: '- うまくいった点:\n- 次回改善したい点:',
            },
          ],
        }}
        learnerBlockers={['環境構築で止まった']}
      />,
    )

    expect(buildReflectionPromptMock).toHaveBeenCalledTimes(1)
    expect(buildReflectionPromptMock).toHaveBeenCalledWith({
      atomPrompt: '今回の学びを振り返り、うまくいった点と次に改善したい点を整理してみましょう。',
      blockers: ['環境構築で止まった'],
      recentFeedback: undefined,
    })
  })

  it('does not treat instructional sections that merely mention 振り返り as reflection sections', () => {
    render(
      <AtomBodyRenderer
        atom={{
          ...baseAtom,
          sections: [
            {
              id: 'other',
              title: 'ステップ2：AIに振り返りを手伝ってもらう',
              markdown: '以下の質問を AI に投げてみましょう。',
            },
            {
              id: 'other',
              title: '振り返りを深める',
              markdown: '話題を深掘りするためのフォローアップ質問例。',
            },
          ],
        }}
        learnerBlockers={['環境構築で止まった']}
        recentFeedback="次の一手が曖昧だった"
      />,
    )

    expect(buildReflectionPromptMock).not.toHaveBeenCalled()
  })
})
