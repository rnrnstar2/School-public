import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReflectionPrompt } from '../reflection-prompt-builder'

describe('buildReflectionPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefixes the first blocker when blockers are present', () => {
    expect(
      buildReflectionPrompt({
        atomPrompt: '今回の学びを振り返ってみましょう。',
        blockers: ['環境構築で止まった'],
      }),
    ).toBe('〈環境構築で止まった〉を踏まえて、今回の学びを振り返ってみましょう。')
  })

  it('falls back to the original atom prompt when blockers and feedback are empty', () => {
    expect(
      buildReflectionPrompt({
        atomPrompt: '今回の学びを振り返ってみましょう。',
        blockers: [],
        recentFeedback: null,
      }),
    ).toBe('今回の学びを振り返ってみましょう。')
  })

  it('uses only the first non-empty blocker when multiple blockers exist', () => {
    expect(
      buildReflectionPrompt({
        atomPrompt: '次に試したいことを書き出してみましょう。',
        blockers: ['  デプロイで止まった  ', '認証まわりが曖昧'],
      }),
    ).toBe('〈デプロイで止まった〉を踏まえて、次に試したいことを書き出してみましょう。')
  })

  it('weaves recent feedback into the prompt when blockers are absent', () => {
    expect(
      buildReflectionPrompt({
        atomPrompt: '今回の学びを振り返ってみましょう。',
        recentFeedback: '説明は分かったが、次の一手が曖昧だった',
      }),
    ).toBe(
      '直近のフィードバック「説明は分かったが、次の一手が曖昧だった」も踏まえて、今回の学びを振り返ってみましょう。',
    )
  })

  it('stays pure and does not invoke network helpers', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    buildReflectionPrompt({
      atomPrompt: '今回の学びを振り返ってみましょう。',
      blockers: ['手順が曖昧だった'],
      recentFeedback: '具体例がもう少しほしかった',
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
